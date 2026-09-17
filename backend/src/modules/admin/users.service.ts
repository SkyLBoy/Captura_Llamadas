import { z } from 'zod';
import { sql } from 'kysely';
import { withTransaction } from '../../db/withTransaction.js';
import { AppError } from '../../utils/errors.js';

export const EditUserSchema=z.object({
  username:z.string().trim().min(3).max(50),fullName:z.string().trim().min(1).max(150),
  role:z.enum(['agent','admin']),isActive:z.boolean(),expectedUpdatedAt:z.string().min(1),
}).strict();
export const DeleteUserSchema=z.object({expectedUpdatedAt:z.string().min(1)}).strict();

export async function changeUser(actorId:number,targetId:number,input:z.infer<typeof EditUserSchema>|z.infer<typeof DeleteUserSchema>,remove=false) {
  try {return await withTransaction(actorId,async trx=>{
    // Serializes administrator changes, including concurrent demotions/removals.
    await sql`SELECT pg_advisory_xact_lock(882019,1)`.execute(trx);
    const actor=await trx.selectFrom('users').select(['role','is_active']).where('user_id','=',actorId).executeTakeFirst();
    if(!actor?.is_active||actor.role!=='admin')throw new AppError(403,'No tienes permisos para esta acción.','FORBIDDEN');
    const target=await trx.selectFrom('users').selectAll().where('user_id','=',targetId).forUpdate().executeTakeFirst();
    if(!target)throw new AppError(404,'El usuario ya no existe.','USER_NOT_FOUND');
    const token=await sql<{matches:boolean}>`SELECT updated_at=${input.expectedUpdatedAt}::timestamptz AS matches FROM users WHERE user_id=${targetId}`.execute(trx);
    if(!token.rows[0]?.matches)throw new AppError(409,'Este usuario cambió. Actualiza la lista antes de volver a editarlo.','USER_CHANGED');
    const edit=remove?{username:target.username,fullName:target.full_name,role:target.role,isActive:false}:input as z.infer<typeof EditUserSchema>;
    if(targetId===actorId&&(!edit.isActive||edit.role!=='admin'))throw new AppError(409,'No puedes eliminar tu propio acceso ni quitarte el rol de administrador.','SELF_ACCESS_CHANGE');
    if(target.role==='admin'&&target.is_active&&(!edit.isActive||edit.role!=='admin')){
      const others=await trx.selectFrom('users').select('user_id').where('role','=','admin').where('is_active','=',true).where('user_id','!=',targetId).executeTakeFirst();
      if(!others)throw new AppError(409,'Debe permanecer al menos un administrador activo.','LAST_ADMIN');
    }
    if(!edit.isActive||edit.role!==target.role){
      const open=await trx.selectFrom('call_attempts').select('attempt_id').where('agent_id','=',targetId).where('state','=','open').executeTakeFirst();
      if(open)throw new AppError(409,'El agente debe cerrar su llamada antes de cambiar su acceso o rol.','USER_OPEN_CALL');
    }
    if(edit.role!==target.role){
      const assigned=await trx.selectFrom('contact_assignments').select('assignment_id').where('agent_id','=',targetId).where('ended_at','is',null).executeTakeFirst();
      if(assigned)throw new AppError(409,'El usuario tiene contactos asignados. Finaliza o reasigna su trabajo antes de cambiar el rol.','USER_ASSIGNED');
    }
    const user=await trx.updateTable('users').set({username:edit.username,full_name:edit.fullName,role:edit.role,is_active:edit.isActive})
      .where('user_id','=',targetId).returning(['user_id','username','full_name','role','is_active',sql<string>`updated_at::text`.as('updated_at')]).executeTakeFirstOrThrow();
    return {user,mode:remove?'access_removed':'updated'};
  });}catch(error){if((error as {code?:string}).code==='23505')throw new AppError(409,'Ese nombre de usuario ya está en uso.','USERNAME_EXISTS');throw error;}
}
