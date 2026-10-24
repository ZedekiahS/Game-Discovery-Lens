// Opt-in loopback fault injection for Computer Use against tests.serve_e2e on 8012.
// No payloads, credentials or headers are recorded. Never use with a main database.
import http from 'node:http';
import { readFileSync, appendFileSync } from 'node:fs';
const [control, evidence] = process.argv.slice(2);
if (!control || !evidence) throw new Error('Pass control-file and network-evidence paths');
const log = event => appendFileSync(evidence, JSON.stringify({ at: new Date().toISOString(), ...event })+'\n');
http.createServer((request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  const mode = readFileSync(control, 'utf8').trim();
  if (mode === 'offline' && ['PUT','PATCH','POST','DELETE'].includes(request.method) && !path.includes('/auth/')) {
    log({ method: request.method, path, outcome: 'connection-dropped-before-forwarding' });
    request.socket.destroy(); return;
  }
  if (mode === '503' && (path.includes('/me/') || path === '/api/auth/me')) {
    response.writeHead(503, { 'Access-Control-Allow-Origin':'http://127.0.0.1:4191', 'Content-Type':'application/json' });
    response.end('{"detail":"Temporarily unavailable"}');
    log({ method: request.method, path, status:503 }); return;
  }
  const upstream = http.request({hostname:'127.0.0.1',port:8012,path:request.url,method:request.method,headers:request.headers}, result => {
    response.writeHead(result.statusCode, result.headers); result.pipe(response);
    log({ method: request.method, path, status:result.statusCode });
  });
  upstream.on('error', () => { response.destroy(); log({method:request.method,path,outcome:'upstream-unavailable'}); });
  request.pipe(upstream);
}).listen(8011, '127.0.0.1', () => console.log('Acceptance proxy on loopback 8011; upstream 8012.'));
