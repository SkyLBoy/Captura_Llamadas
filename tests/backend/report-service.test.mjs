import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {PGlite} from '../../tools/pglite/package/dist/index.js';
Object.assign(process.env,{NODE_ENV:'test',PGHOST:'localhost',PGPORT:'5432',PGDATABASE:'isolated_test',PGUSER:'test',PGPASSWORD:'test',SESSION_SECRET:'isolated-test-secret-32-characters-long'});
const engine=new PGlite();
await engine.exec(await fs.readFile(new URL('../../database/schema.sql',import.meta.url),'utf8'));
const {pool}=await import('../../dist/db/pool.js');
pool.connect=async()=>({query:async(sql,args)=>{const result=await engine.query(sql,args);return {...result,rowCount:result.rows.length};},release(){}});
const {generateMonthlyClosing}=await import('../../dist/modules/reports/reports.service.js');
try {
 const sil=(await engine.query("SELECT campaign_id FROM campaigns WHERE name='SILIMEX'")).rows[0].campaign_id;
 const empty=await generateMonthlyClosing({campaignId:sil,year:2026,month:9});
 assert.ok(empty.buffer.length>0);
 const agent=(await engine.query("INSERT INTO users(username,password_hash,full_name,role) VALUES('report-test','unused','Agente de prueba','agent') RETURNING user_id")).rows[0].user_id;
 const client=(await engine.query("INSERT INTO clients(source_namespace,clave,razon_social,sucursal) VALUES('report-test','TEST001','Empresa de prueba','Hermosillo') RETURNING client_id")).rows[0].client_id;
 const assignment=(await engine.query('INSERT INTO contact_assignments(client_id,campaign_id,agent_id) VALUES($1,$2,$3) RETURNING assignment_id',[client,sil,agent])).rows[0].assignment_id;
 const channel=(await engine.query("SELECT channel_id FROM channels WHERE campaign_id=$1 AND code='SE_ENVIA_PROMOCION_POR_CORREO'",[sil])).rows[0].channel_id;
 async function call(date) {
  return (await engine.query(`INSERT INTO call_attempts(idempotency_key,assignment_id,campaign_id,client_id,agent_id,dialed_number,origin,state,call_start,call_end,channel_id)
    VALUES($1,$2,$3,$4,$5,'0012345678','import','closed',$6::timestamptz,$6::timestamptz+interval '60 seconds',$7) RETURNING attempt_id`,[crypto.randomUUID(),assignment,sil,client,agent,date,channel])).rows[0].attempt_id;
 }
 await call('2026-08-31 23:59:00-07');
 const current=await call('2026-09-30 23:59:00-07');
 await call('2026-10-01 00:00:00-07');
 const version=(await engine.query('SELECT version_id FROM questionnaire_versions WHERE campaign_id=$1',[sil])).rows[0].version_id;
 await engine.exec('BEGIN');
 const survey=(await engine.query("INSERT INTO call_surveys(attempt_id,campaign_id,version_id,state,completed_at) VALUES($1,$2,$3,'completed',now()) RETURNING survey_id",[current,sil,version])).rows[0].survey_id;
 await engine.query(`INSERT INTO survey_answers(survey_id,version_id,question_id,option_id)
   SELECT $1,$2,q.question_id,min(o.option_id) FROM questionnaire_questions q JOIN questionnaire_options o USING(question_id)
   WHERE q.version_id=$2 AND NOT o.requires_reason GROUP BY q.question_id`,[survey,version]);
 await engine.exec('COMMIT');
 const {buffer}=await generateMonthlyClosing({campaignId:sil,year:2026,month:9});
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(buffer);
 assert.equal(wb.getWorksheet('SILIMEX').rowCount,10,'August and September history; exclude October');
 assert.equal(wb.getWorksheet('SILIMEX').getCell('D1').value.result,2);
 assert.equal(wb.getWorksheet('CONCENTRADO').getCell('C10').value,1,'September count at Hermosillo midnight');
 assert.equal(wb.getWorksheet('SILIMEX').getCell('A10').value.toISOString(),'2026-09-30T23:59:00.000Z');
 assert.equal(wb.getWorksheet('ENCUESTA').rowCount,2);
 assert.equal(wb.getWorksheet('ENCUESTA').getCell('E2').value,'Hermosillo');
 assert.equal(wb.getWorksheet('ENCUESTA').getCell('F2').value,'Silimex');
 const zip=await JSZip.loadAsync(buffer);
 assert.equal(Object.keys(zip.files).filter(p=>/^xl\/charts\/chart\d+\.xml$/.test(p)).length,5);
 await assert.rejects(generateMonthlyClosing({campaignId:999999,year:2026,month:9}),/no encontrada/);
 console.log('PASS report SQL: empty period, calendar boundary in Hermosillo, cumulative history, completed survey, native charts, unknown campaign');
} finally { await pool.end();await engine.close(); }
