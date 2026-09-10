import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db/kysely.js';
import { AppError } from '../utils/errors.js';

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.session.user) {
    throw new AppError(401, 'Debes iniciar sesion.', 'UNAUTHENTICATED');
  }
  const user = await db.selectFrom('users').selectAll().where('user_id', '=', request.session.user.userId).executeTakeFirst();
  if (!user?.is_active) {
    await request.session.destroy();
    throw new AppError(401, 'La cuenta no está activa.', 'UNAUTHENTICATED');
  }
  request.session.user = { userId: user.user_id, username: user.username, fullName: user.full_name, role: user.role };
}
