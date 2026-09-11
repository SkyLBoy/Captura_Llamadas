import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTransaction } from '../../db/withTransaction.js';
import { db } from '../../db/kysely.js';
import { requireRole } from '../../middleware/requireRole.js';
import { hashPassword } from '../../utils/auth.js';
import { AppError } from '../../utils/errors.js';
import { sql } from 'kysely';
import { startWorkRound } from './rounds.service.js';

const CreateUserSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8),
  fullName: z.string().min(1),
  role: z.enum(['agent', 'admin']),
});

export async function adminRoutes(app: FastifyInstance) {
    app.get(
    '/api/admin/rondas/historial',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { campaignId, agentId } = z.object({
        campaignId: z.coerce.number().int().positive(),
        agentId: z.coerce.number().int().positive(),
      }).parse(request.query);

      const rounds = await db
        .selectFrom('work_rounds')
        .select([
          'round_id',
          'name',
          'started_at',
          'ended_at',
        ])
        .where('campaign_id', '=', campaignId)
        .where('agent_id', '=', agentId)
        .orderBy('started_at', 'desc')
        .orderBy('round_id', 'desc')
        .execute();

      return reply.send({ rounds });
    },
  );
    app.post(
    '/api/admin/rondas',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const body = z.object({
        campaignId: z.number().int().positive(),
        agentId: z.number().int().positive(),
        name: z.string().trim().min(1).max(150),
        expectedRoundId: z.number().int().positive().nullable(),
      }).parse(request.body);

      const result = await startWorkRound(
        body,
        request.session.user!.userId,
      );

      return reply.status(201).send(result);
    },
  );
    app.get(
  '/api/admin/rondas/resumen',
  { preHandler: requireRole('admin') },
  async (request, reply) => {
    const { campaignId, agentId } = z.object({
      campaignId: z.coerce.number().int().positive(),
      agentId: z.coerce.number().int().positive(),
    }).parse(request.query);

    const round = await db
      .selectFrom('work_rounds')
      .select(['round_id', 'name', 'started_at', 'ended_at'])
      .where('campaign_id', '=', campaignId)
      .where('agent_id', '=', agentId)
      .where('ended_at', 'is', null)
      .executeTakeFirst();

    const result = await sql<{
      assigned: number;
      blocked: number;
      inactive: number;
      eligible: number;
    }>`
      SELECT
        COUNT(*)::integer AS assigned,
        COUNT(*) FILTER (
          WHERE b.blacklist_id IS NOT NULL
        )::integer AS blocked,
        COUNT(*) FILTER (
          WHERE b.blacklist_id IS NULL AND NOT c.is_active
        )::integer AS inactive,
        COUNT(*) FILTER (
          WHERE b.blacklist_id IS NULL AND c.is_active
        )::integer AS eligible
      FROM public.contact_assignments AS a
      JOIN public.clients AS c
        ON c.client_id = a.client_id
      LEFT JOIN public.contact_blacklist AS b
        ON b.client_id = a.client_id
        AND b.campaign_id = a.campaign_id
        AND b.ended_at IS NULL
      WHERE a.campaign_id = ${campaignId}
        AND a.agent_id = ${agentId}
        AND a.ended_at IS NULL
    `.execute(db);

    const openCall = await db
      .selectFrom('call_attempts')
      .select('attempt_id')
      .where('agent_id', '=', agentId)
      .where('state', '=', 'open')
      .executeTakeFirst();

    return reply.send({
      round: round ?? null,
      summary: result.rows[0],
      hasOpenCall: Boolean(openCall),
    });
  },
);
  app.get('/api/admin/users', { preHandler: requireRole('admin') }, async () => ({
    users: await db.selectFrom('users').select(['user_id','username','full_name','role','is_active']).orderBy('full_name').execute(),
  }));
  // Canalizaciones que el schema inserto sin disposicion asignada (inactivas
  // a proposito). El admin debe clasificarlas antes de que un agente pueda
  // usarlas para cerrar una llamada.
  app.get('/api/admin/catalogo-pendiente', { preHandler: requireRole('admin') }, async (_request, reply) => {
    const rows = await db.selectFrom('channels as ch').innerJoin('campaigns as c','c.campaign_id','ch.campaign_id')
      .select(['ch.channel_id','ch.campaign_id','ch.code','ch.description','c.name as campaign'])
      .where('ch.disposition_id','is',null).execute();
    return reply.send({ pendientes: rows });
  });

  app.post('/api/admin/canalizaciones/:channelId/clasificar', { preHandler: requireRole('admin') }, async (request, reply) => {
    const params = z.object({ channelId: z.coerce.number().int().positive() }).parse(request.params);
    const body = z.object({ dispositionId: z.coerce.number().int().positive() }).parse(request.body);

    const channel = await db
      .selectFrom('channels')
      .select(['channel_id', 'campaign_id'])
      .where('channel_id', '=', params.channelId)
      .executeTakeFirst();
    if (!channel) throw new AppError(404, 'Canalizacion no encontrada.', 'CHANNEL_NOT_FOUND');

    await withTransaction(request.session.user!.userId, trx => trx
      .updateTable('channels')
      .set({ disposition_id: body.dispositionId, is_active: true })
      .where('channel_id', '=', channel.channel_id)
      .execute());

    return reply.send({ ok: true });
  });

  app.get('/api/admin/blacklist', { preHandler: requireRole('admin') }, async (request, reply) => {
    const query = z.object({ campaignId: z.coerce.number().int().positive().optional() }).parse(request.query);
    let q = db
      .selectFrom('contact_blacklist as b')
      .innerJoin('clients as c', 'c.client_id', 'b.client_id')
      .select(['b.blacklist_id', 'b.client_id', 'c.clave', 'c.razon_social', 'b.campaign_id', 'b.reason', 'b.started_at', 'b.ended_at'])
      .where('b.ended_at', 'is', null);
    if (query.campaignId) q = q.where('b.campaign_id', '=', query.campaignId);
    const rows = await q.execute();
    return reply.send({ blacklist: rows });
  });

  // Levantar el bloqueo requiere decision explicita del admin (el schema no
  // lo hace automatico: "Una correccion no retira automaticamente un bloqueo").
  app.post('/api/admin/blacklist/:blacklistId/liberar', { preHandler: requireRole('admin') }, async (request, reply) => {
    const params = z.object({ blacklistId: z.coerce.number().int().positive() }).parse(request.params);
    await withTransaction(request.session.user!.userId, trx => trx
      .updateTable('contact_blacklist')
      .set({ ended_at: new Date() })
      .where('blacklist_id', '=', params.blacklistId)
      .execute());
    return reply.send({ ok: true });
  });

  app.post('/api/admin/users', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = CreateUserSchema.parse(request.body);
    const passwordHash = await hashPassword(body.password);
    const user = await withTransaction(request.session.user!.userId, trx => trx
      .insertInto('users')
      .values({
        username: body.username,
        password_hash: passwordHash,
        full_name: body.fullName,
        role: body.role,
      })
      .returning(['user_id', 'username', 'full_name', 'role'])
      .executeTakeFirstOrThrow());
    return reply.status(201).send({ user });
  });
}
