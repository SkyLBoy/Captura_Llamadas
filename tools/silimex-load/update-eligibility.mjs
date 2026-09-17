import fs from 'node:fs/promises';
for(const f of ['calls/calls.service.ts','contacts/import.service.ts','admin/rounds.service.ts','admin/admin.routes.ts']) {
 const p='backend/src/modules/'+f;
 let s=await fs.readFile(p,'utf8');
 s=s.replaceAll("selectFrom('contact_finalizations').select('attempt_id')","selectFrom('vw_contactos_finalizados').select('client_id')")
 .replaceAll("selectFrom('contact_finalizations as f').select('f.attempt_id')","selectFrom('vw_contactos_finalizados as f').select('f.client_id')")
 .replaceAll('FROM public.contact_finalizations) f','FROM public.vw_contactos_finalizados) f');
 await fs.writeFile(p,s);
}
const p='backend/src/db/schema-types.ts';let s=await fs.readFile(p,'utf8');
if(!s.includes('vw_contactos_finalizados:'))s=s.replace('export interface Database {','export interface Database {\n  vw_contactos_finalizados: { client_id: number; campaign_id: number };');
await fs.writeFile(p,s);
