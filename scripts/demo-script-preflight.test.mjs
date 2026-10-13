import {createServer} from 'node:http';
import {expect,it} from 'vitest';
import {checkedDemoOrigin,demoScriptPreflight,demoScriptRoutes} from './demo-script-preflight.mjs';
it('refuses foreign targets, credentials and noncanonical paths',()=>{
 for(const url of ['https://example.com','https://looplabs.run/path','https://user:secret@looplabs.run','https://looplabs.run/?secret=1','http://looplabs.run','http://localhost:3007'])expect(()=>checkedDemoOrigin(url)).toThrow();
});
it('reports denied routes without upgrading surface checks into authenticated acceptance',async()=>{
 const requests=[];const server=createServer((req,res)=>{requests.push({method:req.method,cookie:req.headers.cookie,authorization:req.headers.authorization});res.statusCode=req.url==='/control-plane/agents'?403:200;res.end('public gate');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const result=await demoScriptPreflight('http://127.0.0.1:'+server.address().port);expect(result.surfaceRoutesAvailable).toBe(false);expect(result.authenticatedWorkflowAccepted).toBe(false);expect(result.observations.find(r=>r.path==='/control-plane/agents').status).toBe(403);expect(requests).toHaveLength(demoScriptRoutes.length);for(const r of requests)expect(r).toEqual({method:'GET',cookie:undefined,authorization:undefined});}
 finally{await new Promise(r=>server.close(r));}
});
it('does not adopt a redirect target as successful demo evidence',async()=>{
 const server=createServer((_req,res)=>{res.writeHead(302,{Location:'https://example.com'});res.end();});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const result=await demoScriptPreflight('http://127.0.0.1:'+server.address().port);expect(result.surfaceRoutesAvailable).toBe(false);expect(result.observations.every(r=>r.status===302)).toBe(true);}
 finally{await new Promise(r=>server.close(r));}
});
