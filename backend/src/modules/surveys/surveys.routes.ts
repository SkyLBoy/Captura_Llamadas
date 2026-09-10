import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { db } from '../../db/kysely.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { AppError } from '../../utils/errors.js';

export async function surveysRoutes(app: FastifyInstance) {
  // Regresa la version vigente (is_active) del cuestionario de una campana,
  // con sus preguntas y opciones en orden -- lo que el frontend necesita
  // para pintar el formulario de encuesta al cerrar una llamada.
  app.get('/api/surveys/active-version', { preHandler: requireAuth }, async (request, reply) => {
    const query = z.object({ campaignId: z.coerce.number().int().positive() }).parse(request.query);

    const version = await db
      .selectFrom('questionnaire_versions')
      .select(['version_id', 'version_name'])
      .where('campaign_id', '=', query.campaignId)
      .where('is_active', '=', true)
      .where(eb=>eb.or([eb('effective_from','is',null),eb('effective_from','<=',sql<string>`(now() AT TIME ZONE 'America/Hermosillo')::date`)]))
      .where(eb=>eb.or([eb('effective_to','is',null),eb('effective_to','>=',sql<string>`(now() AT TIME ZONE 'America/Hermosillo')::date`)]))
      .orderBy('effective_from','desc').orderBy('version_id','desc')
      .executeTakeFirst();

    if (!version) {
      throw new AppError(404, 'No hay una version de cuestionario activa para esta campana.', 'NO_ACTIVE_VERSION');
    }

    const questions = await db
      .selectFrom('questionnaire_questions')
      .selectAll()
      .where('version_id', '=', version.version_id)
      .orderBy('display_order')
      .execute();

    const options = questions.length ? await db
      .selectFrom('questionnaire_options')
      .selectAll()
      .where(
        'question_id',
        'in',
        questions.map((q) => q.question_id),
      )
      .orderBy('display_order')
      .execute() : [];

    return reply.send({
      version,
      questions: questions.map((q) => ({
        ...q,
        options: options.filter((o) => o.question_id === q.question_id),
      })),
    });
  });
}
