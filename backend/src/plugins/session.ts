import cookie from '@fastify/cookie';
import session from '@fastify/session';
import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';

// Sesion por cookie firmada, en memoria del proceso. Suficiente para una
// app interna en LAN con un puñado de usuarios corriendo en una sola
// instancia de Node. Si algun dia se corre mas de una instancia de Node
// detras de un balanceador, cambiar el `store` por uno en Postgres/Redis.
export async function registerSession(app: FastifyInstance) {
  await app.register(cookie);
  await app.register(session, {
    secret: env.SESSION_SECRET,
    cookieName: 'vincco_sid',
    cookie: {
      secure: env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 10, // 10 horas, cubre un turno laboral
    },
  });
}
