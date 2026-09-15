const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
http.createServer((req, res) => {
  const name = ({'/':'index.html','/simulation.css':'simulation.css','/simulation.js':'simulation.js','/vincco-logo.png':'vincco-logo.png','/vincco-icono.ico':'vincco-icono.ico'})[req.url];
  if (!name) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : name.endsWith('.png') ? 'image/png' : 'image/x-icon');
  fs.createReadStream(path.join(__dirname, name)).pipe(res);
}).listen(5188, '127.0.0.1');
