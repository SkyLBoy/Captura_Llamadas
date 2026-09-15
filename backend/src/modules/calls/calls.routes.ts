import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../middleware/requireAuth.js';
import { db } from '../../db/kysely.js';
import { closeCall, openCall } from './calls.service.js';
import { getDailyHistory, HistoryQuerySchema } from './history.service.js';

const OpenCallSchema = z.object({
  idempotencyKey: z.string().uuid(),
  campaignId: z.coerce.number().int().positive(),
  assignmentId: z.coerce.number().int().positive(),
  clientId: z.coerce.number().int().positive(),
  contactId: z.coerce.number().int().positive().nullable().optional(),
  dialedNumber: z.string().min(1),
  dialedExtension: z.string().optional(),
});

const CloseCallSchema = z.object({
  newData:z.object({businessName:z.string().trim().min(1).optional(),phone:z.string().trim().min(1).optional(),email:z.string().email().optional()}).optional(),
  channelCode: z.string().min(1),
  notes: z.string().optional(),
  survey: z
    .object({
      versionId: z.coerce.number().int().positive(),
      declined: z.boolean(),
      answers: z
        .array(
          z.object({
            questionId: z.coerce.number().int().positive(),
            optionId: z.coerce.number().int().positive().optional(),
            answerText: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

export async function callsRoutes(app: FastifyInstance) {
  app.get('/api/calls/history', { preHandler: requireAuth }, async request =>
    getDailyHistory(HistoryQuerySchema.parse(request.query), request.session.user!));
  app.get('/api/calls/open', { preHandler: requireAuth }, async request => ({
    attempt: await db.selectFrom('call_attempts').selectAll().where('agent_id', '=', request.session.user!.userId).where('state', '=', 'open').executeTakeFirst() ?? null,
  }));
  app.get('/api/catalogs', { preHandler: requireAuth }, async request => {
    const { campaignId } = z.object({ campaignId: z.coerce.number().int().positive() }).parse(request.query);
    return { channels: await db.selectFrom('channels').selectAll().where('campaign_id', '=', campaignId).where('is_active', '=', true).execute(),
      dispositions: await db.selectFrom('dispositions').selectAll().where('campaign_id', '=', campaignId).where('is_active', '=', true).execute() };
  });
  app.get('/api/campaigns', { preHandler: requireAuth }, async () => ({ campaigns: await db.selectFrom('campaigns').selectAll().where('is_active', '=', true).execute() }));
  app.post('/api/calls', { preHandler: requireAuth }, async (request, reply) => {
    const body = OpenCallSchema.parse(request.body);
    const user = request.session.user!;
    const result = await openCall(
      {
        idempotencyKey: body.idempotencyKey,
        agentId: user.userId,
        campaignId: body.campaignId,
        assignmentId: body.assignmentId,
        clientId: body.clientId,
        contactId: body.contactId ?? null,
        dialedNumber: body.dialedNumber,
        dialedExtension: body.dialedExtension ?? null,
      },
      user.userId,
    );
    return reply.status(201).send(result);
  });

  app.post('/api/calls/:attemptId/close', { preHandler: requireAuth }, async (request, reply) => {
    const params = z.object({ attemptId: z.coerce.number().int().positive() }).parse(request.params);
    const body = CloseCallSchema.parse(request.body);
    const user = request.session.user!;

    const result = await closeCall(
      {
        attemptId: params.attemptId,
        agentId: user.userId,
        channelCode: body.channelCode,
        newData:body.newData,
        notes: body.notes ?? null,
        survey: body.survey,
      },
      user.userId,
    );
    return reply.send(result);
  });
}
