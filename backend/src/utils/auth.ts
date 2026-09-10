import argon2 from 'argon2';

// El schema solo dice "el backend usa hashes Argon2/bcrypt" -- usamos argon2id,
// que es la variante recomendada actualmente por el propio proyecto Argon2.
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // hash corrupto o formato desconocido -> tratamos como password invalido
    return false;
  }
}

export interface SessionUser {
  userId: number;
  username: string;
  fullName: string;
  role: 'agent' | 'admin';
}

declare module '@fastify/session' {
  interface FastifySessionObject {
    user?: SessionUser;
  }
}
