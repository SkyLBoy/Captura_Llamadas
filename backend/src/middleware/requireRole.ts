import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireAuth } from './requireAuth.js';
import { AppError } from '../utils/errors.js';
import type { SessionUser } from '../utils/auth.js';

export function requireRole(...roles: Array<SessionUser['role']>) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    await requireAuth(request, _reply);
    const user = request.session.user;
    if (!user) {
      throw new AppError(401, 'Debes iniciar sesion.', 'UNAUTHENTICATED');
    }
    if (!roles.includes(user.role)) {
      throw new AppError(403, 'No tienes permisos para esta accion.', 'FORBIDDEN');
    }
  };
}
