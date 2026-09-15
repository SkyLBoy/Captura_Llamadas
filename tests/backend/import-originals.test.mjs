// Prueba opcional con los archivos locales originales; nunca conecta a PostgreSQL real.
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url)).replaceAll('\\','/').replace(/\/$/,'');
Object.assign(process.env,{NODE_ENV:'test',PGHOST:'localhost',PGPORT:'5432',PGDATABASE:'isolated_test',PGUSER:'test',PGPASSWORD:'test',SESSION_SECRET:'isolated-test-secret-32-characters-long'});
const {PGlite}=await import('file:///'+root+'/tools/pglite/package/dist/index.js');
const db=new PGlite();
await db.exec(await fs.readFile(root+'/archive/import_before_20260912/database/schema.sql','utf8'));
await db.exec('CREATE ROLE vincco_app');
await db.exec(await fs.readFile(root+'/database/migrations/001_work_rounds.sql','utf8'));
await db.exec(await fs.readFile(root+'/database/migrations/002_import_blacklist.sql','utf8'));
await db.exec(await fs.readFile(root+'/database/migrations/003_contact_finalizations.sql','utf8'));
const {pool}=await import('file:///'+root+'/dist/db/pool.js');
pool.connect=async()=>({query:async(text,args)=>{const r=await db.query(typeof text==='string'?text:text.text,args??[]);return {...r,rowCount:r.rows.length||r.affectedRows||0};},release(){}});
const {importContactsFromExcel}=await import('file:///'+root+'/dist/modules/contacts/import.service.js');
try {
 const admin=(await db.query("INSERT INTO users(username,password_hash,full_name,role) VALUES('admin-test','unused','Admin','admin') RETURNING user_id")).rows[0].user_id;
 const agent=(await db.query("INSERT INTO users(username,password_hash,full_name,role) VALUES('agent-test','unused','Agent','agent') RETURNING user_id")).rows[0].user_id;
 for (const [campaignName,path,total,blocked] of [
  ['SILIMEX','C:/Users/VNCAdmin-12/Downloads/SILIMEX_ABECHUCO_2026.xlsm',2818,70],
  ['PARTNER DELL','C:/Users/VNCAdmin-12/Documents/PARTNER DELL - ABECHUCO - ABRIL 2026 (1).xlsx',2405,79],
 ]) {
  const campaign=(await db.query('SELECT campaign_id FROM campaigns WHERE name=$1',[campaignName])).rows[0].campaign_id;
  await db.query("INSERT INTO work_rounds(campaign_id,agent_id,name) VALUES($1,$2,'Prueba aislada')",[campaign,agent]);
  const r=await importContactsFromExcel({fileBuffer:await fs.readFile(path),fileName:path.split('/').pop(),campaignId:campaign,agentId:agent,userId:admin});
  console.log(campaignName,JSON.stringify(r));
  assert.equal(r.rowsProcessed,total);assert.equal(r.skipped,54);assert.equal(r.blacklisted,blocked);
  if (campaignName==='SILIMEX') assert.equal(r.rejected,0);
  else {
   assert.equal(r.rejected,3);
   assert.deepEqual(r.issues.map(issue=>issue.row),[426,1053,1260]);
   assert.match(r.issues[0].message,/CLAVE repetida/);
   assert.match(r.issues[1].message,/NUEVO NUMERO/);
   assert.match(r.issues[2].message,/NUEVO NUMERO/);
  }
 }
 assert.equal((await db.query('SELECT count(*)::int n FROM call_attempts')).rows[0].n,0);
 console.log('PASS originales completos y migración desde esquema anterior en base desechable; cero llamadas creadas');
} finally {await pool.end();await db.close();}
