import { sql } from 'kysely';
import { z } from 'zod';
import { withTransaction } from '../db/withTransaction.js';
import { pool } from '../db/pool.js';
import { hashPassword } from '../utils/auth.js';

// Set these variables locally; never put the password in command arguments.
try {
  const input=z.object({BOOTSTRAP_USERNAME:z.string().min(3),BOOTSTRAP_PASSWORD:z.string().min(12),BOOTSTRAP_FULL_NAME:z.string().min(1)}).parse(process.env);
  const hash=await hashPassword(input.BOOTSTRAP_PASSWORD);
  await withTransaction(null,async trx=>{
    await sql`LOCK TABLE users IN EXCLUSIVE MODE`.execute(trx);
    if(await trx.selectFrom('users').select('user_id').where('role','=','admin').executeTakeFirst()) throw new Error('Ya existe un administrador. Usa la administración de usuarios.');
    await trx.insertInto('users').values({username:input.BOOTSTRAP_USERNAME,password_hash:hash,full_name:input.BOOTSTRAP_FULL_NAME,role:'admin'}).execute();
  });
  console.log('Administrador inicial creado. Retira BOOTSTRAP_PASSWORD del entorno.');
} catch(error) { console.error(error instanceof Error ? error.message : 'No se pudo crear administrador.');process.exitCode=1; }
finally { await pool.end(); }
