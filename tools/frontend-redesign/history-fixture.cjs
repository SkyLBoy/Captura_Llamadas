// Isolated browser QA. No production database access.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve('frontend/dist');
for (const [port, role] of [[5194, 'admin'], [5195, 'agent']]) {
  http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const json = (body, status = 200) => { res.writeHead(status, {'content-type':'application/json', 'cache-control':'no-store'}); res.end(JSON.stringify(body)); };
    if (url.pathname === '/api/auth/me') return json({user:{id:1,username:'qa',fullName:'Agente de prueba',role}});
    if (url.pathname === '/api/calls/history') {
      const date = url.searchParams.get('date');
      if (date === '2026-09-13') return json({error:{message:'Fallo temporal de prueba. Reintenta la consulta.'}}, 503);
      const total = date === '2026-09-14' ? 0 : url.searchParams.get('agentId') || url.searchParams.get('campaignId') ? 1 : 26;
      const page = Number(url.searchParams.get('page') || 1);
      return json({date,page,pageCount:Math.max(1,Math.ceil(total/25)),summary:{total,closed:total,open:0,durationSeconds:total*60},campaigns:[{id:1,name:'SILIMEX'}],agents:role==='admin'?[{id:1,name:'Agente de prueba'}]:[],calls:Array.from({length:Math.min(25,Math.max(0,total-(page-1)*25))},(_,i)=>({id:(page-1)*25+i+1,campaign:'SILIMEX',agent:'Agente de prueba',clientKey:'QA-001',businessName:'Comercializadora de prueba del Noroeste',person:'Persona de prueba',phone:'6620000000',extension:'104',startedAt:`${date}T17:00:00.000Z`,endedAt:`${date}T17:01:00.000Z`,state:'closed',durationSeconds:60,channel:'SE_ENVIA_PROMOCION_POR_CORREO',disposition:'EXITOSO',notes:'Solicita información de productos.\nDar seguimiento al correo.'}))});
    }
    if (url.pathname.startsWith('/api/')) return json({error:{message:'Ruta de prueba no disponible'}},404);
    let file = path.resolve(root, url.pathname.slice(1));
    if (!file.startsWith(root+path.sep) && file !== root) return json({},403);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file=path.join(root,'index.html');
    res.setHeader('content-type', ({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.ico':'image/x-icon','.png':'image/png'})[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  }).listen(port,'127.0.0.1');
}
console.log('History QA only: 5194 admin; 5195 agent');
