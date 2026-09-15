import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
const root=fileURLToPath(new URL('../../',import.meta.url)).replaceAll('\\','/').replace(/\/$/,'');
Object.assign(process.env,{NODE_ENV:'test',PGHOST:'localhost',PGPORT:'5432',PGDATABASE:'isolated_test',PGUSER:'test',PGPASSWORD:'test',SESSION_SECRET:'isolated-test-secret-32-characters-long'});
const {PGlite}=await import('file:///'+root+'/tools/pglite/package/dist/index.js');
const engine=new PGlite();
// Esquema anterior: prueba real del backfill, no solo de una base vacía.
await engine.exec(await fs.readFile(root+'/archive/completion_before_20260912/database/schema.sql','utf8'));
await engine.exec('CREATE ROLE vincco_app');
await engine.exec(await fs.readFile(root+'/database/migrations/001_work_rounds.sql','utf8'));
const {pool}=await import('file:///'+root+'/dist/db/pool.js');
pool.connect=async()=>({query:async(text,args)=>{const r=await engine.query(typeof text==='string'?text:text.text,args??[]);return {...r,rowCount:r.rows.length||r.affectedRows||0};},release(){}});
const q=async(text,args=[])=>(await engine.query(text,args)).rows;
let app;
try {
 const admin=(await q("INSERT INTO users(username,password_hash,full_name,role) VALUES('final-admin','unused','Admin','admin') RETURNING user_id"))[0].user_id;
 const agent=(await q("INSERT INTO users(username,password_hash,full_name,role) VALUES('final-agent','unused','Agente','agent') RETURNING user_id"))[0].user_id;
 const other=(await q("INSERT INTO users(username,password_hash,full_name,role) VALUES('final-other','unused','Otro','agent') RETURNING user_id"))[0].user_id;
 const campaigns=await q('SELECT campaign_id,name FROM campaigns ORDER BY campaign_id');
 const dell=campaigns.find(c=>c.name==='PARTNER DELL').campaign_id;
 const silimex=campaigns.find(c=>c.name==='SILIMEX').campaign_id;
 const rounds=new Map();
 for (const c of campaigns) rounds.set(c.campaign_id,(await q("INSERT INTO work_rounds(campaign_id,agent_id,name) VALUES($1,$2,'Inicial') RETURNING round_id",[c.campaign_id,agent]))[0].round_id);
 const create=async(key,campaign)=>{
  const name=campaigns.find(c=>c.campaign_id===campaign).name;
  const id=(await q('INSERT INTO clients(source_namespace,clave,razon_social) VALUES($1,$2,$2) RETURNING client_id',['campaign:'+name,key]))[0].client_id;
  const contact=(await q('INSERT INTO contact_persons(client_id,nombre) VALUES($1,$2) RETURNING contact_id',[id,'Persona']))[0].contact_id;
  const assignment=(await q('INSERT INTO contact_assignments(client_id,contact_id,campaign_id,agent_id,round_id) VALUES($1,$2,$3,$4,$5) RETURNING assignment_id',[id,contact,campaign,agent,rounds.get(campaign)]))[0].assignment_id;
  return {id,contact,assignment,campaign,key};
 };
 const channel=async(campaign,code)=>(await q('SELECT channel_id FROM channels WHERE campaign_id=$1 AND code=$2',[campaign,code]))[0].channel_id;
 const historical=async(client,code)=>{
  return (await q("INSERT INTO call_attempts(idempotency_key,assignment_id,campaign_id,client_id,agent_id,contact_id,dialed_number,client_key_snapshot,agent_name_snapshot,origin,state,call_start,call_end,channel_id) VALUES($1,$2,$3,$4,$5,$6,'5555555555','','','import','closed',now()-interval '2 days',now()-interval '2 days'+interval '30 seconds',$7) RETURNING attempt_id",[crypto.randomUUID(),client.assignment,client.campaign,client.id,agent,client.contact,await channel(client.campaign,code)]))[0].attempt_id;
 };
 const version=(await q('SELECT version_id FROM questionnaire_versions WHERE campaign_id=$1',[silimex]))[0].version_id;
 const answers=async()=>await q("SELECT question_id AS \"questionId\",(SELECT option_id FROM questionnaire_options o WHERE o.question_id=q.question_id ORDER BY display_order LIMIT 1) AS \"optionId\",'Prueba' AS \"answerText\" FROM questionnaire_questions q WHERE version_id=$1 ORDER BY display_order",[version]);
 const addSurvey=async(attempt,state)=>{
  await engine.exec('BEGIN');
  const id=(await q("INSERT INTO call_surveys(attempt_id,campaign_id,version_id,state,completed_at) VALUES($1,$2,$3,$4,clock_timestamp()) RETURNING survey_id",[attempt,silimex,version,state]))[0].survey_id;
  if (state==='completed') for (const a of await answers()) await q('INSERT INTO survey_answers(survey_id,version_id,question_id,option_id,answer_text) VALUES($1,$2,$3,$4,$5)',[id,version,a.questionId,a.optionId,a.answerText]);
  await engine.exec('COMMIT');
 };
 const success=await create('OLD_SUCCESS',dell);const successId=await historical(success,'SE_ENVIA_PROMOCION_POR_CORREO');
 const survey=await create('OLD_SURVEY',silimex);await addSurvey(await historical(survey,'BUZON'),'completed');
 const both=await create('OLD_BOTH',silimex);await addSurvey(await historical(both,'SE_ENVIA_PROMOCION_POR_CORREO'),'completed');
 const declined=await create('OLD_DECLINED',silimex);await addSurvey(await historical(declined,'BUZON'),'declined');
 const before=await q('SELECT attempt_id,state,call_start,call_end,disposition_code_snapshot FROM call_attempts ORDER BY attempt_id');
 const migration=await fs.readFile(root+'/database/migrations/003_contact_finalizations.sql','utf8');
 await engine.exec(migration);
 assert.deepEqual(await q('SELECT attempt_id,state,call_start,call_end,disposition_code_snapshot FROM call_attempts ORDER BY attempt_id'),before);
 assert.equal((await q('SELECT count(*)::int n FROM contact_finalizations'))[0].n,3);
 assert.deepEqual((await q('SELECT client_id FROM vw_contactos_disponibles ORDER BY client_id')).map(r=>r.client_id),[declined.id]);
 const bothView=(await q('SELECT * FROM vw_contactos_finalizados WHERE client_id=$1',[both.id]))[0];
 assert.equal(bothView.successful,true);assert.equal(bothView.survey_completed,true);
 await engine.exec(migration);
 assert.equal((await q('SELECT count(*)::int n FROM contact_finalizations'))[0].n,3);
 console.log('PASS migration recognizes prior success/completed surveys, preserves calls, is repeatable; declined alone stays eligible');

 const {openCall,closeCall}=await import('file:///'+root+'/dist/modules/calls/calls.service.js');
 const {startWorkRound}=await import('file:///'+root+'/dist/modules/admin/rounds.service.js');
 const {importContactsFromExcel,distributeContacts}=await import('file:///'+root+'/dist/modules/contacts/import.service.js');
 const {listFinalizedContacts}=await import('file:///'+root+'/dist/modules/admin/finalizations.service.js');
 const input=client=>({idempotencyKey:crypto.randomUUID(),agentId:agent,campaignId:client.campaign,assignmentId:client.assignment,clientId:client.id,contactId:client.contact,dialedNumber:'5555555555'});
 await assert.rejects(openCall(input(success),agent),e=>e.code==='CONTACT_FINALIZED');
 // New successful call; exact retry remains recoverable after exclusion.
 const live=await create('LIVE_SUCCESS',dell);const liveInput=input(live);const opened=await openCall(liveInput,agent);
 await closeCall({attemptId:opened.attempt_id,agentId:agent,channelCode:'SE_ENVIA_PROMOCION_POR_CORREO'},agent);
 assert.equal((await openCall(liveInput,agent)).state,'closed');
 await assert.rejects(openCall(input(live),agent),e=>e.code==='CONTACT_FINALIZED');
 assert.equal((await q('SELECT count(*)::int n FROM contact_finalizations WHERE client_id=$1',[live.id]))[0].n,1);
 // Survey rollback must roll back the exclusion as well.
 const invalid=await create('INVALID_SURVEY',silimex);const pending=await openCall(input(invalid),agent);
 await assert.rejects(closeCall({attemptId:pending.attempt_id,agentId:agent,channelCode:'BUZON',survey:{versionId:version,declined:false,answers:[]}},agent));
 assert.equal((await q('SELECT count(*)::int n FROM contact_finalizations WHERE client_id=$1',[invalid.id]))[0].n,0);
 assert.equal((await q('SELECT state FROM call_attempts WHERE attempt_id=$1',[pending.attempt_id]))[0].state,'open');
 await closeCall({attemptId:pending.attempt_id,agentId:agent,channelCode:'BUZON',survey:{versionId:version,declined:false,answers:await answers()}},agent);
 assert.equal((await q('SELECT survey_completed FROM contact_finalizations WHERE client_id=$1',[invalid.id]))[0].survey_completed,true);
 const declinedLive=await create('LIVE_DECLINED',silimex);const d=await openCall(input(declinedLive),agent);
 await closeCall({attemptId:d.attempt_id,agentId:agent,channelCode:'BUZON',survey:{versionId:version,declined:true}},agent);
 assert.equal((await q('SELECT count(*)::int n FROM contact_finalizations WHERE client_id=$1',[declinedLive.id]))[0].n,0);
 console.log('PASS automatic close exclusion, survey rollback, declined live survey and idempotent retry');

 const next=await startWorkRound({campaignId:dell,agentId:agent,name:'Segunda',expectedRoundId:rounds.get(dell)},admin);
 assert.equal(next.enabledContacts,0);
 assert.equal((await q('SELECT count(*)::int n FROM contact_assignments WHERE round_id=$1',[next.round.round_id]))[0].n,0);
 rounds.set(dell,next.round.round_id);
 const nextSil=await startWorkRound({campaignId:silimex,agentId:agent,name:'Segunda',expectedRoundId:rounds.get(silimex)},admin);
 assert.equal(nextSil.enabledContacts,2);
 rounds.set(silimex,nextSil.round.round_id);
 // A new import respects completion, even when the old assignment belongs to an earlier round.
 const w=new ExcelJS.Workbook();const sheet=w.addWorksheet('BASE');sheet.addRow(['CLAVE','RAZON SOCIAL','TEL','CONTACTO','CORREO']);
 sheet.addRow([success.key,success.key,'5555555555','Persona','test@example.com']);
 const result=await importContactsFromExcel({fileBuffer:Buffer.from(await w.xlsx.writeBuffer()),fileName:'test.xlsx',campaignId:dell,agentId:agent,userId:admin});
 assert.equal(result.rejected,0);assert.equal(result.finalized,1);
 assert.equal((await q('SELECT count(*)::int n FROM contact_assignments WHERE round_id=$1',[next.round.round_id]))[0].n,0);
 // End the old assignment: distributing the base still must not resurrect it.
 await q('UPDATE contact_assignments SET ended_at=clock_timestamp() WHERE client_id=$1 AND ended_at IS NULL',[success.id]);
 assert.equal((await distributeContacts({campaignId:dell,agentIds:[agent],userId:admin})).assigned,0);
 const otherRound=(await q("INSERT INTO work_rounds(campaign_id,agent_id,name) VALUES($1,$2,'Otro') RETURNING round_id",[dell,other]))[0].round_id;
 await assert.rejects(q('INSERT INTO contact_assignments(client_id,campaign_id,agent_id,round_id) VALUES($1,$2,$3,$4)',[success.id,dell,other,otherRound]),/finalizado/);
 // Campaign scope: same client is eligible in another campaign.
 const differentAssignment=(await q('INSERT INTO contact_assignments(client_id,campaign_id,agent_id,round_id) VALUES($1,$2,$3,$4) RETURNING assignment_id',[success.id,silimex,agent,nextSil.round.round_id]))[0].assignment_id;
 const different=await openCall({...input(success),campaignId:silimex,assignmentId:differentAssignment},agent);
 await closeCall({attemptId:different.attempt_id,agentId:agent,channelCode:'BUZON'},agent);
 await assert.rejects(q('DELETE FROM contact_finalizations WHERE attempt_id=$1',[successId]),/permanente/);
 await assert.rejects(q('UPDATE contact_finalizations SET successful=false WHERE attempt_id=$1',[successId]),/exclusión/);
 // Even a direct live INSERT using a stale assignment is rejected by PostgreSQL.
 await assert.rejects(q("INSERT INTO call_attempts(idempotency_key,assignment_id,campaign_id,client_id,agent_id,contact_id,dialed_number,client_key_snapshot,agent_name_snapshot,call_start) VALUES($1,$2,$3,$4,$5,$6,'5555555555','','',clock_timestamp())",[crypto.randomUUID(),live.assignment,dell,live.id,agent,live.contact]),/finalizado/);
 console.log('PASS new rounds, reimport, distribution, other agents and stale inserts cannot undo exclusion; campaign scope preserved');

 const list=await listFinalizedContacts({campaignId:silimex,search:'OLD_',page:1});assert.equal(list.total,2);
 assert.equal((await listFinalizedContacts({campaignId:silimex,search:'missing',page:1})).contacts.length,0);
 assert.equal((await listFinalizedContacts({search:'',page:2})).contacts.length,0);
 const {buildApp}=await import('file:///'+root+'/dist/app.js');app=await buildApp();
 // Test-only session setup lets us exercise the actual authorization and summary route.
 app.get('/__test/session/:role',async(request)=>{request.session.user={userId:request.params.role==='admin'?admin:agent,role:request.params.role};return {ok:true};});
 assert.equal((await app.inject('/api/admin/contactos-finalizados')).statusCode,401);
 const agentSession=await app.inject('/__test/session/agent');
 const agentCookie=agentSession.headers['set-cookie'].split(';')[0];
 assert.equal((await app.inject({url:'/api/admin/contactos-finalizados',headers:{cookie:agentCookie}})).statusCode,403);
 const adminSession=await app.inject('/__test/session/admin');
 const adminCookie=adminSession.headers['set-cookie'].split(';')[0];
 const adminList=await app.inject({url:'/api/admin/contactos-finalizados',headers:{cookie:adminCookie}});
 assert.equal(adminList.statusCode,200);assert.equal(adminList.json().total,5);
 const summary=await app.inject({url:`/api/admin/rondas/resumen?campaignId=${silimex}&agentId=${agent}`,headers:{cookie:adminCookie}});
 assert.equal(summary.statusCode,200);
 const s=summary.json().summary;
 assert.equal(s.finalized,3);assert.equal(s.assigned,s.blocked+s.finalized+s.inactive+s.eligible);
 assert.equal((await app.inject({url:'/api/admin/contactos-finalizados?page=0',headers:{cookie:adminCookie}})).statusCode,400);
 console.log('PASS administrative list filters/pagination, admin-only access, round summary partitions and validation');
 const blackSurvey=await create('BLACKLIST_SURVEY',silimex);
 const bs=await openCall(input(blackSurvey),agent);
 await closeCall({attemptId:bs.attempt_id,agentId:agent,channelCode:'NUMERO_EQUIVOCADO',survey:{versionId:version,declined:false,answers:await answers()}},agent);
 assert.equal((await q('SELECT count(*)::int n FROM contact_blacklist WHERE client_id=$1',[blackSurvey.id]))[0].n,1);
 await q('UPDATE contact_blacklist SET ended_at=clock_timestamp() WHERE client_id=$1',[blackSurvey.id]);
 assert.equal((await q('SELECT count(*)::int n FROM vw_contactos_disponibles WHERE client_id=$1',[blackSurvey.id]))[0].n,0);
 await assert.rejects(openCall(input(blackSurvey),agent),e=>e.code==='CONTACT_FINALIZED');
 console.log('PASS releasing Blacklist does not remove survey completion exclusion');
} finally {if(app) await app.close();await pool.end();await engine.close();}
