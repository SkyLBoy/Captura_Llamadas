import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../db/kysely.js';
import { verifyPassword } from '../../utils/auth.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { AppError } from '../../utils/errors.js';

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (request, reply) => {
    const { username, password } = LoginSchema.parse(request.body);

    const user = await db
      .selectFrom('users')
      .select(['user_id', 'username', 'password_hash', 'full_name', 'role', 'is_active'])
      .where('username', '=', username)
      .executeTakeFirst();

    // Mensaje generico a proposito: no revelar si fue el usuario o el password.
    if (!user || !user.is_active) {
      throw new AppError(401, 'Usuario o contrasena incorrectos.', 'INVALID_CREDENTIALS');
    }

    const valid = await verifyPassword(user.password_hash, password);
    if (!valid) {
      throw new AppError(401, 'Usuario o contrasena incorrectos.', 'INVALID_CREDENTIALS');
    }

    await request.session.regenerate();
    request.session.user = {
      userId: user.user_id,
      username: user.username,
      fullName: user.full_name,
      role: user.role,
    };

    return reply.send({
      user: {
        id: user.user_id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
      },
    });
  });

  app.post('/api/auth/logout', async (request, reply) => {
    await request.session.destroy();
    return reply.send({ ok: true });
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    if (!request.session.user) {
      return reply.status(401).send({ user: null });
    }
    return reply.send({ user: request.session.user });
  });
}
