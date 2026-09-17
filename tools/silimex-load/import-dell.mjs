// Read-only by default. --rehearse validates all writes then rolls back.
// --apply commits only complete, new calls and their associated contacts.
import 'dotenv/config';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
import {spawnSync} from 'node:child_process';
const apply=process.argv.includes('--apply'),rehearse=process.argv.includes('--rehearse'),write=apply||rehearse;
const sources=JSON.parse(await fs.readFile('tools/silimex-load/dell-data.json','utf8'));
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase().replace(/\s+/g,' ');
const text=v=>v==null||v===0?null:String(v).trim()||null;
const phone=v=>String(v??'').replace(/\D/g,'');
const stamp=v=>String(v).replace(' ','T')+'-07:00';
const identity=(v)=>[v[0].slice(0,19).replace('T',' '),norm(v[2]),phone(v[1])].join('/');
const db=new pg.Client();await db.connect();const summaries=[];
try {
 for(const [file,s]of Object.entries(sources))assert.equal(crypto.createHash('sha256').update(await fs.readFile('C:/Users/VNCAdmin-12/Downloads/'+file)).digest('hex'),s.hash,'Source changed since inspection');
 if(apply){const tables=['clients','contact_persons','phone_numbers','email_addresses','contact_assignments','work_rounds','call_attempts','contact_blacklist','contact_finalizations','import_log','import_detail','audit_log','channels'];const dest='backups/silimex-before-real-load-20260915/pre-dell-'+Date.now()+'.dump';const r=spawnSync('C:/Program Files/PostgreSQL/18/bin/pg_dump.exe',['--format=custom','--no-password','--file',dest,...tables.flatMap(t=>['--table',t])],{env:process.env,encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);}
 await db.query(write?'BEGIN':'BEGIN READ ONLY');await db.query("SET LOCAL TIME ZONE 'America/Hermosillo'");
 const campaign=(await db.query("SELECT campaign_id FROM campaigns WHERE name='PARTNER DELL' AND is_active")).rows[0].campaign_id;
 const admin=(await db.query("SELECT user_id FROM users WHERE role='admin' AND is_active ORDER BY user_id LIMIT 1")).rows[0].user_id;
 if(write){await db.query('SELECT pg_advisory_xact_lock($1)',[campaign]);await db.query("SELECT set_config('app.user_id',$1,true)",[String(admin)]);}
 // This flag requires the user's explicit classification decision.
 if(process.argv.includes('--agenda-seguimiento')&&write)await db.query("UPDATE channels SET disposition_id=(SELECT disposition_id FROM dispositions WHERE campaign_id=$1 AND code='SEGUIMIENTO') WHERE campaign_id=$1 AND code='AGENDA_LLAMADA'",[campaign]);
 const channels=(await db.query('SELECT c.*,d.code AS outcome FROM channels c JOIN dispositions d USING(disposition_id) WHERE c.campaign_id=$1 AND c.is_active',[campaign])).rows;
 const unchangedSilimex=(await db.query("SELECT count(*)::int AS n FROM call_attempts a JOIN campaigns c USING(campaign_id) WHERE c.name='SILIMEX'")).rows[0].n;
 for(const [file,source] of Object.entries(sources)){
  const name=file.includes('ABECHUCO')?'Monserrat Abechuco':'Carlos Ordaz';
  const agent=(await db.query("SELECT user_id FROM users WHERE full_name=$1 AND role='agent' AND is_active",[name])).rows[0].user_id;
  const existing=(await db.query("SELECT attempt_id,call_start::text AS start,client_key_snapshot,dialed_number FROM call_attempts WHERE campaign_id=$1 AND agent_id=$2 AND call_start>='2026-09-01' AND call_start<'2026-10-01'",[campaign,agent])).rows;
  const known=new Set(existing.map(r=>identity([r.start,r.dialed_number,r.client_key_snapshot])));
  const seen=new Set(),plans=[],pending=[];let duplicates=0,invalidTimes=0;
  const branches=source.sheets.BASE.filter(r=>norm(r.values[1])==='SUCURSAL').map(r=>({code:norm(r.values[0]),name:text(r.values[3])}));
  for(const row of source.sheets.LLAMADAS.slice(1)){
   const v=row.values;if(!/^2026-/.test(String(v[0])))continue;assert.equal(v[0].slice(0,7),'2026-09');assert.equal(norm(v[11]),norm(name));
   const key=identity(v);assert(!seen.has(key),'Duplicate within source');seen.add(key);
   if(known.has(key)){duplicates++;continue;}
   if(!text(v[13])){pending.push({row:row.row,date:v[0],client:norm(v[2])});continue;}
   const channel=channels.find(c=>norm(c.description)===norm(v[13])||c.code.replaceAll('_',' ')===norm(v[13]));assert(channel,'Unknown channel row '+row.row);
   if(channel.code==='AGENDA_LLAMADA'&&channel.outcome==='EXITOSO'&&norm(v[14])==='SEGUIMIENTO'&&!process.argv.includes('--agenda-exitoso')&&!process.argv.includes('--agenda-seguimiento')){pending.push({row:row.row,date:v[0],client:norm(v[2]),reason:'Pendiente confirmar AGENDA LLAMADA'});continue;}
   const bases=source.sheets.BASE.filter(b=>norm(b.values[0])===norm(v[2]));assert.equal(bases.length,1,'Ambiguous base row '+row.row);
   const b=bases[0].values;const branch=branches.filter(br=>norm(v[2]).startsWith(br.code)).sort((a,b)=>b.code.length-a.code.length)[0];assert(branch,'Missing branch');
   if(text(b[13]))assert(phone(b[13]).length>=10&&/^[+\d\s().-]+$/.test(String(b[13])),'Invalid corrected phone');
   let end=/^\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(String(v[15]))?stamp(v[0].slice(0,10)+' '+v[15]):null;if(!end||new Date(end)<new Date(stamp(v[0]))){end=null;invalidTimes++;}
   plans.push({row,base:bases[0],channel,end,branch,key});
  }
  const summary={agent:name,file,newCalls:plans.length,duplicates,pending,invalidTimes,contacts:new Set(plans.map(p=>norm(p.row.values[2]))).size};summaries.push(summary);console.log(JSON.stringify(summary));
  if(!write||!plans.length)continue;
  const log=(await db.query("INSERT INTO import_log(file_name,file_sha256,user_id,campaign_id,rows_processed,result,error_message) VALUES($1,$2,$3,$4,$5,'pending',$6) RETURNING import_id",[file,source.hash,admin,campaign,plans.length, pending.length?'Filas incompletas pendientes: '+pending.map(p=>p.row).join(', '):null])).rows[0].import_id;
  let round=(await db.query('SELECT round_id FROM work_rounds WHERE campaign_id=$1 AND agent_id=$2 AND ended_at IS NULL',[campaign,agent])).rows[0];
  if(!round)round=(await db.query("INSERT INTO work_rounds(campaign_id,agent_id,name,started_at,created_by_user_id) VALUES($1,$2,'Septiembre 2026 · carga inicial','2026-09-01 00:00:00-07',$3) RETURNING round_id",[campaign,agent,admin])).rows[0];
  const clients=new Map();
  // Prepare assignments before historical successes and blacklist activate guards.
  for(const p of plans){const key=norm(p.row.values[2]);if(clients.has(key))continue;const b=p.base.values;
   let client=(await db.query("SELECT client_id FROM clients WHERE source_namespace='campaign:PARTNER DELL' AND clave=$1",[key])).rows[0];
   let contact;
   if(!client){client=(await db.query("INSERT INTO clients(source_namespace,clave,marca,tipo_compra,razon_social,sucursal) VALUES('campaign:PARTNER DELL',$1,$2,$3,$4,$5) RETURNING client_id",[key,text(b[1]),text(b[2]),text(b[3]),p.branch.name])).rows[0];
    contact=(await db.query('INSERT INTO contact_persons(client_id,nombre,ejecutivo) VALUES($1,$2,$3) RETURNING contact_id',[client.client_id,text(b[15])||text(b[9]),text(b[11])])).rows[0].contact_id;
    for(const [type,num,ext]of [['main',text(b[13])||text(b[4]),text(b[13])?'':text(b[5])||''],['reference1',text(b[6]),''],['reference2',text(b[7]),''],['mobile',text(b[8]),'']])if(num)await db.query('INSERT INTO phone_numbers(contact_id,type,number,extension,normalized_number) VALUES($1,$2,$3,$4,$5)',[contact,type,num,ext,phone(num).length>=10?phone(num).slice(-10):null]);
    for(const email of [...new Set(String(text(b[14])||text(b[10])||'').split(/[;,\s]+/).filter(Boolean))])await db.query('INSERT INTO email_addresses(contact_id,email) VALUES($1,$2)',[contact,email]);
   }
   let assignment=(await db.query('SELECT assignment_id,agent_id,contact_id FROM contact_assignments WHERE client_id=$1 AND campaign_id=$2 AND ended_at IS NULL',[client.client_id,campaign])).rows[0];
   if(assignment)assert.equal(assignment.agent_id,agent,'Contact belongs to another agent');
   else assignment=(await db.query("INSERT INTO contact_assignments(client_id,contact_id,campaign_id,agent_id,round_id,started_at) VALUES($1,$2,$3,$4,$5,'2026-09-01 00:00:00-07') RETURNING assignment_id,contact_id",[client.client_id,contact??null,campaign,agent,round.round_id])).rows[0];
   const detail=(await db.query("INSERT INTO import_detail(import_id,sheet_name,row_number,source_data,client_id,result) VALUES($1,'BASE',$2,$3,$4,'imported') RETURNING detail_id",[log,p.base.row,JSON.stringify({values:b,status:norm(b[12])}),client.client_id])).rows[0].detail_id;
   clients.set(key,{...client,...assignment,baseDetail:detail,status:norm(b[12])});
  }
  for(const p of plans){const v=p.row.values,c=clients.get(norm(v[2]));let contact=c.contact_id;
   if(text(v[4]))contact=(await db.query('INSERT INTO contact_persons(client_id,nombre,is_active) VALUES($1,$2,false) RETURNING contact_id',[c.client_id,text(v[4])])).rows[0].contact_id;
   const uuid=crypto.createHash('sha256').update(`PARTNER DELL/${agent}/${p.key}`).digest('hex').slice(0,32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5');
   const attempt=(await db.query("INSERT INTO call_attempts(idempotency_key,assignment_id,campaign_id,client_id,agent_id,contact_id,dialed_number,dialed_extension,origin,state,call_start,call_end,duration_issue,channel_id,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'import','closed',$9,$10,$11,$12,$13) RETURNING attempt_id",[uuid,c.assignment_id,campaign,c.client_id,agent,contact,String(v[1]).trim(),text(v[7]),stamp(v[0]),p.end,p.end?null:'Hora final de Excel no verificable; consultar procedencia en import_detail.',p.channel.channel_id,`Importado de ${file}, fila ${p.row.row}.`])).rows[0].attempt_id;
   await db.query("INSERT INTO import_detail(import_id,sheet_name,row_number,source_data,client_id,attempt_id,result) VALUES($1,'LLAMADAS',$2,$3,$4,$5,'imported')",[log,p.row.row,JSON.stringify({values:v,identity:p.key,sourceDisposition:v[14]}),c.client_id,attempt]);
  }
  for(const c of clients.values())if(c.status==='BLACKLIST')await db.query("INSERT INTO contact_blacklist(client_id,campaign_id,import_detail_id,reason) VALUES($1,$2,$3,'BLACKLIST en BASE; fecha original no disponible') ON CONFLICT(client_id,campaign_id) WHERE ended_at IS NULL DO NOTHING",[c.client_id,campaign,c.baseDetail]);
  await db.query("UPDATE import_log SET result=$2 WHERE import_id=$1",[log,pending.length?'partial':'success']);
  const after=Number((await db.query("SELECT count(*) FROM call_attempts WHERE campaign_id=$1 AND agent_id=$2 AND call_start>='2026-09-01' AND call_start<'2026-10-01'",[campaign,agent])).rows[0].count);assert.equal(after,existing.length+plans.length);
 }
 assert.equal((await db.query("SELECT count(*)::int AS n FROM call_attempts a JOIN campaigns c USING(campaign_id) WHERE c.name='SILIMEX'")).rows[0].n,unchangedSilimex);
 if(write)await db.query('SET CONSTRAINTS ALL IMMEDIATE');await db.query(rehearse?'ROLLBACK':'COMMIT');
 if(apply)await fs.writeFile('backups/silimex-before-real-load-20260915/dell-import-validation.json',JSON.stringify({at:new Date().toISOString(),summaries},null,2));
 console.log(rehearse?'REHEARSAL PASSED AND ROLLED BACK':apply?'APPLIED':'READ ONLY CHECK PASSED');
}catch(error){await db.query('ROLLBACK');console.error(error.message);process.exitCode=1;}finally{await db.end();}
