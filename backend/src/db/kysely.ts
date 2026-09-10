import { Kysely, PostgresDialect } from 'kysely';
import type { Database } from './schema-types.js';
import { pool } from './pool.js';

// Instancia global de Kysely para LECTURAS (consultas de una sola sentencia,
// vistas, reportes). Para escrituras multi-paso usar withTransaction, que
// crea su propia instancia de Kysely atada a un solo cliente/conexion.
export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});
