import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PGlite } from '../../tools/pglite/package/dist/index.js';
const db = new PGlite();
const results = [];
const run = async sql => db.exec(sql);
const one = async sql => (await db.query(sql)).rows[0];
const check = async (name, fn) => {
  await fn(); results.push(name); console.log('OK: ' + name);
};
async function reject(sql, pattern) {
  let error;
  try { await run('BEGIN; ' + sql + '; COMMIT;'); } catch(e) { error=e; await run('ROLLBACK'); }
  assert(error, 'Se esperaba rechazo: ' + sql);
  if(pattern) assert.match(error.message, pattern);
}
try {
  const version = (await one('SELECT version() AS version')).version;
  console.log(version);
  await check('Esquema completo, catálogos y vistas en una base vacía', async () => {
    await run(await fs.readFile(new URL('../../database/schema.sql',import.meta.url),'utf8'));
    assert.equal((await one('SELECT count(*)::int AS n FROM campaigns')).n,2);
    assert.equal((await one('SELECT count(*)::int AS n FROM questionnaire_questions')).n,5);
    assert.equal((await one('SELECT count(*)::int AS n FROM questionnaire_options')).n,20);
    for (const row of (await db.query("SELECT viewname FROM pg_views WHERE schemaname='public'")).rows) {
      await db.query('SELECT * FROM "' + row.viewname + '" LIMIT 1');
    }
  });
  await run(`INSERT INTO users(username,password_hash,full_name,role) VALUES
    ('a','HASH_FICTICIO','Agente A','agent'),('b','HASH_FICTICIO','Agente B','agent'),('admin','HASH_FICTICIO','Administrador','admin');
    BEGIN; SET LOCAL app.user_id='3';
    INSERT INTO clients(source_namespace,clave,razon_social) VALUES ('PRUEBA','001','Empresa 1'),('PRUEBA','002','Empresa 2'),('PRUEBA','003','Empresa 3');
    INSERT INTO contact_persons(client_id,nombre) VALUES (1,'Persona 1'),(2,NULL),(3,'Persona 3');
    INSERT INTO phone_numbers(contact_id,type,number) VALUES (1,'main','001234'),(2,'main','001234');
    INSERT INTO contact_assignments(client_id,contact_id,campaign_id,agent_id,started_at) VALUES
      (1,1,1,1,'2026-01-01Z'),(2,2,1,2,'2026-01-01Z'),(3,3,2,1,'2026-01-01Z');
    COMMIT;`);
  await check('Auditoría registra clave correcta, actor y valores', async () => {
    const r = await one("SELECT * FROM audit_log WHERE table_name='clients' AND record_id=1 ORDER BY audit_id LIMIT 1");
    assert.equal(r.changed_by_user_id,3); assert.equal(r.new_values.clave,'001');
    await run("BEGIN; SET LOCAL app.user_id='3'; UPDATE clients SET razon_social='Empresa 1 editada' WHERE client_id=1; COMMIT;");
    const changed=await one("SELECT old_values,new_values FROM audit_log WHERE table_name='clients' AND operation='UPDATE' ORDER BY audit_id DESC LIMIT 1");
    assert.equal(changed.old_values.razon_social,'Empresa 1'); assert.equal(changed.new_values.razon_social,'Empresa 1 editada');
  });
  await check('Asignación simultánea del mismo cliente y campaña rechazada', async()=>{
    await reject("INSERT INTO contact_assignments(client_id,campaign_id,agent_id) VALUES(1,1,2)",/duplicate key/);
    await reject("INSERT INTO contact_assignments(client_id,campaign_id,agent_id) VALUES(3,1,3)",/agente activo/);
  });
  const channel = async (code,c=1) => (await db.query('SELECT channel_id FROM channels WHERE code=$1 AND campaign_id=$2',[code,c])).rows[0].channel_id;
  const ids={no:await channel('NO_CONTESTA'),buz:await channel('BUZON'),black:await channel('NUMERO_EQUIVOCADO'),reason:await channel('NUEVOS_DATOS_RAZON_SOCIAL',2),survey:await channel('SE_ENVIA_PROMOCION_POR_CORREO',2)};
  const start = async (key,assignment=1,client=1,agent=1,campaign=1,time='2026-08-01 08:00:00-07') => {
    const r=await db.query(`INSERT INTO call_attempts(idempotency_key,assignment_id,campaign_id,client_id,agent_id,dialed_number,call_start)
     VALUES($1,$2,$3,$4,$5,'001234',$6) RETURNING attempt_id`,[key,assignment,campaign,client,agent,time]);
    return r.rows[0].attempt_id;
  };
  const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
  let a;
  await check('Inicio, recuperación, idempotencia y una llamada abierta por agente',async()=>{
    a=await start(uuid(1));
    assert.equal((await one("SELECT count(*)::int n FROM call_attempts WHERE state='open'")).n,1);
    await reject(`INSERT INTO call_attempts(idempotency_key,assignment_id,campaign_id,client_id,agent_id,dialed_number,call_start) VALUES('${uuid(1)}',1,1,1,1,'001234','2026-08-01 08:00-07')`,/duplicate key/);
    await reject(`INSERT INTO call_attempts(idempotency_key,assignment_id,campaign_id,client_id,agent_id,dialed_number,call_start) VALUES('${uuid(2)}',1,1,1,1,'001234','2026-08-01 08:00-07')`,/duplicate key/);
  });
  await check('Resultados incompatibles o pendientes rechazados; llamada sigue abierta',async()=>{
    await reject(`UPDATE call_attempts SET state='closed',call_end=call_start+interval '1 minute',channel_id=${await channel('NO_CONTESTA',2)} WHERE attempt_id=${a}`,/Canalización/);
    await reject(`UPDATE call_attempts SET state='closed',call_end=call_start+interval '1 minute',channel_id=${await channel('NUEVOS_DATOS')} WHERE attempt_id=${a}`,/pendiente/);
    await reject(`UPDATE call_attempts SET state='closed',call_end=call_start+interval '1 minute',channel_id=${ids.buz},disposition_id=(SELECT disposition_id FROM dispositions WHERE campaign_id=1 AND code='BLACKLIST') WHERE attempt_id=${a}`,/incompatible/);
    assert.equal((await one(`SELECT state FROM call_attempts WHERE attempt_id=${a}`)).state,'open');
    await run(`UPDATE call_attempts SET state='closed',call_end=call_start+interval '60 seconds',channel_id=${ids.buz} WHERE attempt_id=${a}`);
  });
  await check('Identidad histórica y coherencia de asignación',async()=>{
    await reject(`UPDATE call_attempts SET dialed_number='9999' WHERE attempt_id=${a}`,/histórico/);
    await run("UPDATE phone_numbers SET number='8888' WHERE phone_id=1");
    assert.equal((await one(`SELECT teléfono_marcado FROM vw_historico_detalle WHERE attempt_id=${a}`)).teléfono_marcado,'001234');
    await reject(`INSERT INTO call_attempts(idempotency_key,assignment_id,campaign_id,client_id,agent_id,dialed_number,call_start) VALUES('${uuid(3)}',1,1,2,1,'123','2026-08-01 08:00-07')`,/foreign key/);
    await reject('DELETE FROM clients WHERE client_id=1',/foreign key/);
  });
  await check('TPA incluye ceros inválidos, excluye NO CONTESTA y abiertos',async()=>{
    await run(`INSERT INTO call_attempts(idempotency_key,assignment_id,campaign_id,client_id,agent_id,dialed_number,origin,state,call_start,call_end,duration_issue,channel_id) VALUES
      ('${uuid(4)}',1,1,1,1,'001234','import','closed','2026-08-02 08:00-07',NULL,'Hora fin faltante',${ids.buz}),
      ('${uuid(5)}',1,1,1,1,'001234','import','closed','2026-08-03 08:00-07','2026-08-03 07:59-07','Duración negativa original',${ids.buz}),
      ('${uuid(6)}',1,1,1,1,'001234','import','closed','2026-08-04 08:00-07','2026-08-04 08:02-07',NULL,${ids.no});`);
    const r=await one("SELECT llamadas,EXTRACT(EPOCH FROM tpa_promedio)::float AS seconds FROM vw_concentrado_mensual WHERE campaign_id=1");
    assert.equal(r.llamadas,3); assert.equal(r.seconds,20);
    const open=await start(uuid(7));
    assert.equal((await one("SELECT EXTRACT(EPOCH FROM tpa_promedio)::float AS seconds FROM vw_concentrado_mensual WHERE campaign_id=1")).seconds,20);
    await run(`UPDATE call_attempts SET state='closed',call_end=call_start+interval '1 second',channel_id=${ids.no} WHERE attempt_id=${open}`);
  });
  await check('Mes local y porcentaje cero cuando nadie fue atendido',async()=>{
    await run(`INSERT INTO call_attempts(idempotency_key,assignment_id,campaign_id,client_id,agent_id,dialed_number,origin,state,call_start,call_end,channel_id) VALUES
     ('${uuid(8)}',1,1,1,1,'123','import','closed','2026-09-01 06:30Z','2026-09-01 06:31Z',${ids.no}),
     ('${uuid(9)}',1,1,1,1,'123','import','closed','2026-09-01 07:30Z','2026-09-01 07:31Z',${ids.no});`);
    const r=await one("SELECT porcentaje_contestacion::float p,total_marcaciones FROM vw_concentrado_mensual WHERE mes='2026-09-01' AND campaign_id=1");
    assert.equal(r.p,0); assert.equal(r.total_marcaciones,1);
  });
  await check('Blacklist automático, exclusión y conservación histórica',async()=>{
    const id=await start(uuid(10));
    await run(`UPDATE call_attempts SET state='closed',call_end=call_start+interval '1 second',channel_id=${ids.black} WHERE attempt_id=${id}`);
    assert.equal((await one('SELECT count(*)::int n FROM vw_contactos_disponibles WHERE client_id=1 AND campaign_id=1')).n,0);
    assert.equal((await one('SELECT count(*)::int n FROM clients WHERE client_id=1')).n,1);
    await reject(`INSERT INTO call_attempts(idempotency_key,assignment_id,campaign_id,client_id,agent_id,dialed_number,call_start) VALUES('${uuid(11)}',1,1,1,1,'123','2026-08-01 08:00-07')`,/Blacklist/);
  });
  let surveyAttempt, sid, versionId;
  await check('Encuesta completa se guarda atómicamente con el cierre',async()=>{
    surveyAttempt=await start(uuid(12),3,3,1,2,'2026-09-09 08:00-07');
    versionId=(await one('SELECT version_id FROM questionnaire_versions')).version_id;
    await run(`BEGIN; INSERT INTO call_surveys(attempt_id,campaign_id,version_id,started_at) VALUES(${surveyAttempt},2,${versionId},'2026-09-09 08:00-07'); COMMIT;`);
    sid=(await one(`SELECT survey_id FROM call_surveys WHERE attempt_id=${surveyAttempt}`)).survey_id;
    await reject(`UPDATE call_surveys SET state='completed',completed_at='2026-09-09 08:02-07' WHERE survey_id=${sid}`,/obligatorias/);
    await reject(`UPDATE call_attempts SET state='closed',call_end='2026-09-09 08:02-07',channel_id=${ids.survey} WHERE attempt_id=${surveyAttempt}`,/encuesta/);
    await run(`BEGIN;
      INSERT INTO survey_answers(survey_id,version_id,question_id,option_id)
      SELECT ${sid},q.version_id,q.question_id,o.option_id FROM questionnaire_questions q
      JOIN questionnaire_options o USING(question_id) WHERE q.version_id=${versionId} AND o.display_order=1;
      UPDATE call_surveys SET state='completed',completed_at='2026-09-09 08:03-07' WHERE survey_id=${sid};
      UPDATE call_attempts SET state='closed',call_end='2026-09-09 08:03-07',channel_id=${ids.survey} WHERE attempt_id=${surveyAttempt}; COMMIT;`);
    assert.equal((await one(`SELECT EXTRACT(EPOCH FROM duration_sec)::float s FROM call_attempts WHERE attempt_id=${surveyAttempt}`)).s,180);
    assert.equal((await one(`SELECT count(*)::int n FROM vw_historico_detalle WHERE attempt_id=${surveyAttempt}`)).n,1);
    assert.equal((await one(`SELECT count(*)::int n FROM vw_respuestas_encuesta WHERE attempt_id=${surveyAttempt}`)).n,5);
  });
  await check('Opciones de otras preguntas y razones obligatorias rechazadas',async()=>{
    const q3=await one("SELECT question_id FROM questionnaire_questions WHERE code='Q3'");
    const o=await one(`SELECT option_id FROM questionnaire_options WHERE question_id=${q3.question_id} AND requires_reason`);
    await reject(`UPDATE survey_answers SET option_id=${o.option_id} WHERE survey_id=${sid} AND question_id=${q3.question_id}`,/incompleta/);
    await reject(`UPDATE survey_answers SET option_id=${o.option_id} WHERE survey_id=${sid} AND question_id=(SELECT question_id FROM questionnaire_questions WHERE code='Q1')`,/foreign key/);
    await reject(`DELETE FROM survey_answers WHERE survey_id=${sid} AND question_id=${q3.question_id}`,/obligatorias/);
    await reject("UPDATE questionnaire_questions SET question_text='ALTERADO' WHERE code='Q1'",/otra versión/);
  });
  await check('Negativa a encuesta y razón social que envía a Blacklist',async()=>{
    const id=await start(uuid(13),3,3,1,2,'2026-09-09 09:00-07');
    await run(`BEGIN; INSERT INTO call_surveys(attempt_id,campaign_id,version_id,state,started_at,completed_at)
     VALUES(${id},2,${versionId},'declined','2026-09-09 09:00-07','2026-09-09 09:02-07');
     UPDATE call_attempts SET state='closed',call_end='2026-09-09 09:02-07',channel_id=${ids.reason} WHERE attempt_id=${id}; COMMIT;`);
    assert.equal((await one('SELECT count(*)::int n FROM contact_blacklist WHERE client_id=3 AND campaign_id=2')).n,1);
  });
  await check('Importación repetida y trazabilidad',async()=>{
    await run("INSERT INTO import_log(file_name,file_sha256,user_id,campaign_id,result) VALUES('ficticio.xlsx',repeat('a',64),3,1,'success')");
    await reject("INSERT INTO import_log(file_name,file_sha256,user_id,campaign_id,result) VALUES('renombrado.xlsx',repeat('a',64),3,1,'success')",/duplicate key/);
    await run(`INSERT INTO import_detail(import_id,sheet_name,row_number,source_data,attempt_id,result) VALUES(1,'LLAMADAS',2,'{}',${a},'imported')`);
    await reject('DELETE FROM import_log WHERE import_id=1',/foreign key/);
  });
  await check('Triggers de actualización: todas las tablas referidas tienen columna',async()=>{
    const r=await one(`SELECT count(*)::int n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
     WHERE t.tgname='stamp_updated_at' AND NOT EXISTS(SELECT 1 FROM information_schema.columns x WHERE x.table_name=c.relname AND x.column_name='updated_at')`);
    assert.equal(r.n,0);
    await run("UPDATE campaigns SET description='Prueba'; UPDATE survey_answers SET answer_text=answer_text WHERE survey_id="+sid);
  });
  const report={engine:version,tests:results.length,passed:results,limitations:['Motor PostgreSQL embebido PGlite; no prueba de concurrencia entre conexiones ni de instalación del servidor Windows.','No se importaron datos reales.','Catálogos pendientes permanecen inactivos.']};
  await fs.writeFile(new URL('./test_results.json',import.meta.url),JSON.stringify(report,null,2));
  console.log('TOTAL: '+results.length+' grupos de pruebas aprobados.');
} catch(e) {
  console.error('FAIL:',e.message, e.detail??'', e.where??'', 'position:',e.position??'');
  process.exitCode=1;
} finally {await db.close();}
