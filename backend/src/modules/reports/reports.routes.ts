import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../../middleware/requireRole.js';
import { generateMonthlyClosing } from './reports.service.js';

const ClosingQuerySchema = z.object({
  campaignId: z.coerce.number().int().positive(),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export async function reportsRoutes(app: FastifyInstance) {
  // Reportes de cierre: solo el admin los genera y descarga.
  app.get('/api/reports/monthly-closing', { preHandler: requireRole('admin') }, async (request, reply) => {
    const query = ClosingQuerySchema.parse(request.query);
    const { buffer, fileName } = await generateMonthlyClosing(query);

    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
    return reply.send(buffer);
  });
}
