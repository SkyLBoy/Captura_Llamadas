import type { DatabaseError } from 'pg';

// Error de aplicacion con codigo HTTP explicito, para no adivinar en cada ruta.
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'APP_ERROR',
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Codigos de error de Postgres que nos interesa distinguir.
// https://www.postgresql.org/docs/current/errcodes-appendix.html
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_CHECK_VIOLATION = '23514';
const PG_RAISE_EXCEPTION = 'P0001'; // usado por RAISE EXCEPTION en las funciones del schema

/**
 * Convierte un error crudo de `pg` (lanzado por un trigger o constraint del
 * schema) en un AppError entendible. Muchos de los RAISE EXCEPTION del
 * schema.sql ya traen el mensaje en espanol y lo suficientemente claro para
 * mostrarlo directo al agente (ej. "Cliente en Blacklist",
 * "No se permite reabrir un intento cerrado"), asi que los reusamos tal cual.
 */
export function translatePgError(err: unknown): AppError {
  const pgErr = err as Partial<DatabaseError> & { code?: string; message?: string };

  if (pgErr?.code === '42P01' && /contact_finalizations|vw_contactos_finalizados/.test(pgErr.message ?? '')) {
    return new AppError(503, 'Falta aplicar la migración 003_contact_finalizations.sql en PostgreSQL.', 'FINALIZATIONS_MIGRATION_REQUIRED');
  }

  if (pgErr?.code === PG_RAISE_EXCEPTION && pgErr.message) {
    // Mensajes de negocio explicitos de los triggers/funciones del schema.
    return new AppError(409, pgErr.message, 'BUSINESS_RULE');
  }

  if (pgErr?.code === PG_UNIQUE_VIOLATION) {
    return new AppError(409, 'El registro ya existe (viola una restriccion de unicidad).', 'DUPLICATE');
  }

  if (pgErr?.code === PG_FOREIGN_KEY_VIOLATION) {
    return new AppError(400, 'Referencia invalida: el registro relacionado no existe o no corresponde a esta campana.', 'INVALID_REFERENCE');
  }

  if (pgErr?.code === PG_CHECK_VIOLATION) {
    return new AppError(400, 'Los datos no cumplen una regla del modelo (revisa los campos enviados).', 'CHECK_VIOLATION');
  }

  if (err instanceof AppError) return err;

  // Error no identificado: no exponemos detalles internos al cliente.
  // eslint-disable-next-line no-console
  console.error('Error no traducido:', err);
  return new AppError(500, 'Ocurrio un error inesperado en el servidor.', 'INTERNAL');
}
