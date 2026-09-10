import { Pool } from 'pg';
import { env } from '../config/env.js';

// Un solo pool para toda la app. IMPORTANTE: para peticiones que escriben
// (o que dependen de SET LOCAL / triggers diferidos) nunca usar pool.query()
// suelto -- ver withTransaction.ts. pool.query() aqui solo es apto para
// lecturas sueltas de una sola sentencia (p.ej. vistas de consulta).
export const pool = new Pool({
  host: env.PGHOST,
  port: env.PGPORT,
  database: env.PGDATABASE,
  user: env.PGUSER,
  password: env.PGPASSWORD,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  // Errores en clientes ociosos del pool (conexion caida, etc). No tumban el proceso.
  // eslint-disable-next-line no-console
  console.error('Error inesperado en el pool de Postgres', err);
});
