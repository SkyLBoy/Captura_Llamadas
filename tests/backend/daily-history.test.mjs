import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { PGlite } from '../../tools/pglite/package/dist/index.js';
Object.assign(process.env, { NODE_ENV: 'test', PGHOST: 'localhost', PGPORT: '5432', PGDATABASE: 'isolated_test', PGUSER: 'test', PGPASSWORD: 'test', SESSION_SECRET: 'isolated-test-secret-32-characters-long' });
const engine = new PGlite();
await engine.exec(await fs.readFile(new URL('../../database/schema.sql', import.meta.url), 'utf8'));
const { pool } = await import('../../dist/db/pool.js');
pool.connect = async () => ({ query: async (sql, args) => { const result = await engine.query(sql, args); return { ...result, rowCount: result.rows.length }; }, release() {} });
const { getDailyHistory, HistoryQuerySchema } = await import('../../dist/modules/calls/history.service.js');
try {
  assert.equal(HistoryQuerySchema.safeParse({ date: '2026-02-30' }).success, false);
  assert.equal(HistoryQuerySchema.safeParse({ date: '2026-09-15', page: 0 }).success, false);
  const campaign = (await engine.query("SELECT campaign_id FROM campaigns WHERE name='SILIMEX'")).rows[0].campaign_id;
  const otherCampaign = (await engine.query("SELECT campaign_id FROM campaigns WHERE name='PARTNER DELL'")).rows[0].campaign_id;
  const users = (await engine.query("INSERT INTO users(username,password_hash,full_name,role) VALUES('history-a','unused','Agente A','agent'),('history-b','unused','Agente B','agent') RETURNING user_id")).rows;
  const client = (await engine.query("INSERT INTO clients(source_namespace,clave,razon_social) VALUES('history','H001','Empresa histórica') RETURNING client_id")).rows[0].client_id;
  const channel = (await engine.query("SELECT channel_id FROM channels WHERE campaign_id=$1 AND code='SE_ENVIA_PROMOCION_POR_CORREO'", [campaign])).rows[0].channel_id;
  async function insert(agent, date, state = 'closed') {
    const client = (await engine.query("INSERT INTO clients(source_namespace,clave,razon_social) VALUES('history',$1,'Empresa histórica') RETURNING client_id", [crypto.randomUUID()])).rows[0].client_id;
    const assignment = (await engine.query("INSERT INTO contact_assignments(client_id,campaign_id,agent_id,started_at) VALUES($1,$2,$3,'2026-09-01T00:00:00-07:00') ON CONFLICT DO NOTHING RETURNING assignment_id", [client, campaign, agent])).rows[0]
      ?? (await engine.query('SELECT assignment_id FROM contact_assignments WHERE client_id=$1 AND campaign_id=$2 AND agent_id=$3', [client, campaign, agent])).rows[0];
    await engine.query(`INSERT INTO call_attempts(idempotency_key,assignment_id,campaign_id,client_id,agent_id,dialed_number,origin,state,call_start,call_end,channel_id,notes)
      VALUES($1,$2,$3,$4,$5,'6620000000',CASE WHEN $6::varchar='open' THEN 'live' ELSE 'import' END,$6::varchar,$7::timestamptz,CASE WHEN $6::varchar='closed' THEN $7::timestamptz+interval '60 seconds' END,CASE WHEN $6::varchar='closed' THEN $8::int END,'Nota histórica')`,
      [crypto.randomUUID(), assignment.assignment_id, campaign, client, agent, state, date, channel]);
  }
  const a = users[0].user_id, b = users[1].user_id;
  const empty = await getDailyHistory({ date: '2026-09-15', page: 1 }, { userId: a, role: 'agent' });
  assert.deepEqual(empty.campaigns.map(c => c.name), ['PARTNER DELL', 'SILIMEX'], 'Active campaigns appear before the first call');
  assert.equal(empty.summary.total, 0);
  await insert(a, '2026-09-14T23:59:00-07:00');
  for (let i = 0; i < 26; i++) await insert(a, `2026-09-15T10:${String(i).padStart(2, '0')}:00-07:00`);
  await insert(a, '2026-09-15T23:59:00-07:00', 'open');
  await insert(b, '2026-09-15T11:00:00-07:00');
  await insert(b, '2026-09-16T00:00:00-07:00');
  const input = { date: '2026-09-15', page: 1 };
  const agent = { userId: a, role: 'agent' };
  const own = await getDailyHistory(input, agent);
  assert.equal(own.summary.total, 27);
  assert.equal(own.summary.closed, 26);
  assert.equal(own.summary.open, 1);
  assert.equal(own.summary.durationSeconds, 26 * 60);
  assert.equal(own.calls.length, 25);
  assert.equal(own.calls[0].state, 'open');
  assert.equal(own.calls[0].notes, 'Nota histórica');
  assert.equal(own.agents.length, 0);
  assert.ok(own.campaigns.some(c => c.id === otherCampaign), 'PARTNER DELL remains selectable without calls');
  const emptyDell = await getDailyHistory({ ...input, campaignId: otherCampaign }, agent);
  assert.equal(emptyDell.summary.total, 0);
  assert.equal(emptyDell.calls.length, 0);
  assert.ok(emptyDell.campaigns.some(c => c.id === otherCampaign));
  const second = await getDailyHistory({ ...input, page: 2 }, agent);
  assert.equal(second.calls.length, 2);
  assert.ok(second.calls.every(row => !own.calls.some(first => first.id === row.id)));
  await assert.rejects(getDailyHistory({ ...input, agentId: b }, agent), error => error.statusCode === 403 || error.message.includes('propio historial'));
  const admin = { userId: a, role: 'admin' };
  assert.equal((await getDailyHistory(input, admin)).summary.total, 28);
  assert.equal((await getDailyHistory({ ...input, agentId: b }, admin)).summary.total, 1);
  assert.equal((await getDailyHistory({ ...input, campaignId: otherCampaign }, admin)).summary.total, 0);
  assert.equal((await getDailyHistory({ ...input, date: '2026-09-17' }, admin)).pageCount, 1);
  console.log('PASS historial diario: permisos, filtros, paginación, notas, duración y límites del día en Hermosillo.');
} finally { await pool.end(); await engine.close(); }
