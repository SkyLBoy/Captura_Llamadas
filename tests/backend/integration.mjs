import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { PGlite } from '../../tools/pglite/package/dist/index.js';
Object.assign(process.env,{NODE_ENV:'test',PGHOST:'localhost',PGPORT:'5432',PGDATABASE:'isolated_test',PGUSER:'test',PGPASSWORD:'test',SESSION_SECRET:'isolated-test-secret-32-characters-long'});
const engine=new PGlite();
console.log('Initializing isolated database');
await engine.exec(await fs.readFile(new URL('../../database/schema.sql',import.meta.url),'utf8'));
const {pool}=await import('../../dist/db/pool.js');
console.log('Database ready');
// Run actual services/SQL and HTTP routes with an isolated PostgreSQL engine.
// Serial connections emulate a pool of size one; this is not a network/PostgreSQL load test.
let tail=Promise.resolve();
async function connect(){const previous=tail;let unlock;tail=new Promise(r=>unlock=r);await previous;return {query:query,release:()=>unlock()};}
async function query(text,values){
  const result=await engine.query(typeof text==='string'?text:text.text,values??[]);
  return {...result,rowCount:result.rows.length || result.affectedRows || 0,command:'',fields:result.fields??[]};
}
pool.connect=connect;
pool.query=async(...args)=>{const c=await connect();try{return await c.query(...args);}finally{c.release();}};
const {hashPassword}=await import('../../dist/utils/auth.js');
const hash=await hashPassword('Test-password-1234');
console.log('Password hashing ready');
await engine.query(`INSERT INTO users(username,password_hash,full_name,role) VALUES ('admin',$1,'Administrador','admin'),('abechuco',$1,'Monserrat Abechuco','agent'),('ordaz',$1,'Carlos Ordaz','agent')`,[hash]);
const users=(await engine.query('SELECT * FROM users ORDER BY user_id')).rows;
const [admin,agent,other]=users;
const campaigns=(await engine.query('SELECT * FROM campaigns')).rows;
const sil=campaigns.find(c=>c.name==='SILIMEX');const dell=campaigns.find(c=>c.name==='PARTNER DELL');
const {buildApp}=await import('../../dist/app.js');const app=await buildApp();
console.log('HTTP application ready');
const {importContactsFromExcel,distributeContacts}=await import('../../dist/modules/contacts/import.service.js');
const {openCall,closeCall}=await import('../../dist/modules/calls/calls.service.js');
const {generateMonthlyClosing}=await import('../../dist/modules/reports/reports.service.js');
const passed=[];async function test(name,fn){await fn();passed.push(name);console.log('OK:',name);}
let cookie;
try {
await test('HTTP login, health and agent authorization',async()=>{
 const login=await app.inject({method:'POST',url:'/api/auth/login',payload:{username:'abechuco',password:'Test-password-1234'}});assert.equal(login.statusCode,200,login.body);cookie=login.cookies.map(c=>`${c.name}=${c.value}`).join('; ');
 assert.equal((await app.inject({url:'/api/health'})).statusCode,200);
 assert.equal((await app.inject({url:'/api/admin/blacklist',headers:{cookie}})).statusCode,403);
});
const wb=new ExcelJS.Workbook();wb.addWorksheet('LLAMADAS').addRow(['Not the base']);const base=wb.addWorksheet('BASE');
base.addRow(['CLAVE','MARCA','TIPO DE COMPRA','RAZON SOCIAL','TEL','EXT','REF1','REF2','CELULAR','CONTACTO','CORREO','EJECUTIVO']);
base.addRow([{formula:'"TEST1"',result:'TEST1'},'marca','compra','Empresa Uno','3330000000','123','','','','','uno@example.test','ejecutivo']);
base.addRow(['BAD','','','Rechazada','3330000001','','','','','Persona','bad@example.test','']);
base.addRow(['TEST2','','','Empresa Dos','3330000002','','','','','Persona Dos','dos@example.test','']);
await engine.exec(`CREATE FUNCTION reject_bad_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.clave='BAD' THEN RAISE EXCEPTION 'test invalid row'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_bad_test BEFORE INSERT ON clients FOR EACH ROW EXECUTE FUNCTION reject_bad_test();`);
await test('Import BASE, formula cached value, nameless contact and SQL savepoint recovery',async()=>{
 const result=await importContactsFromExcel({fileBuffer:Buffer.from(await wb.xlsx.writeBuffer()),fileName:'agent.xlsx',campaignId:sil.campaign_id,agentId:agent.user_id,userId:admin.user_id});
 assert.equal(result.imported,2);assert.equal(result.rejected,1);
 const phones=(await engine.query('SELECT * FROM phone_numbers ORDER BY phone_id')).rows;assert.equal(phones.length,2);assert.equal(phones[0].extension,'123');
 assert.equal((await engine.query('SELECT count(*)::int AS n FROM contact_assignments WHERE agent_id=$1',[agent.user_id])).rows[0].n,2);
});
await test('Distribution cannot mix campaign bases',async()=>assert.equal((await distributeContacts({campaignId:dell.campaign_id,agentIds:[other.user_id],userId:admin.user_id})).assigned,0));
const asg=(await engine.query('SELECT * FROM contact_assignments ORDER BY assignment_id')).rows[0];
await test('Authorized contact detail includes phone and mail',async()=>{
 const response=await app.inject({url:`/api/contacts/${asg.client_id}?campaignId=${sil.campaign_id}`,headers:{cookie}});assert.equal(response.statusCode,200,response.body);assert.equal(response.json().phones[0].number,'3330000000');assert.equal(response.json().emails.length,1);
});
const input={agentId:agent.user_id,campaignId:sil.campaign_id,assignmentId:asg.assignment_id,clientId:asg.client_id,contactId:asg.contact_id,dialedNumber:'3330000000',idempotencyKey:crypto.randomUUID()};let call;
await test('Repeated open returns same call and recovery route retrieves it',async()=>{
 call=await openCall(input,agent.user_id);assert.equal((await openCall(input,agent.user_id)).attempt_id,call.attempt_id);
 await assert.rejects(openCall({...input,dialedNumber:'999'},agent.user_id));
 const res=await app.inject({url:'/api/calls/open',headers:{cookie}});assert.equal(res.json().attempt.attempt_id,call.attempt_id);
});
const version=(await engine.query('SELECT version_id FROM questionnaire_versions WHERE campaign_id=$1',[sil.campaign_id])).rows[0].version_id;
const answers=(await engine.query(`SELECT q.question_id, min(o.option_id)::int AS option_id FROM questionnaire_questions q JOIN questionnaire_options o USING(question_id) WHERE q.version_id=$1 AND NOT o.requires_reason GROUP BY q.question_id ORDER BY q.question_id`,[version])).rows.map(r=>({questionId:r.question_id,optionId:r.option_id}));
await test('Survey finishes before call end and repeated close cannot overwrite',async()=>{
 await closeCall({attemptId:call.attempt_id,agentId:agent.user_id,channelCode:'SE_ENVIA_PROMOCION_POR_CORREO',survey:{versionId:version,declined:false,answers}},agent.user_id);
 assert.equal((await engine.query(`SELECT a.call_end>=s.completed_at AS valid FROM call_attempts a JOIN call_surveys s USING(attempt_id) WHERE attempt_id=$1`,[call.attempt_id])).rows[0].valid,true);
 await assert.rejects(closeCall({attemptId:call.attempt_id,agentId:agent.user_id,channelCode:'BLACKLIST'},agent.user_id));
});
await test('Report contains campaign history, raw surveys, hidden data and native charts',async()=>{
 const now=new Date();const {buffer}=await generateMonthlyClosing({campaignId:sil.campaign_id,year:now.getUTCFullYear(),month:now.getUTCMonth()+1});
 const report=new ExcelJS.Workbook();await report.xlsx.load(buffer);
 for(const name of ['CONCENTRADO','SILIMEX','ENCUESTA','RESULTADOS ENCUESTA']) assert.ok(report.getWorksheet(name),name);
 assert.equal(report.getWorksheet('Hoja1').state,'hidden');
 const zip=await JSZip.loadAsync(buffer);assert.equal(Object.keys(zip.files).filter(p=>/^xl\/charts\/chart\d+\.xml$/.test(p)).length,5);
 assert.equal(report.getWorksheet('ENCUESTA').rowCount,2);
 await fs.writeFile(new URL('./sample-report.xlsx',import.meta.url),buffer);
});
await test('Admin classifies channels with actor audit and data changes preserve dialed number',async()=>{
 const login=await app.inject({method:'POST',url:'/api/auth/login',payload:{username:'admin',password:'Test-password-1234'}});
 const adminCookie=login.cookies.map(c=>`${c.name}=${c.value}`).join('; ');
 const channel=(await engine.query("SELECT channel_id FROM channels WHERE campaign_id=$1 AND code='NUEVOS_DATOS'",[sil.campaign_id])).rows[0];
 const disposition=(await engine.query("SELECT disposition_id FROM dispositions WHERE campaign_id=$1 AND code='SEGUIMIENTO'",[sil.campaign_id])).rows[0];
 const response=await app.inject({method:'POST',url:`/api/admin/canalizaciones/${channel.channel_id}/clasificar`,headers:{cookie:adminCookie},payload:{dispositionId:disposition.disposition_id}});assert.equal(response.statusCode,200,response.body);
 assert.ok((await engine.query("SELECT 1 FROM audit_log WHERE table_name='channels' AND changed_by_user_id=$1",[admin.user_id])).rows.length);
 const c=await openCall({...input,idempotencyKey:crypto.randomUUID()},agent.user_id);
 await closeCall({attemptId:c.attempt_id,agentId:agent.user_id,channelCode:'NUEVOS_DATOS',newData:{phone:'3331112222',email:'nuevo@example.test'}},agent.user_id);
 assert.equal((await engine.query('SELECT dialed_number FROM call_attempts WHERE attempt_id=$1',[c.attempt_id])).rows[0].dialed_number,'3330000000');
 assert.equal((await engine.query('SELECT number FROM phone_numbers WHERE contact_id=$1 AND is_active',[asg.contact_id])).rows[0].number,'3331112222');
});
await test('Two close requests permit one successful write',async()=>{
 const c=await openCall({...input,idempotencyKey:crypto.randomUUID()},agent.user_id);
 const result=await Promise.allSettled([closeCall({attemptId:c.attempt_id,agentId:agent.user_id,channelCode:'BUZON'},agent.user_id),closeCall({attemptId:c.attempt_id,agentId:agent.user_id,channelCode:'BUZON'},agent.user_id)]);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
});
await test('Business-name change blocks contact and preserves historical name',async()=>{
 const c=await openCall({...input,idempotencyKey:crypto.randomUUID()},agent.user_id);
 await closeCall({attemptId:c.attempt_id,agentId:agent.user_id,channelCode:'NUEVOS_DATOS',newData:{businessName:'Nueva Razón'}},agent.user_id);
 assert.equal((await engine.query('SELECT count(*)::int AS n FROM vw_contactos_disponibles WHERE client_id=$1',[asg.client_id])).rows[0].n,0);
 assert.equal((await engine.query('SELECT business_name_snapshot FROM call_attempts WHERE attempt_id=$1',[c.attempt_id])).rows[0].business_name_snapshot,'Empresa Uno');
});
await test('Deactivated account loses existing session access',async()=>{
 await engine.query('UPDATE users SET is_active=false WHERE user_id=$1',[agent.user_id]);assert.equal((await app.inject({url:'/api/calls/open',headers:{cookie}})).statusCode,401);
});
await fs.writeFile(new URL('./results.json',import.meta.url),JSON.stringify({passed,engine:'PGlite, single-connection adapter',limitations:'No production PostgreSQL or LAN deployment tested'},null,2));
console.log(`${passed.length} backend integration groups passed`);
} finally {await app.close();await pool.end();await engine.close();}
