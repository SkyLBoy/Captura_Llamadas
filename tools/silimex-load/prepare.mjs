// Generates and rehearses a pgAdmin transaction. The live connection is READ ONLY.
import 'dotenv/config';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
import { PGlite } from '../pglite/package/dist/index.js';
process.on('uncaughtException',error=>{console.error('Preparation failed:',error.message);process.exit(1);});
const root='tools/silimex-load/';
const out='backups/silimex-before-real-load-20260915/';
const files={
 ordaz:'C:/Users/VNCAdmin-12/Documents/SILIMEX_2026/SILIMEXCARLOS/SILIMEX_-_ORDAZ_-_2026.xlsm',
 abechuco:'C:/Users/VNCAdmin-12/Documents/SILIMEX_2026/SILIMEXMONSE/SILIMEX_ABECHUCO_2026_150926.xlsm',
 abechuco12:'C:/Users/VNCAdmin-12/Documents/SILIMEX_2026/SILIMEXMONSE/SILIMEX_ABECHUCO_2026_120926.xlsm',
 agosto:'C:/Users/VNCAdmin-12/Documents/SILIMEX_2026/SILIMEX_AGOSTO_2026/SILIMEX_AGOSTO_2026.xlsx',
};
const sources={};
for(const [name,file] of Object.entries(files)) {
 sources[name]={file:file.split('/').pop(),hash:crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'),data:JSON.parse(await fs.readFile(root+name+'-data.json','utf8'))};
 assert.equal(sources[name].hash,JSON.parse(await fs.readFile(root+name+'-inspection.json','utf8')).sha256,'Source changed since extraction: '+name);
}
const quote=x=>x===null||x===undefined?'NULL':typeof x==='number'?String(x):typeof x==='boolean'?String(x):"'"+(x instanceof Date?x.toISOString():typeof x==='object'?JSON.stringify(x):String(x)).replaceAll("'","''")+"'";
const bind=(sql,args=[])=>sql.replace(/\$(\d+)/g,(_,n)=>{assert(Number(n)<=args.length);return quote(args[Number(n)-1]);});
const cfg={campaigns:'campaign_id,name,is_active',dispositions:'disposition_id,campaign_id,code,description,counts_for_tpa,is_active',channels:'channel_id,campaign_id,code,description,disposition_id,is_active',questionnaire_versions:'version_id,campaign_id,version_name,effective_from,effective_to,is_active',questionnaire_questions:'question_id,version_id,code,question_text,question_type,required,display_order',questionnaire_options:'option_id,question_id,option_text,requires_reason,display_order'};
const operational=['survey_answers','contact_finalizations','contact_blacklist','import_detail','call_surveys','call_attempts','contact_assignments','phone_numbers','email_addresses','contact_persons','clients','import_log','work_rounds'];
const live=new pg.Client();await live.connect();
let users,config={},sequenceStarts={},guardCounts={};
try {
 await live.query('BEGIN READ ONLY');
 assert.equal((await live.query('SELECT current_database() AS name')).rows[0].name,'vincco_telemarketing');
 users=(await live.query('SELECT user_id,username,full_name,role,is_active FROM users ORDER BY user_id')).rows;
 for(const [table,cols] of Object.entries(cfg))config[table]=(await live.query(`SELECT ${cols} FROM ${table} ORDER BY 1`)).rows;
 for(const table of operational)guardCounts[table]=Number((await live.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
 for(const {sequencename} of (await live.query("SELECT sequencename FROM pg_sequences WHERE schemaname='public' AND sequencename<>'audit_log_audit_id_seq'")).rows) {
  sequenceStarts[sequencename]=Number((await live.query(`SELECT last_value FROM ${sequencename}`)).rows[0].last_value)+100000;
 }
 await live.query('COMMIT');
} finally {await live.end();}
const schema=await fs.readFile('database/schema.sql','utf8');
const migrations=await Promise.all(['001_work_rounds.sql','002_import_blacklist.sql','004_historical_import.sql'].map(f=>fs.readFile('database/migrations/'+f,'utf8')));
const seed=async engine=>{
 await engine.exec(schema);await engine.exec('CREATE ROLE vincco_app');
 for(const migration of migrations)await engine.exec(migration);
 // Copy only non-secret configuration into the disposable rehearsal database.
 for(const [table,cols] of Object.entries(cfg))for(const row of config[table]) {
  const names=cols.split(',');const id=names[0];
  const exists=(await engine.query(`SELECT 1 FROM ${table} WHERE ${id}=$1`,[row[id]])).rows.length;
  await engine.exec(exists?`UPDATE ${table} SET ${names.slice(1).map(k=>`${k}=${quote(row[k])}`).join(',')} WHERE ${id}=${row[id]}`:`INSERT INTO ${table}(${cols}) VALUES(${names.map(k=>quote(row[k])).join(',')})`);
 }
 for(const u of users)await engine.exec(`INSERT INTO users(user_id,username,full_name,role,is_active,password_hash) VALUES(${[u.user_id,u.username,u.full_name,u.role,u.is_active,'!NO-LOGIN-REHEARSAL'].map(quote).join(',')})`);
};
let engine=new PGlite();await seed(engine);
let journal=[];
async function query(sql,args=[]) {
 sql=typeof sql==='string'?sql:sql.text;
 const r=await engine.query(sql,args);
 if(/^\s*(insert|update|delete|savepoint|release|rollback to|set local)/i.test(sql)||/set_config|setval/.test(sql))journal.push(bind(sql.replace(/\s+returning\s+[\s\S]*$/i,''),args)+';');
 return {...r,rowCount:r.rows.length||r.affectedRows||0};
}
for(const [seq,start] of Object.entries(sequenceStarts))await query(`SELECT setval('${seq}',${start},false)`);
await query("SELECT setval('historical_survey_records_historical_survey_id_seq',100000,false)");
Object.assign(process.env,{NODE_ENV:'test',SESSION_SECRET:process.env.SESSION_SECRET||'isolated-rehearsal-secret-32-characters'});
const {pool}=await import('../../dist/db/pool.js');
pool.connect=async()=>({query,release(){}});
const {importContactsFromExcel}=await import('../../dist/modules/contacts/import.service.js');
const campaign=config.campaigns.find(c=>c.name==='SILIMEX').campaign_id;
const agents=new Map(users.filter(u=>u.role==='agent').map(u=>[u.full_name,u.user_id]));
const admin=users.find(u=>u.role==='admin'&&u.is_active).user_id;
const cacheKey=crypto.createHash('sha256').update(JSON.stringify({sources:Object.values(sources).map(s=>s.hash),config,sequenceStarts,users})).digest('hex');
let cachedBase;
try {cachedBase=JSON.parse(await fs.readFile(out+'base-cache.json','utf8'));}catch{}
if(cachedBase?.key===cacheKey) {
 await engine.exec('BEGIN;'+cachedBase.journal.join('\n')+'COMMIT;');journal=cachedBase.journal;
 console.log('BASE restored from verified local rehearsal cache');
} else {
for(const [source,name] of [['ordaz','Carlos Ordaz'],['abechuco','Monserrat Abechuco']]) {
 await query("INSERT INTO work_rounds(campaign_id,agent_id,name,started_at,created_by_user_id) VALUES($1,$2,'Septiembre 2026 · carga inicial','2026-09-01 00:00:00-07',$3)",[campaign,agents.get(name),admin]);
 const result=await importContactsFromExcel({fileBuffer:await fs.readFile(files[source]),fileName:sources[source].file,campaignId:campaign,userId:admin,agentId:agents.get(name)});
 assert.equal(result.rejected,0);console.log(source,JSON.stringify(result));
}
await fs.writeFile(out+'base-cache.json',JSON.stringify({key:cacheKey,journal}));
}
// From here all history and surveys share a transaction (deferred questionnaire checks).
await query('BEGIN');await query("SELECT set_config('app.user_id',$1,true)",[String(admin)]);
const alma=(await query("INSERT INTO users(username,password_hash,full_name,role,is_active) VALUES('historico_alma_zambrano','!DISABLED-HISTORICAL-IDENTITY','Alma Zambrano','agent',true) RETURNING user_id")).rows[0].user_id;
agents.set('Alma Zambrano',alma);
const clients=new Map((await query('SELECT client_id,clave FROM clients')).rows.map(r=>[r.clave,r.client_id]));
const assignments=new Map((await query('SELECT * FROM contact_assignments')).rows.map(r=>[`${r.client_id}/${r.agent_id}`,r]));
const historicalAssignments=new Map();
const branchMap=new Map(sources.ordaz.data.Hoja3.slice(1).map(r=>[r.values[0],r.values[1]]));
const oldSurveyByKey=new Map(sources.agosto.data.ENCUESTA.slice(1).map(r=>[String(r.values[1]).trim().toUpperCase(),r.values]));
async function clientFor(key) {
 key=String(key).trim().toUpperCase();
 if(!clients.has(key)) {
  const survey=oldSurveyByKey.get(key);
  const r=(await query('INSERT INTO clients(source_namespace,clave,razon_social,sucursal,is_active) VALUES($1,$2,$3,$4,false) RETURNING client_id',['campaign:SILIMEX',key,survey?.[3]?.trim()||null,survey?.[4]||branchMap.get(key.match(/^[A-Z]+/)?.[0])||null])).rows[0];
  clients.set(key,r.client_id);
 }
 return clients.get(key);
}
const norm=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase().replace(/\s+/g,' ');
const channels=new Map(config.channels.filter(c=>c.campaign_id===campaign).flatMap(c=>[[norm(c.description),c],[c.code.replaceAll('_',' '),c]]));
const timestamp=s=>String(s).replace(' ','T')+'-07:00';
const callIndex=new Map();const duplicates=[];const seen=new Map();let counts={oldCalls:0,septemberCalls:0,invalidSeptemberTimes:0};
for(const source of ['agosto','ordaz','abechuco12','abechuco']) {
 const old=source==='agosto';const rows=sources[source].data[old?'SILIMEX':'LLAMADAS'];
 for(const r of rows) {
  const v=r.values;if(!/^2026-/.test(String(v[0])))continue;
  if(old&&seen.has(JSON.stringify(v))){duplicates.push({source,row:r.row,originalRow:seen.get(JSON.stringify(v))});continue;}
  if(old)seen.set(JSON.stringify(v),r.row);
  const key=String(v[old?2:2]).trim().toUpperCase(),name=String(v[old?6:11]).trim(),agent=agents.get(name);assert(agent,`Unknown agent ${name}`);
  const client=await clientFor(key);let assignment;
  if(!old)assignment=assignments.get(`${client}/${agent}`);
  if(!assignment) {
   const ak=`${client}/${agent}`;assignment=historicalAssignments.get(ak);
   if(!assignment){assignment=(await query("INSERT INTO contact_assignments(client_id,campaign_id,agent_id,started_at,ended_at) VALUES($1,$2,$3,'2026-01-01 00:00:00-07','2026-09-15 23:59:59-07') RETURNING *",[client,campaign,agent])).rows[0];historicalAssignments.set(ak,assignment);}
  }
  const start=timestamp(v[0]);let end=null,issue=null;
  if(old) {
   const m=String(v[7]).match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);assert(m,`Bad historic duration row ${r.row}`);
   end=new Date(new Date(start).getTime()+(Number(m[1])*3600+Number(m[2])*60+Number(m[3]))*1000).toISOString();
  } else {
   const raw=String(v[15]??'');if(/^\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw))end=timestamp(v[0].slice(0,10)+' '+raw);
   if(!end||new Date(end)<new Date(start)){end=null;issue='Hora final de Excel no verificable; ver procedencia original.';counts.invalidSeptemberTimes++;}
  }
  const label=norm(v[old?3:13]).replace(/^NOCONTESTA$/,'NO CONTESTA');const channel=channels.get(label);assert(channel,`Unknown channel ${label}`);
  const uuid=crypto.createHash('sha256').update(sources[source].hash+'/'+r.row).digest('hex').slice(0,32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5');
  let contact=assignment.contact_id??null;
  if(!old&&v[4]&&String(v[4]).trim()!=='0')contact=(await query('INSERT INTO contact_persons(client_id,nombre,is_active) VALUES($1,$2,false) RETURNING contact_id',[client,String(v[4]).trim()])).rows[0].contact_id;
  const a=(await query("INSERT INTO call_attempts(idempotency_key,assignment_id,campaign_id,client_id,agent_id,contact_id,dialed_number,dialed_extension,origin,state,call_start,call_end,duration_issue,channel_id,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'import','closed',$9,$10,$11,$12,$13) RETURNING attempt_id",[uuid,assignment.assignment_id,campaign,client,agent,contact,String(v[old?5:1]).trim(),old?null:String(v[7]??''),start,end,issue,channel.channel_id,`Importado de ${sources[source].file}, fila ${r.row}.`])).rows[0].attempt_id;
  await query('INSERT INTO call_import_provenance(attempt_id,source_file,source_sha256,source_sheet,source_row,raw_data) VALUES($1,$2,$3,$4,$5,$6)',[a,sources[source].file,sources[source].hash,old?'SILIMEX':'LLAMADAS',r.row,JSON.stringify(v)]);
  const ix=`${v[0]}/${key}/${agent}`;assert(!callIndex.has(ix),`Ambiguous survey call ${ix}`);callIndex.set(ix,a);
  counts[old?'oldCalls':'septemberCalls']++;
 }
 console.log(source,'calls complete');
}
const version=(await query("INSERT INTO questionnaire_versions(campaign_id,version_name,effective_from,effective_to,is_active) VALUES($1,'Histórico abril–agosto 2026','2026-04-01','2026-08-31',false) RETURNING version_id",[campaign])).rows[0].version_id;
const oldQuestions=[];
for(let i=5;i<=14;i++)oldQuestions.push((await query("INSERT INTO questionnaire_questions(version_id,code,question_text,question_type,required,display_order) VALUES($1,$2,$3,'text',false,$4) RETURNING question_id",[version,'H'+(i-4),sources.agosto.data.ENCUESTA[0].values[i],i-4])).rows[0].question_id);
let matched=0,independent=0,newSurveys=0;const surveyAttempts=new Set();
for(const source of ['agosto','ordaz','abechuco12','abechuco']) {
 const old=source==='agosto';
 for(const r of sources[source].data[old?'ENCUESTA':'ENCUESTAS 2'].slice(1)) {
  const v=r.values;if(!old&&![6,7,8,9,10,11,12].some(i=>v[i]))continue;
  const agent=agents.get(String(v[2]).trim());assert(agent);const client=await clientFor(v[1]);
  const attempt=callIndex.get(`${v[0]}/${String(v[1]).trim().toUpperCase()}/${agent}`);
  let ver=version;const answers=[];let missingReason=false;
  if(old) {for(let i=5;i<=14;i++)if(v[i]!==null&&String(v[i]).trim())answers.push({questionId:oldQuestions[i-5],option:null,text:String(v[i]).trim()});}
  else {
   ver=config.questionnaire_versions.find(v=>v.campaign_id===campaign&&v.is_active).version_id;
   for(const [idx,col,reason] of [[1,6,null],[2,7,null],[3,8,9],[4,10,null],[5,11,12]]) {
    const q=config.questionnaire_questions.find(q=>q.version_id===ver&&q.code==='Q'+idx);assert(q);
    const opts=config.questionnaire_options.filter(o=>o.question_id===q.question_id);
    const option=opts.find(o=>norm(o.option_text)===norm(v[col]))??opts.find(o=>/^[a-d]\)/i.test(String(v[col]))&&norm(o.option_text).slice(0,2)===norm(v[col]).slice(0,2));
    assert(option,`Unmapped answer ${source} row ${r.row} Q${idx}`);
    const text=reason&&v[reason]?String(v[reason]).trim():null;if(option.requires_reason&&!text)missingReason=true;
    answers.push({questionId:q.question_id,optionId:option.option_id,option:option.option_text,text});
   }
  }
  if(!attempt||surveyAttempts.has(attempt)||missingReason){assert(old||missingReason);independent++;await query('INSERT INTO historical_survey_records(client_id,campaign_id,agent_id,version_id,completed_at,business_name,branch,answers,source_file,source_sha256,source_row,matched_attempt_id,link_issue,raw_data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[client,campaign,agent,ver,timestamp(v[0]),String(v[3]).trim(),old?v[4]:v[5],JSON.stringify(answers),sources[source].file,sources[source].hash,r.row,attempt??null,missingReason?'El archivo no proporciona la razón obligatoria de una respuesta; se conserva vacía.':attempt?'Dos encuestas con respuestas diferentes para la misma llamada.':'Sin llamada coincidente.',JSON.stringify(v)]);}
  else {
   const survey=(await query("INSERT INTO call_surveys(attempt_id,campaign_id,version_id,state,started_at,completed_at) VALUES($1,$2,$3,'completed',$4,$4) RETURNING survey_id",[attempt,campaign,ver,timestamp(v[0])])).rows[0].survey_id;
   for(const a of answers)await query('INSERT INTO survey_answers(survey_id,version_id,question_id,option_id,answer_text) VALUES($1,$2,$3,$4,$5)',[survey,ver,a.questionId,a.optionId??null,a.text]);
   if(old)matched++;
   surveyAttempts.add(attempt);
  }
  if(!old)newSurveys++;
  if(attempt)await query(`UPDATE call_import_provenance SET raw_data=
    (CASE WHEN jsonb_typeof(raw_data)='array' THEN jsonb_build_object('call',raw_data) ELSE raw_data END)
    || jsonb_build_object('surveys',coalesce(raw_data->'surveys','[]'::jsonb)||$2::jsonb)
    WHERE attempt_id=$1`,[attempt,JSON.stringify([{source_file:sources[source].file,source_sha256:sources[source].hash,source_row:r.row,values:v}])]);
 }
}
for(const r of sources.agosto.data.CONCENTRADO) {
 const v=r.values;if(!(v[1]>=4&&v[1]<=8))continue;
 await query('INSERT INTO historical_monthly_totals(campaign_id,year,month,total_marcaciones,llamadas,backoffice,blacklist,exitoso,colgo,nuevos_datos,seguimiento,tpa_seconds,source_file,source_sha256) VALUES($1,2026,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[campaign,v[1],v[2],v[3],v[5],v[6],v[7],v[8],v[9],v[10],v[1]===8?40.380:v[1]===7?49.579:null,sources.agosto.file,sources.agosto.hash]);
}
await query('UPDATE users SET is_active=false WHERE user_id=$1',[alma]);
await query('COMMIT');
assert.equal(counts.oldCalls,7911);assert.equal(counts.septemberCalls,638);assert.equal(counts.invalidSeptemberTimes,177);assert.equal(matched,378);assert.equal(independent,36);assert.equal(newSurveys,13);assert.equal(duplicates.length,1);
const checks={calls:'SELECT count(*)::int AS n FROM call_attempts',clients:'SELECT count(*)::int AS n FROM clients',activeClients:'SELECT count(*)::int AS n FROM clients WHERE is_active',surveys:"SELECT count(*)::int AS n FROM call_surveys WHERE state='completed'",independent:'SELECT count(*)::int AS n FROM historical_survey_records',monthly:'SELECT sum(total_marcaciones)::int AS n FROM historical_monthly_totals',finalized:'SELECT count(*)::int AS n FROM vw_contactos_finalizados',blacklist:'SELECT count(*)::int AS n FROM contact_blacklist WHERE ended_at IS NULL',almaActive:`SELECT count(*)::int AS n FROM users WHERE user_id=${alma} AND is_active`,almaAssignments:`SELECT count(*)::int AS n FROM contact_assignments WHERE agent_id=${alma} AND ended_at IS NULL`,pending:"SELECT count(*)::int AS n FROM vw_contactos_disponibles d JOIN contact_assignments a USING(assignment_id) WHERE NOT EXISTS(SELECT 1 FROM call_attempts c JOIN contact_assignments ca ON ca.assignment_id=c.assignment_id WHERE ca.round_id=a.round_id AND c.client_id=d.client_id)"};
const results={};for(const [name,sql] of Object.entries(checks))results[name]=(await query(sql)).rows[0].n;
const guard=[];
guard.push("IF current_database()<>'vincco_telemarketing' THEN RAISE EXCEPTION 'Base incorrecta'; END IF;");
for(const [table,cols] of Object.entries(cfg))guard.push(`IF (SELECT jsonb_agg(to_jsonb(t) ORDER BY 1) FROM (SELECT ${cols} FROM ${table}) t) IS DISTINCT FROM ${quote(config[table])}::jsonb THEN RAISE EXCEPTION 'Cambio de configuración: ${table}'; END IF;`);
// Explicit ordering by identifier for JSON guards.
for(let i=1;i<guard.length;i++)guard[i]=guard[i].replace('jsonb_agg(to_jsonb(t) ORDER BY 1)',`jsonb_agg(to_jsonb(t) ORDER BY t.${Object.values(cfg)[i-1].split(',')[0]})`);
guard.push(`IF (SELECT jsonb_agg(to_jsonb(t) ORDER BY user_id) FROM (SELECT user_id,username,full_name,role,is_active FROM users) t) IS DISTINCT FROM ${quote(users)}::jsonb THEN RAISE EXCEPTION 'Cambió la lista de usuarios'; END IF;`);
for(const [table,count] of Object.entries(guardCounts))guard.push(`IF (SELECT count(*) FROM ${table})<>${count} THEN RAISE EXCEPTION 'Cambió ${table}; regenerar script antes de borrar'; END IF;`);
const transaction=`-- SILIMEX: ejecutar TODO en Query Tool como propietario, con la aplicación detenida.\n-- Sustituye datos operativos de prueba. Conserva usuarios/configuración y audit_log.\nBEGIN;\nSET LOCAL TIME ZONE 'America/Hermosillo';\nSET LOCAL standard_conforming_strings=on;\nSET LOCAL lock_timeout='10s';\nLOCK TABLE ${[...operational,'users',...Object.keys(cfg)].join(',')} IN ACCESS EXCLUSIVE MODE;\nDO $guard$ BEGIN\n${guard.join('\n')}\nEND $guard$;\n${migrations[2].replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'')}\nTRUNCATE ${[...operational,'historical_survey_records','historical_monthly_totals','call_import_provenance'].join(',')};\n${journal.join('\n')}\nSET CONSTRAINTS ALL IMMEDIATE;\nDO $verify$ BEGIN\n${Object.entries(checks).map(([name,sql])=>`IF (${sql})<>${results[name]} THEN RAISE EXCEPTION 'Verificación fallida: ${name}'; END IF;`).join('\n')}\nEND $verify$;\nCOMMIT;\nSELECT 'CARGA SILIMEX COMPLETADA' AS resultado,${results.calls} AS llamadas,${results.activeClients} AS contactos_base,${results.pending} AS pendientes;\n`;
await fs.writeFile(out+'CARGA_SILIMEX_PGADMIN.sql',transaction);
await fs.writeFile(out+'validation.json',JSON.stringify({createdAt:new Date().toISOString(),counts,matched,independent,newSurveys,duplicates,results,sources:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,{file:v.file,hash:v.hash}])),replay:'pending'},null,2));
// Test the exact generated transaction against a second, disposable database.
await engine.close();engine=new PGlite();await seed(engine);
let rehearsal=transaction.replace("current_database()<>'vincco_telemarketing'","false");
// Initial fixture intentionally has no operational test rows; only these preflight counts differ.
for(const [table,count] of Object.entries(guardCounts))rehearsal=rehearsal.replace(`(SELECT count(*) FROM ${table})<>${count}`,`(SELECT count(*) FROM ${table})<>0`);
await engine.exec(rehearsal);
for(const [name,sql] of Object.entries(checks))assert.equal((await engine.query(sql)).rows[0].n,results[name],name);
await fs.writeFile(out+'validation.json',JSON.stringify({createdAt:new Date().toISOString(),counts,matched,independent,newSurveys,duplicates,results,replay:'passed'},null,2));
console.log('REPLAY PASSED',JSON.stringify(results));
// Optional report preview uses the same tested application exporter against rehearsal data.
if(process.argv.includes('--report')){const {generateMonthlyClosing}=await import('../../dist/modules/reports/reports.service.js');const report=await generateMonthlyClosing({campaignId:campaign,year:2026,month:9});await fs.writeFile(out+'BORRADOR_'+report.fileName,report.buffer);}
await pool.end();await engine.close();
