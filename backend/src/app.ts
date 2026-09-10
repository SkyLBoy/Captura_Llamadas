import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { registerSession } from './plugins/session.js';
import { AppError, translatePgError } from './utils/errors.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { contactsRoutes } from './modules/contacts/contacts.routes.js';
import { callsRoutes } from './modules/calls/calls.routes.js';
import { surveysRoutes } from './modules/surveys/surveys.routes.js';
import { reportsRoutes } from './modules/reports/reports.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Datos invalidos.', details: err.issues },
      });
    }

    if (err instanceof AppError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
    }

    // Errores que vienen de pg (violaciones, triggers, etc.)
    const translated = translatePgError(err);
    return reply.status(translated.status).send({ error: { code: translated.code, message: translated.message } });
  });

  await registerSession(app);
  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB, suficiente para bases de contactos en Excel
  });

  await app.register(authRoutes);
  await app.register(contactsRoutes);
  await app.register(callsRoutes);
  await app.register(surveysRoutes);
  await app.register(reportsRoutes);
  await app.register(adminRoutes);

  app.get('/api/health', async () => ({ ok: true }));

  // Manejador de errores centralizado: aqui es donde los RAISE EXCEPTION en
  // espanol de los triggers del schema llegan traducidos a una respuesta
  // HTTP consistente { error: { code, message } }.


  return app;
}
