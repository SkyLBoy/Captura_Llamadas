import 'dotenv/config';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import {spawnSync} from 'node:child_process';
const source=JSON.parse(await fs.readFile('tools/silimex-load/abechuco-update-data.json','utf8'));
const db=new pg.Client();await db.connect();
const apply=process.argv.includes('--apply');
const rehearse=process.argv.includes('--rehearse');
const write=apply||rehearse;
const norm=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase().replace(/\s+/g,' ');
const phone=x=>String(x??'').replace(/\D/g,'');
const stamp=x=>String(x).replace(' ','T')+'-07:00';
try {
 if(apply){const backup='backups/silimex-before-real-load-20260915/pre-monserrat-incremental-'+Date.now()+'.dump';const tables=['call_attempts','call_surveys','survey_answers','contact_persons','contact_blacklist','contact_finalizations','import_log','import_detail','audit_log'];const result=spawnSync('C:/Program Files/PostgreSQL/18/bin/pg_dump.exe',['--format=custom','--no-password','--file',backup,...tables.flatMap(t=>['--table',t])],{env:process.env,encoding:'utf8',windowsHide:true});assert.equal(result.status,0,'Backup of affected tables failed: '+result.stderr);}
 await db.query(write?'BEGIN':'BEGIN READ ONLY');
 await db.query("SET LOCAL TIME ZONE 'America/Hermosillo'");
 const agent=(await db.query("SELECT user_id FROM users WHERE full_name='Monserrat Abechuco' AND role='agent' AND is_active")).rows;assert.equal(agent.length,1);
 const agentId=agent[0].user_id;
 const campaign=(await db.query("SELECT campaign_id FROM campaigns WHERE name='SILIMEX'")).rows[0].campaign_id;
 if(write){await db.query('SELECT pg_advisory_xact_lock($1)',[campaign]);await db.query("SELECT set_config('app.user_id',$1,true)",[String((await db.query("SELECT user_id FROM users WHERE role='admin' AND is_active ORDER BY user_id LIMIT 1")).rows[0].user_id)]);}
 const existing=(await db.query("SELECT attempt_id,client_key_snapshot AS key,dialed_number,call_start::text AS start,channel_code_snapshot AS channel FROM call_attempts WHERE agent_id=$1 AND campaign_id=$2 AND call_start>='2026-09-15' AND call_start<'2026-09-16'",[agentId,campaign])).rows;
 const identity=(date,key,num)=>`${String(date).slice(0,19).replace('T',' ')}/${norm(key)}/${phone(num)}`;
 const previous=new Map(existing.map(r=>[identity(r.start,r.key,r.dialed_number),r]));
 const channels=(await db.query('SELECT channel_id,code,description FROM channels WHERE campaign_id=$1 AND is_active',[campaign])).rows;
 const rows=source.data.LLAMADAS.slice(1).filter(r=>/^2026-/.test(String(r.values[0])));
 const plans=[],seen=new Set();let duplicates=0,invalidTimes=0;
 const questions=(await db.query("SELECT q.*,o.option_id,o.option_text,o.requires_reason FROM questionnaire_questions q JOIN questionnaire_versions v USING(version_id) JOIN questionnaire_options o USING(question_id) WHERE v.campaign_id=$1 AND v.is_active",[campaign])).rows;
 for(const r of rows){const v=r.values;assert.equal(String(v[0]).slice(0,10),'2026-09-15');assert.equal(norm(v[11]),'MONSERRAT ABECHUCO');const id=identity(v[0],v[2],v[1]);assert(!seen.has(id),'Duplicate identity inside workbook');seen.add(id);
 const channel=channels.find(c=>norm(c.description)===norm(v[13])||c.code.replaceAll('_',' ')===norm(v[13]));assert(channel,'Unknown channel');
 if(previous.has(id)){if(previous.get(id).channel!==channel.code)console.log('Existing call has a different channel in source; preserved unchanged, row '+r.row);duplicates++;continue;}
 const assignments=(await db.query("SELECT a.assignment_id,a.client_id,a.contact_id FROM contact_assignments a JOIN clients c USING(client_id) WHERE c.source_namespace='campaign:SILIMEX' AND c.clave=$1 AND a.campaign_id=$2 AND a.agent_id=$3 AND a.ended_at IS NULL",[norm(v[2]),campaign,agentId])).rows;assert.equal(assignments.length,1,'Missing or ambiguous assignment at source row '+r.row);
 let end=/^\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(String(v[15]))?stamp(v[0].slice(0,10)+' '+v[15]):null;
 if(!end||new Date(end)<new Date(stamp(v[0]))){end=null;invalidTimes++;}
 const surveys=source.data['ENCUESTAS 2'].slice(1).filter(s=>s.values[0]===v[0]&&norm(s.values[1])===norm(v[2])&&[6,7,8,9,10,11,12].some(i=>s.values[i]));assert(surveys.length<=1);
 const answers=[];
 if(surveys.length){const sv=surveys[0].values;assert.equal(norm(sv[2]),'MONSERRAT ABECHUCO');for(const [q,col,reason] of [[1,6,null],[2,7,null],[3,8,9],[4,10,null],[5,11,12]]){const opts=questions.filter(o=>o.code==='Q'+q);const option=opts.find(o=>norm(o.option_text)===norm(sv[col]))??opts.find(o=>/^[a-d]\)/i.test(String(sv[col]))&&norm(o.option_text).slice(0,2)===norm(sv[col]).slice(0,2));assert(option,'Unknown survey answer row '+surveys[0].row);const text=reason&&sv[reason]?String(sv[reason]).trim():null;assert(!option.requires_reason||text,'Missing mandatory reason row '+surveys[0].row);answers.push({...option,text});}}
 plans.push({r,id,assignment:assignments[0],channel,end,survey:surveys[0],answers});
 }
 for(const id of previous.keys())assert(seen.has(id),'Existing call missing from updated workbook');
 const summary={sourceHash:source.sha256,fileCalls:rows.length,alreadyPresent:duplicates,newCalls:plans.length,newSurveys:plans.filter(p=>p.survey).length,invalidNewTimes:invalidTimes};console.log(JSON.stringify(summary));
 if(write&&plans.length){
 const admin=(await db.query("SELECT user_id FROM users WHERE role='admin' AND is_active ORDER BY user_id LIMIT 1")).rows[0].user_id;
 const log=(await db.query("INSERT INTO import_log(file_name,file_sha256,user_id,campaign_id,rows_processed,result) VALUES($1,$2,$3,$4,$5,'pending') RETURNING import_id",[source.file,source.sha256,admin,campaign,rows.length])).rows[0].import_id;
 for(const p of plans){const v=p.r.values;const a=p.assignment;
 const uuid=crypto.createHash('sha256').update(`SILIMEX/${agentId}/${p.id}`).digest('hex').slice(0,32).replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,'$1-$2-$3-$4-$5');
 let contact=a.contact_id;if(v[4]&&String(v[4]).trim()!=='0')contact=(await db.query('INSERT INTO contact_persons(client_id,nombre,is_active) VALUES($1,$2,false) RETURNING contact_id',[a.client_id,String(v[4]).trim()])).rows[0].contact_id;
 const attempt=(await db.query("INSERT INTO call_attempts(idempotency_key,assignment_id,campaign_id,client_id,agent_id,contact_id,dialed_number,dialed_extension,origin,state,call_start,call_end,duration_issue,channel_id,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'import','closed',$9,$10,$11,$12,$13) RETURNING attempt_id",[uuid,a.assignment_id,campaign,a.client_id,agentId,contact,String(v[1]).trim(),String(v[7]??''),stamp(v[0]),p.end,p.end?null:'Hora final de Excel no verificable; ver import_detail.',p.channel.channel_id,`Carga incremental ${source.file}, fila ${p.r.row}.`])).rows[0].attempt_id;
 let survey=null;if(p.survey){survey=(await db.query("INSERT INTO call_surveys(attempt_id,campaign_id,version_id,state,started_at,completed_at) VALUES($1,$2,$3,'completed',$4,$4) RETURNING survey_id",[attempt,campaign,p.answers[0].version_id,stamp(v[0])])).rows[0].survey_id;for(const answer of p.answers)await db.query('INSERT INTO survey_answers(survey_id,version_id,question_id,option_id,answer_text) VALUES($1,$2,$3,$4,$5)',[survey,answer.version_id,answer.question_id,answer.option_id,answer.text]);}
 await db.query("INSERT INTO import_detail(import_id,sheet_name,row_number,source_data,client_id,attempt_id,survey_id,result) VALUES($1,'LLAMADAS',$2,$3,$4,$5,$6,'imported')",[log,p.r.row,JSON.stringify({call:v,survey:p.survey??null,identity:p.id}),a.client_id,attempt,survey]);
 }
 await db.query("UPDATE import_log SET result='success' WHERE import_id=$1",[log]);await db.query('SET CONSTRAINTS ALL IMMEDIATE');
 const count=Number((await db.query("SELECT count(*) FROM call_attempts WHERE agent_id=$1 AND campaign_id=$2 AND call_start>='2026-09-15' AND call_start<'2026-09-16'",[agentId,campaign])).rows[0].count);assert.equal(count,rows.length);
 }
 await db.query(rehearse?'ROLLBACK':'COMMIT');console.log(rehearse?'REHEARSAL PASSED AND ROLLED BACK':apply?'APPLIED':'READ ONLY CHECK PASSED');
}catch(e){await db.query('ROLLBACK');console.error(e.message);process.exitCode=1;}finally{await db.end();}
