import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/kysely.js';
import { requireRole } from '../../middleware/requireRole.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { AppError } from '../../utils/errors.js';
import { distributeContacts, importContactsFromExcel } from './import.service.js';

const DistributeSchema = z.object({
  campaignId: z.coerce.number().int().positive(),
  agentIds: z.array(z.coerce.number().int().positive()).min(1),
});

export async function contactsRoutes(app: FastifyInstance) {
  // Solo el admin importa y reparte bases.
  app.post('/api/contacts/import', { preHandler: requireRole('admin') }, async (request, reply) => {
    const parts = request.parts();
    let campaignId: number | undefined;
    let agentId: number | undefined;
    let fileBuffer: Buffer | undefined;
    let fileName = 'archivo.xlsx';

    for await (const part of parts) {
      if (part.type === 'file') {
        fileBuffer = await part.toBuffer();
        fileName = part.filename;
      } else if (part.fieldname === 'agentId') {
        agentId = Number(part.value);
      } else if (part.fieldname === 'campaignId') {
        campaignId = Number(part.value);
      }
    }

    if (!campaignId || !agentId || !fileBuffer) {
      throw new AppError(400, 'Falta archivo, campaignId o agentId.', 'MISSING_FIELDS');
    }

    z.object({campaignId:z.number().int().positive(),agentId:z.number().int().positive()}).parse({campaignId,agentId});
    const summary = await importContactsFromExcel({
      fileBuffer,
      agentId,
      fileName,
      campaignId,
      userId: request.session.user!.userId,
    });

    return reply.send(summary);
  });

  app.post('/api/contacts/distribute', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = DistributeSchema.parse(request.body);
    const result = await distributeContacts({
      campaignId: body.campaignId,
      agentIds: body.agentIds,
      userId: request.session.user!.userId,
    });
    return reply.send(result);
  });

  app.get('/api/contacts/:clientId', { preHandler: requireAuth }, async request => {
    const {clientId}=z.object({clientId:z.coerce.number().int().positive()}).parse(request.params);
    const {campaignId}=z.object({campaignId:z.coerce.number().int().positive()}).parse(request.query);
    let query=db.selectFrom('vw_contactos_disponibles').selectAll().where('client_id','=',clientId).where('campaign_id','=',campaignId);
    if(request.session.user!.role!=='admin') query=query.where('agent_id','=',request.session.user!.userId);
    const client=await query.executeTakeFirst();
    if(!client) throw new AppError(404,'Contacto no disponible.','NOT_FOUND');
    const contacts=await db.selectFrom('contact_persons').selectAll().where('client_id','=',clientId).where('is_active','=',true).execute();
    const ids=contacts.map(c=>c.contact_id);
    return {client, contacts, phones: ids.length ? await db.selectFrom('phone_numbers').selectAll().where('contact_id','in',ids).where('is_active','=',true).execute():[], emails:ids.length ? await db.selectFrom('email_addresses').selectAll().where('contact_id','in',ids).where('is_active','=',true).execute():[]};
  });
  // Un agente ve sus propios contactos disponibles; el admin puede ver los de cualquiera.
  app.get('/api/contacts/available', { preHandler: requireAuth }, async (request, reply) => {
    const query = z
      .object({
        campaignId: z.coerce.number().int().positive(),
        agentId: z.coerce.number().int().positive().optional(),
      })
      .parse(request.query);

    const user = request.session.user!;
    const agentId = user.role === 'admin' ? query.agentId : user.userId;
    if (!agentId) {
      throw new AppError(400, 'Especifica agentId.', 'MISSING_AGENT');
    }

    const rows = await db
      .selectFrom('vw_contactos_disponibles')
      .selectAll()
      .where('campaign_id', '=', query.campaignId)
      .where('agent_id', '=', agentId)
      .execute();

    return reply.send({ contacts: rows });
  });
}
