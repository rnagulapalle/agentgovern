import {test,expect} from "vitest";
import {createServer} from "node:http";
import {request} from "node:https";
import {once} from "node:events";
import {mkdtemp,rm,stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {browserCertificates,browserTLSBridge} from "./staging-browser-tls.mjs";
test("actual trusted TLS, hostname refusal and fixed-target/body/header boundaries",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"ll-browser-tls-test-"));let relay,upstream;const calls=[],decisions=[];
 try{
  const tls=await browserCertificates(join(dir,"certs"));
  expect((await stat(join(dir,"certs/server.key"))).mode&0o777).toBe(0o600);
  await expect(browserCertificates(join(dir,"certs"))).rejects.toThrow();
  upstream=createServer((req,res)=>{const chunks=[];req.on("data",x=>chunks.push(x));req.on("end",()=>{calls.push({path:req.url,headers:req.headers,body:Buffer.concat(chunks).toString()});res.setHeader("Set-Cookie","session=sample; Secure; HttpOnly; SameSite=Strict");if(req.url==="/api/durable/connectors"){res.writeHead(403,{"Content-Type":"application/json"});res.end(JSON.stringify({error:"Same-origin requests are required for browser operations.",private:"must-not-export"}));}else res.end("accepted");});});
  upstream.listen(0,"127.0.0.1");await once(upstream,"listening");
  // Reserve a real port, then construct the exact allowed authority.
  relay=browserTLSBridge(tls,{port:0,upstreamPort:upstream.address().port});relay.listen(0,"127.0.0.1");await once(relay,"listening");const port=relay.address().port;
  await new Promise(r=>relay.close(r));relay=browserTLSBridge(tls,{port,upstreamPort:upstream.address().port,observeDecision:r=>decisions.push(r)});relay.listen(port,"127.0.0.1");await once(relay,"listening");
  const call=(options={},body="")=>new Promise((resolve,reject)=>{const req=request({hostname:"127.0.0.1",port,servername:"looplabs-staging.example.test",ca:tls.ca,path:"/api/workspace/session?read=1",method:"POST",headers:{Host:`looplabs-staging.example.test:${port}`,Origin:`https://looplabs-staging.example.test:${port}`},...options},res=>{const parts=[];res.on("data",p=>parts.push(p));res.on("end",()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(parts).toString()}));});req.on("error",reject);req.end(body);});
  await expect(call({ca:undefined})).rejects.toThrow();
  await expect(call({servername:"wrong.example.test"})).rejects.toThrow();expect(calls).toHaveLength(0);
  const accepted=await call({headers:{Host:`looplabs-staging.example.test:${port}`,Origin:"https://untrusted.example",Cookie:"session=sample",Forwarded:"host=evil", "X-Forwarded-Host":"evil","Proxy-Authorization":"must-not-forward"}},"exact body");
  expect(accepted.status).toBe(200);expect(accepted.headers["set-cookie"][0]).toContain("Secure; HttpOnly; SameSite=Strict");
  expect(calls[0].body).toBe("exact body");expect(calls[0].headers.origin).toBe("https://untrusted.example");expect(calls[0].headers.cookie).toBe("session=sample");
  for(const h of ["forwarded","x-forwarded-host","proxy-authorization"])expect(calls[0].headers[h]).toBeUndefined();
  expect((await call({headers:{Host:"evil.example"}})).status).toBe(400);
  expect((await call({path:"http://evil.example/"})).status).toBe(400);
  expect((await call({path:"//evil.example/"})).status).toBe(400);
  expect((await call({method:"PUT"})).status).toBe(400);
  expect((await call({},"x".repeat(65537))).status).toBe(413);expect(calls).toHaveLength(1);expect(decisions).toHaveLength(0);
  const denied=await call({path:"/api/durable/connectors",headers:{Host:`looplabs-staging.example.test:${port}`,Origin:`https://looplabs-staging.example.test:${port+1}`,Cookie:"looplabs_workspace_session=private-proof-token"}},"private request body");
  expect(denied.status).toBe(403);expect(calls).toHaveLength(2);
  expect(decisions).toEqual([{status:403,hostileOrigin:true,sessionDigest:createHash("sha256").update("private-proof-token").digest("hex"),sameOriginDenied:true}]);
  expect(JSON.stringify(decisions)).not.toContain("private");
  expect(()=>browserTLSBridge(tls,{observeDecision:"not a callback"})).toThrow();
 }finally{relay?.closeAllConnections();upstream?.closeAllConnections();await Promise.all([relay&&new Promise(r=>relay.close(r)),upstream&&new Promise(r=>upstream.close(r))]);await rm(dir,{recursive:true,force:true});}
},20000);
