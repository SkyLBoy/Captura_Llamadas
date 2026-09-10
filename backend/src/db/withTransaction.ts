import { Kysely, PostgresDialect } from 'kysely';
import type { PoolClient } from 'pg';
import type { Database } from './schema-types.js';
import { pool } from './pool.js';

/**
 * Ejecuta `fn` dentro de UNA sola transaccion, en UNA sola conexion,
 * habiendo fijado antes `app.user_id` con SET LOCAL.
 *
 * Por que existe esto y no basta con Kysely normal:
 * - `SET LOCAL app.user_id = ...` solo aplica a la transaccion actual, y
 *   solo tiene efecto si se ejecuta en la MISMA conexion que las demas
 *   sentencias de esa transaccion. Un pool reparte conexiones libremente,
 *   asi que hay que "clavar" un cliente para toda la operacion.
 * - Los triggers CONSTRAINT ... DEFERRABLE INITIALLY DEFERRED (integridad
 *   de encuestas) solo se disparan al hacer COMMIT de la transaccion. Si
 *   cada sentencia usa una transaccion implicita distinta (como hace
 *   pool.query de a una), esos triggers nunca alcanzan a ver el estado
 *   completo (p.ej. llamada cerrada + respuestas guardadas) y truenan o,
 *   peor, no truenan cuando deberian.
 * - audit_log usa `current_setting('app.user_id', true)`, asi que sin este
 *   SET LOCAL toda la auditoria quedaria con changed_by_user_id en NULL.
 *
 * Uso tipico en un endpoint:
 *   await withTransaction(request.session.userId, async (trx) => {
 *     await trx.insertInto('call_attempts').values({...}).execute();
 *   });
 */
export async function withTransaction<T>(
  userId: number | null,
  fn: (trx: Kysely<Database>) => Promise<T>,
): Promise<T> {
  const client: PoolClient = await pool.connect();
  // Kysely "de un solo uso" atada a este cliente especifico, no al pool.
  const trxDb = new Kysely<Database>({
    dialect: new PostgresDialect({ pool: singleClientPool(client) }),
  });

  try {
    await client.query('BEGIN');
    if (userId !== null) {
      // set_config con is_local=true equivale a SET LOCAL pero acepta parametros.
      await client.query("SELECT set_config('app.user_id', $1, true)", [String(userId)]);
    }
    const result = await fn(trxDb);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {
      /* si el rollback falla la conexion ya esta rota; se libera abajo igual */
    });
    throw err;
  } finally {
    await trxDb.destroy();
    client.release();
  }
}

// Kysely quiere un "Pool"-like con connect()/end(); le damos uno que
// siempre regresa el mismo cliente ya abierto y que ignora end()/release,
// porque el ciclo de vida real lo controla withTransaction() arriba.
function singleClientPool(client: PoolClient) {
  return {
    connect: async () => ({
      query: client.query.bind(client),
      release: () => {
        /* no-op: el release real ocurre en el finally de withTransaction */
      },
    }),
    end: async () => {
      /* no-op */
    },
  } as unknown as import('pg').Pool;
}
