// Imports original BASE sheets into a disposable database only.
import fs from 'node:fs/promises';
import { PGlite } from '../pglite/package/dist/index.js';
Object.assign(process.env,{NODE_ENV:'test',PGHOST:'localhost',PGPORT:'5432',PGDATABASE:'isolated_test',PGUSER:'test',PGPASSWORD:'test',SESSION_SECRET:'isolated-test-secret-32-characters-long'});
const engine=new PGlite();
await engine.exec(await fs.readFile('database/schema.sql','utf8'));
await engine.exec('CREATE ROLE vincco_app');
for(const file of ['001_work_rounds.sql','002_import_blacklist.sql']) await engine.exec(await fs.readFile('database/migrations/'+file,'utf8'));
const {pool}=await import('../../dist/db/pool.js');
pool.connect=async()=>({query:async(text,args)=>{const r=await engine.query(typeof text==='string'?text:text.text,args??[]);return {...r,rowCount:r.rows.length||r.affectedRows||0};},release(){}});
const {importContactsFromExcel}=await import('../../dist/modules/contacts/import.service.js');
const results=[];
try {
 const admin=(await engine.query("INSERT INTO users(username,password_hash,full_name,role) VALUES('admin','unused','Admin','admin') RETURNING user_id")).rows[0].user_id;
 const campaign=(await engine.query("SELECT campaign_id FROM campaigns WHERE name='SILIMEX'")).rows[0].campaign_id;
 for(const [name,file] of [
 ['Carlos Ordaz','C:/Users/VNCAdmin-12/Documents/SILIMEX_2026/SILIMEXCARLOS/SILIMEX_-_ORDAZ_-_2026.xlsm'],
 ['Monserrat Abechuco','C:/Users/VNCAdmin-12/Documents/SILIMEX_2026/SILIMEXMONSE/SILIMEX_ABECHUCO_2026_150926.xlsm']]) {
  const agent=(await engine.query("INSERT INTO users(username,password_hash,full_name,role) VALUES($1,'unused',$1,'agent') RETURNING user_id",[name])).rows[0].user_id;
  await engine.query("INSERT INTO work_rounds(campaign_id,agent_id,name) VALUES($1,$2,'Simulación de carga histórica')",[campaign,agent]);
  const result=await importContactsFromExcel({fileBuffer:await fs.readFile(file),fileName:file.split('/').pop(),campaignId:campaign,userId:admin,agentId:agent});
  const branches=(await engine.query('SELECT c.clave,c.sucursal FROM clients c JOIN contact_assignments a USING(client_id) WHERE a.agent_id=$1',[agent])).rows;
  const source=JSON.parse(await fs.readFile(`tools/silimex-load/${name.startsWith('Carlos')?'ordaz':'abechuco'}-data.json`,'utf8'));
  const map=new Map(source.Hoja3.slice(1).map(r=>[r.values[0],r.values[1]]));
  const mismatches=branches.filter(row=>map.get(row.clave.match(/^[A-Z]+/)?.[0])!==row.sucursal);
  results.push({agent:name,result,branchMismatches:mismatches});
  console.log(JSON.stringify(results.at(-1)));
 }
 await fs.writeFile('tools/silimex-load/dry-base-results.json',JSON.stringify(results,null,2));
} finally {await pool.end();await engine.close();}
