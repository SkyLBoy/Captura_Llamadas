import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
const directory=path.resolve('backups/silimex-before-real-load-20260915');
await fs.mkdir(directory,{recursive:true});
const file=path.join(directory,'vincco_telemarketing.dump');
try { await fs.access(file); throw new Error('El respaldo ya existe; no se sobrescribe.'); } catch(error) { if(error.code!=='ENOENT')throw error; }
const binary='C:/Program Files/PostgreSQL/18/bin/pg_dump.exe';
const result=spawnSync(binary,['--format=custom','--no-password','--file',file],{env:process.env,encoding:'utf8',windowsHide:true});
if(result.status!==0){ console.error(result.stderr || result.error?.message);process.exit(1); }
const check=spawnSync('C:/Program Files/PostgreSQL/18/bin/pg_restore.exe',['--list',file],{encoding:'utf8',windowsHide:true});
if(check.status!==0)throw new Error('No se pudo verificar el catálogo del respaldo.');
const buffer=await fs.readFile(file);
const manifest={file:path.basename(file),database:process.env.PGDATABASE,createdAt:new Date().toISOString(),bytes:buffer.length,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),archiveCatalogEntries:check.stdout.split('\n').filter(line=>line&&!line.startsWith(';')).length};
await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest));
