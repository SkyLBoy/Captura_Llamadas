import 'dotenv/config';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import pg from 'pg';
const directory='backups/silimex-before-real-load-20260915/';
const db=new pg.Client();await db.connect();
let summary;
try {
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 await db.query("SET LOCAL TIME ZONE 'America/Hermosillo'");
 const checks={calls:'SELECT count(*)::int AS n FROM call_attempts',clients:'SELECT count(*)::int AS n FROM clients',activeClients:'SELECT count(*)::int AS n FROM clients WHERE is_active',surveys:"SELECT count(*)::int AS n FROM call_surveys WHERE state='completed'",independent:'SELECT count(*)::int AS n FROM historical_survey_records',monthly:'SELECT sum(total_marcaciones)::int AS n FROM historical_monthly_totals',finalized:'SELECT count(*)::int AS n FROM vw_contactos_finalizados',blacklist:'SELECT count(*)::int AS n FROM contact_blacklist WHERE ended_at IS NULL',almaActive:"SELECT count(*)::int AS n FROM users WHERE username='historico_alma_zambrano' AND is_active",almaAssignments:"SELECT count(*)::int AS n FROM contact_assignments a JOIN users u ON u.user_id=a.agent_id WHERE u.username='historico_alma_zambrano' AND a.ended_at IS NULL",pending:'SELECT count(*)::int AS n FROM vw_contactos_disponibles d JOIN contact_assignments a USING(assignment_id) WHERE NOT EXISTS(SELECT 1 FROM call_attempts c JOIN contact_assignments ca ON ca.assignment_id=c.assignment_id WHERE ca.round_id=a.round_id AND c.client_id=d.client_id)'};
 const expected=JSON.parse(await fs.readFile(directory+'validation.json','utf8')).results;
 const actual={};for(const [name,sql] of Object.entries(checks)){actual[name]=(await db.query(sql)).rows[0].n;assert.equal(actual[name],expected[name],name);}
 const september=(await db.query("SELECT agent_name_snapshot AS agent,count(*)::int AS calls,count(*) FILTER(WHERE duration_issue IS NOT NULL)::int AS invalid_times FROM call_attempts WHERE call_start>='2026-09-01' AND call_start<'2026-09-16' GROUP BY 1 ORDER BY 1")).rows;
 const dates=(await db.query("SELECT min(call_start)::text AS first,max(call_start)::text AS last FROM call_attempts WHERE call_start>='2026-09-01'")).rows[0];
 assert.equal((await db.query("SELECT count(*)::int AS n FROM call_attempts WHERE call_start>='2026-09-16'")).rows[0].n,0,'No dates beyond report cutoff');
 const campaign=(await db.query("SELECT campaign_id FROM campaigns WHERE name='SILIMEX'")).rows[0].campaign_id;
 const integrityQueries={
  missingProvenance:"SELECT count(*)::int AS n FROM call_attempts a LEFT JOIN call_import_provenance p USING(attempt_id) WHERE a.origin='import' AND p.attempt_id IS NULL",
  invalidAssignments:"SELECT count(*)::int AS n FROM contact_assignments a JOIN clients c USING(client_id) JOIN users u ON u.user_id=a.agent_id WHERE a.ended_at IS NULL AND (NOT c.is_active OR NOT u.is_active)",
  duplicateAssignments:'SELECT count(*)::int AS n FROM (SELECT client_id,campaign_id FROM contact_assignments WHERE ended_at IS NULL GROUP BY 1,2 HAVING count(*)>1) d',
  blockedAvailable:'SELECT count(*)::int AS n FROM vw_contactos_disponibles d JOIN contact_blacklist b USING(client_id,campaign_id) WHERE b.ended_at IS NULL',
  finalizedAvailable:'SELECT count(*)::int AS n FROM vw_contactos_disponibles d JOIN vw_contactos_finalizados f USING(client_id,campaign_id)',
  wrongCutDisposition:"SELECT count(*)::int AS n FROM call_attempts WHERE channel_code_snapshot='SE_CORTA_LLAMADA' AND disposition_code_snapshot<>'SEGUIMIENTO'",
  rejectedImports:"SELECT count(*)::int AS n FROM import_detail WHERE result='rejected'",
  pendingSurveys:"SELECT count(*)::int AS n FROM call_surveys WHERE state='pending'",
  mismatchedSurveyEvidence:'SELECT count(*)::int AS n FROM historical_survey_records s JOIN call_attempts a ON a.attempt_id=s.matched_attempt_id WHERE (s.client_id,s.campaign_id,s.agent_id) IS DISTINCT FROM (a.client_id,a.campaign_id,a.agent_id)',
 };
 const integrity={};for(const [name,sql] of Object.entries(integrityQueries)){integrity[name]=(await db.query(sql)).rows[0].n;assert.equal(integrity[name],0,name);}
 const nativeSurveys=(await db.query('SELECT survey_id FROM call_surveys')).rows;
 for(const {survey_id} of nativeSurveys)await db.query('SELECT validate_survey($1)',[survey_id]);
 const septemberSurveys=(await db.query("SELECT (SELECT count(*) FROM call_surveys s JOIN call_attempts a USING(attempt_id) WHERE a.call_start>='2026-09-01' AND a.call_start<'2026-09-16')+(SELECT count(*) FROM historical_survey_records WHERE completed_at>='2026-09-01' AND completed_at<'2026-09-16') AS n")).rows[0].n;
 assert.equal(Number(septemberSurveys),13);
 summary={verifiedAt:new Date().toISOString(),actual,september,dates,campaign,integrity,validatedNativeSurveys:nativeSurveys.length,septemberSurveys:Number(septemberSurveys)};
 await db.query('COMMIT');
} finally {await db.end();}
await fs.writeFile(directory+'live-verification.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary));
