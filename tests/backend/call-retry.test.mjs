import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)).replaceAll('\\','/').replace(/\/$/,'');
const {PGlite}=await import('file:///'+root+'/tools/pglite/package/dist/index.js');
Object.assign(process.env,{NODE_ENV:'test',PGHOST:'localhost',PGPORT:'5432',PGDATABASE:'isolated_test',PGUSER:'test',PGPASSWORD:'test',SESSION_SECRET:'isolated-test-secret-32-characters-long'});
const engine=new PGlite();
await engine.exec(await fs.readFile(root+'/database/schema.sql','utf8'));
await engine.exec('CREATE ROLE vincco_app');
await engine.exec(await fs.readFile(root+'/database/migrations/001_work_rounds.sql','utf8'));
const {pool}=await import('file:///'+root+'/dist/db/pool.js');
pool.connect=async()=>({query:async(text,args)=>{const r=await engine.query(typeof text==='string'?text:text.text,args??[]);return {...r,rowCount:r.rows.length||r.affectedRows||0};},release(){}});
const {openCall}=await import('file:///'+root+'/dist/modules/calls/calls.service.js');
try {
 const agent=(await engine.query("INSERT INTO users(username,password_hash,full_name,role) VALUES('round-test','unused','Prueba','agent') RETURNING user_id")).rows[0].user_id;
 const campaign=(await engine.query("SELECT campaign_id FROM campaigns WHERE name='PARTNER DELL'")).rows[0].campaign_id;
 const client=(await engine.query("INSERT INTO clients(source_namespace,clave,razon_social) VALUES('test','TEST','Prueba') RETURNING client_id")).rows[0].client_id;
 const round=(await engine.query("INSERT INTO work_rounds(campaign_id,agent_id,name) VALUES($1,$2,'Prueba') RETURNING round_id",[campaign,agent])).rows[0].round_id;
 const assignment=(await engine.query('INSERT INTO contact_assignments(client_id,campaign_id,agent_id,round_id) VALUES($1,$2,$3,$4) RETURNING assignment_id',[client,campaign,agent,round])).rows[0].assignment_id;
 const input={agentId:agent,campaignId:campaign,clientId:client,assignmentId:assignment,contactId:null,dialedNumber:'5555555555',idempotencyKey:crypto.randomUUID()};
 const first=await openCall(input,agent);
 const retry=await openCall(input,agent);
 assert.equal(retry.attempt_id,first.attempt_id);
 assert.equal(retry.call_start.getTime(),first.call_start.getTime());
 assert.equal(retry.state,'open');
 for (const changes of [{dialedNumber:'5555555556'},{dialedExtension:'123'},{agentId:999},{assignmentId:999},{clientId:999},{campaignId:999},{contactId:999}]) {
   await assert.rejects(openCall({...input,...changes},agent),e=>e.code==='IDEMPOTENCY_CONFLICT');
 }
 console.log('PASS identical retry keeps ID and start time; changed payload or actor rejected');
 let error;
 try{await openCall({...input,idempotencyKey:crypto.randomUUID()},agent);}catch(e){error=e;}
 assert.equal(error?.code,'CONTACT_ALREADY_STARTED');
 console.log('PASS duplicate new request while first attempt is open rejected');
 const channel=(await engine.query("SELECT channel_id FROM channels WHERE campaign_id=$1 AND code='BUZON'",[campaign])).rows[0].channel_id;
 await engine.query("UPDATE call_attempts SET state='closed',call_end=clock_timestamp(),channel_id=$2 WHERE attempt_id=$1",[first.attempt_id,channel]);
 error=null;
 try{await openCall({...input,idempotencyKey:crypto.randomUUID()},agent);}catch(e){error=e;}
 assert.equal(error?.code,'CONTACT_ALREADY_STARTED');
 console.log('PASS duplicate new request after closing rejected');
 assert.equal((await engine.query('SELECT count(*)::int AS n FROM call_attempts')).rows[0].n,1);
 // The exact same request should be recoverable; report current behavior separately.
 const closedRetry=await openCall(input,agent);assert.equal(closedRetry.attempt_id,first.attempt_id);assert.equal(closedRetry.state,'closed');
 console.log('PASS closed retry returns closed state without reopening');
 await engine.query('UPDATE work_rounds SET ended_at=clock_timestamp() WHERE round_id=$1',[round]);
 await engine.query('UPDATE contact_assignments SET ended_at=clock_timestamp() WHERE assignment_id=$1',[assignment]);
 const next=(await engine.query("INSERT INTO work_rounds(campaign_id,agent_id,name) VALUES($1,$2,'Siguiente') RETURNING round_id",[campaign,agent])).rows[0].round_id;
 const nextAssignment=(await engine.query('INSERT INTO contact_assignments(client_id,campaign_id,agent_id,round_id) VALUES($1,$2,$3,$4) RETURNING assignment_id',[client,campaign,agent,next])).rows[0].assignment_id;
 assert.equal((await openCall(input,agent)).state,'closed','Recovery survives a round change');
 await openCall({...input,assignmentId:nextAssignment,idempotencyKey:crypto.randomUUID()},agent);
 assert.equal((await engine.query('SELECT count(*)::int AS n FROM call_attempts')).rows[0].n,2);
 console.log('PASS new round permits a new call and preserves the earlier call');
}finally{await pool.end();await engine.close();}
