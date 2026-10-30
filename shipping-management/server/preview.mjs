import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    if(req.method!=='GET'){res.writeHead(405).end();return;}
    const relative=decodeURIComponent(url.pathname==='/'?'/page/index.html':url.pathname);
    const target=path.resolve(root,'.'+relative);
    if(!target.startsWith(root)||!['page','domain'].includes(relative.split('/')[1])){res.writeHead(404).end();return;}
    res.writeHead(200,{'content-type':types[path.extname(target)]||'text/plain','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(await readFile(target));
  }catch{res.writeHead(404).end('Not found');}
});
server.listen(Number(process.env.PORT||4190),'127.0.0.1',()=>console.log('Local demonstration only: http://127.0.0.1:'+server.address().port));
