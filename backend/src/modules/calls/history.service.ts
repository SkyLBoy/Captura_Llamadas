import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { AppError } from '../../utils/errors.js';

export const HistoryQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Selecciona una fecha válida.'),
  campaignId: z.coerce.number().int().positive().optional(),
  agentId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});

export async function getDailyHistory(query: z.infer<typeof HistoryQuerySchema>, user: { userId: number; role: string }) {
  if (user.role !== 'admin' && query.agentId !== undefined && query.agentId !== user.userId) {
    throw new AppError(403, 'Solo puedes consultar tu propio historial.', 'FORBIDDEN');
  }
  const agentId = user.role === 'admin' ? query.agentId ?? null : user.userId;
  const params = [query.date, agentId, query.campaignId ?? null];
  // Compare timestamptz bounds, so the day is always the local Hermosillo day.
  const where = `a.call_start >= ($1::date::timestamp AT TIME ZONE 'America/Hermosillo')
    AND a.call_start < (($1::date + 1)::timestamp AT TIME ZONE 'America/Hermosillo')
    AND ($2::int IS NULL OR a.agent_id=$2) AND ($3::int IS NULL OR a.campaign_id=$3)`;
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const summary = (await connection.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE a.state='closed')::int AS closed,
      count(*) FILTER (WHERE a.state='open')::int AS open,
      coalesce(sum(extract(epoch from a.duration_sec)) FILTER (WHERE a.state='closed'),0)::float8 AS "durationSeconds"
      FROM call_attempts a WHERE ${where}`, params)).rows[0];
    const pageCount = Math.max(1, Math.ceil(summary.total / 25));
    const page = Math.min(query.page, pageCount);
    const calls = (await connection.query(`SELECT a.attempt_id AS id, c.name AS campaign,
      a.agent_name_snapshot AS agent, a.client_key_snapshot AS "clientKey",
      a.business_name_snapshot AS "businessName", a.contact_name_snapshot AS person,
      a.dialed_number AS phone, a.dialed_extension AS extension,
      a.call_start AS "startedAt", a.call_end AS "endedAt", a.state,
      extract(epoch from a.duration_sec)::float8 AS "durationSeconds",
      a.channel_code_snapshot AS channel, a.disposition_code_snapshot AS disposition, a.notes
      FROM call_attempts a JOIN campaigns c USING(campaign_id) WHERE ${where}
      ORDER BY a.call_start DESC,a.attempt_id DESC LIMIT 25 OFFSET $4`, [...params, (page - 1) * 25])).rows;
    const scope = user.role === 'admin' ? null : user.userId;
    const campaigns = (await connection.query(`SELECT DISTINCT c.campaign_id AS id,c.name
      FROM call_attempts a JOIN campaigns c USING(campaign_id)
      WHERE ($1::int IS NULL OR a.agent_id=$1) ORDER BY c.name`, [scope])).rows;
    const agents = user.role === 'admin' ? (await connection.query(`SELECT DISTINCT u.user_id AS id,u.full_name AS name
      FROM call_attempts a JOIN users u ON u.user_id=a.agent_id ORDER BY u.full_name,u.user_id`)).rows : [];
    await connection.query('COMMIT');
    return { summary, calls, campaigns, agents, page, pageCount, date: query.date };
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  } finally { connection.release(); }
}
