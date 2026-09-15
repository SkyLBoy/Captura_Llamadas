// Isolated UI verification only. No database, credentials or live API calls.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve('frontend/dist');
const records = { starts: [], closes: [], admin: [] };
const campaigns = [{campaign_id:1,name:'SILIMEX'},{campaign_id:2,name:'PARTNER DELL'}];
const contacts = Array.from({length:28},(_,i)=>({client_id:i+1,assignment_id:i+1,clave:`QA-${String(i+1).padStart(3,'0')}`,razon_social:i===0?'Comercializadora de Prueba del Noroeste':'Empresa de prueba '+(i+1),sucursal:'Hermosillo'}));
const detail = {client:{client_id:1,clave:'QA-001',razon_social:contacts[0].razon_social,sucursal:'Hermosillo'},contacts:[{contact_id:10,nombre:'Ana Persona de Prueba',ejecutivo:'Ejecutivo Uno'},{contact_id:11,nombre:'Luis Contacto Alternativo',ejecutivo:'Ejecutivo Dos'}],phones:[{phone_id:20,contact_id:10,type:'main',number:'6620000100',extension:'104'},{phone_id:21,contact_id:10,type:'mobile',number:'6620000101',extension:null},{phone_id:22,contact_id:11,type:'main',number:'6620000200',extension:'205'}],emails:[{email_id:30,contact_id:10,email:'ana@example.com'},{email_id:31,contact_id:11,email:'luis@example.com'}]};
const dispositions = [{disposition_id:1,campaign_id:1,code:'EXITOSO',description:'Exitoso'},{disposition_id:2,campaign_id:1,code:'BLACKLIST',description:'Blacklist'},{disposition_id:3,campaign_id:1,code:'SEGUIMIENTO',description:'Seguimiento'}];
const channels=[{channel_id:1,campaign_id:1,code:'SE_ENVIA_PROMOCION_POR_CORREO',description:'Se envía promoción por correo',disposition_id:1,is_active:true},{channel_id:2,campaign_id:1,code:'NO_LE_INTERESA_INFORMACION',description:'No le interesa información',disposition_id:2,is_active:true},{channel_id:3,campaign_id:1,code:'NUEVOS_DATOS',description:'Nuevos datos',disposition_id:3,is_active:true},{channel_id:4,campaign_id:1,code:'PENDIENTE_QA',description:'No debe aparecer: sin clasificación',disposition_id:null,is_active:true}];
const survey={version:{version_id:1,version_name:'Encuesta QA completa'},questions:[{question_id:1,question_text:'¿Qué marca comercializa o utiliza?',question_type:'single_select',required:true,options:['Silimex','Perfect Choice','Vorago','Steren','Otra marca'].map((name,i)=>({option_id:i+1,option_text:name,requires_reason:i===4}))},{question_id:2,question_text:'Describe la necesidad del cliente',question_type:'text',required:true,options:[]},{question_id:3,question_text:'Observaciones adicionales (opcional)',question_type:'text',required:false,options:[]}]};
const users=[{user_id:901,username:'qa-agent',full_name:'Agente de prueba UI',role:'agent',is_active:true},{user_id:902,username:'qa-admin',full_name:'Administrador de prueba UI',role:'admin',is_active:true}];
let attempt=null, createFailures=1,closeFailures=1;
function save(){fs.writeFileSync(path.join(__dirname,'requests.json'),JSON.stringify(records,null,2))}
for(const [port,role] of [[5191,'agent'],[5192,'admin']])http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');let raw='';for await(const chunk of req)raw+=chunk;let data={};try{data=JSON.parse(raw||'{}')}catch{}
  const json=(body,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(body))};
  if(url.pathname==='/api/auth/me')return json({user:{id:role==='agent'?901:902,username:'qa-'+role,fullName:role==='agent'?'Agente de prueba UI':'Administrador de prueba UI',role}});
  if(url.pathname==='/api/auth/login')return json({error:{message:'Credenciales de prueba rechazadas'}},401);
  if(url.pathname==='/api/auth/logout')return json({ok:true});
  if(url.pathname==='/api/campaigns')return json({campaigns});
  if(url.pathname==='/api/catalogs')return json({channels,dispositions});
  if(url.pathname==='/api/contacts/available')return json({contacts});
  if(/^\/api\/contacts\/\d+$/.test(url.pathname))return json(detail);
  if(url.pathname==='/api/surveys/active-version')return json(survey);
  if(url.pathname==='/api/calls/open')return json({attempt});
  if(url.pathname==='/api/calls'&&req.method==='POST'){
    records.starts.push(data);save();if(createFailures-->0)return json({error:{message:'Fallo temporal QA. Reintenta el mismo registro.'}},503);
    attempt={attempt_id:700,campaign_id:data.campaignId,client_id:data.clientId,assignment_id:data.assignmentId,contact_id:data.contactId,call_start:new Date().toISOString(),dialed_number:data.dialedNumber,dialed_extension:data.dialedExtension??null,state:'open'};return json(attempt,201)
  }
  if(/^\/api\/calls\/\d+\/close$/.test(url.pathname)){records.closes.push(data);save();if(closeFailures-->0)return json({error:{message:'No se pudo guardar (QA). Reintenta sin perder tus datos.'}},503);attempt=null;return json({ok:true})}
  if(url.pathname==='/api/admin/users'){if(req.method==='POST'){records.admin.push({action:'create-user',username:data.username,role:data.role});save();return json({error:{message:'Usuario de prueba duplicado'}},409)}return json({users})}
  if(url.pathname==='/api/admin/catalogo-pendiente')return json({pendientes:[{channel_id:8,campaign_id:1,campaign:'SILIMEX',code:'QUEJA',description:'Queja de prueba'}]});
  if(url.pathname.includes('/clasificar')){records.admin.push({action:'classify',...data});save();return json({ok:true})}
  if(url.pathname==='/api/admin/contactos-finalizados')return json({contacts:[],total:0});
  if(url.pathname==='/api/admin/blacklist')return json({blacklist:[]});
  if(url.pathname==='/api/admin/rondas/resumen')return json({round:{round_id:1,name:'Ronda QA',started_at:new Date().toISOString(),ended_at:null},summary:{assigned:28,blocked:1,inactive:0,finalized:2,eligible:25},hasOpenCall:false});
  if(url.pathname==='/api/admin/rondas/historial')return json({rounds:[{round_id:1,name:'Ronda QA',started_at:new Date().toISOString(),ended_at:null}]});
  if(url.pathname==='/api/admin/rondas'){records.admin.push({action:'round',...data});save();return json({round:{round_id:2,name:data.name},enabledContacts:25})}
  if(url.pathname==='/api/reports/monthly-closing')return json({error:{message:'Reporte QA no disponible; vuelve a intentarlo.'}},503);
  if(url.pathname.startsWith('/api/'))return json({error:{message:'Ruta de fixture no implementada: '+url.pathname}},404);
  const relative=url.pathname==='/'?'index.html':url.pathname.slice(1);
  let file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)&&file!==root)return json({},403);
  if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(root,'index.html');
  const ext=path.extname(file);res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.ico':'image/x-icon'})[ext]||'application/octet-stream');res.setHeader('cache-control','no-store');fs.createReadStream(file).pipe(res)
}).listen(port,'127.0.0.1');
console.log('Isolated UI fixtures: 5191 agent / 5192 admin');
