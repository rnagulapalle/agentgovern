import {createServer,type IncomingMessage,type ServerResponse} from "node:http";
import {expect,it} from "vitest";
import {NativeQuoteTransport} from "./native-transport";
import {observeQuoteEffect} from "./effect";
const token="n".repeat(48),action="00000000-0000-4000-8000-000000000002";
const config={workspaceId:"company-a",quoteId:"quote-42",quoteBinding:"a".repeat(64),emailBinding:"b".repeat(64)};
const body={distributorId:"distributor-7",currency:"USD",subtotalMinor:100000,discountBps:1400,totalMinor:86000};
const request={contract:"quote-conditional-write-1",binding:config.quoteBinding,method:"PATCH",resource:"/quotes/quote-42",workspaceId:config.workspaceId,sourceVersion:"v3",idempotencyKey:action,body};
async function listener(run:(req:IncomingMessage,res:ServerResponse)=>void,fn:(origin:string)=>Promise<void>){const server=createServer(run);await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();if(!address||typeof address==="string")throw Error("Owned listener required");try{await fn("http://127.0.0.1:"+address.port);}finally{await new Promise<void>((resolve,reject)=>{server.close(e=>e?reject(e):resolve());server.closeAllConnections();});}}
const client=(origin:string,timeout=1000,credentials:()=>Promise<string>=async()=>token)=>new NativeQuoteTransport({...config,origin},credentials,timeout,{ownedTestOrigin:true});
const json=(res:ServerResponse,value:unknown,status=200)=>{res.writeHead(status,{"content-type":"application/json"});res.end(JSON.stringify(value));};
it("pins exact server connection and refuses arbitrary origin, getter, foreign request or action before transport",async()=>{
 for(const origin of ["https://evil.test","http://localhost:8019","http://127.0.0.1:70000","http://127.0.0.1:8019/extra"]){expect(()=>client(origin)).toThrow("server-owned");}
 expect(()=>new NativeQuoteTransport({...config,origin:"http://127.0.0.1:8123"},async()=>token)).toThrow();
 expect(()=>client("http://127.0.0.1:8019",0)).toThrow();
 const c=client("http://127.0.0.1:8019");
 for(const changed of [{...request,workspaceId:"company-b"},{...request,binding:config.emailBinding},{...request,resource:"/quotes/foreign"}])await expect(c.write(changed)).rejects.toMatchObject({status:403});
 await expect(c.write({...request,body:{...body,totalMinor:1}})).rejects.toMatchObject({status:409});await expect(c.lookup("../foreign")).rejects.toMatchObject({status:400});
 let reads=0;const getter={...config,origin:"http://127.0.0.1:8019"};Object.defineProperty(getter,"workspaceId",{enumerable:true,get(){reads++;return config.workspaceId;}});expect(()=>new NativeQuoteTransport(getter,async()=>token)).toThrow();expect(reads).toBe(0);
});
it("actual GET returns only exact pinned versioned money; malformed or foreign read never supplies source",async()=>{
 const current={workspaceId:config.workspaceId,quoteId:config.quoteId,sourceVersion:"v3",...body};let answer:unknown={contract:"quote-versioned-read-1",binding:config.quoteBinding,current};let calls=0;
 await listener((req,res)=>{calls++;expect(req.method).toBe("GET");expect(req.url).toBe("/quotes/quote-42");expect(req.headers.authorization).toBe("Bearer "+token);expect(req.headers["x-looplabs-workspace"]).toBe(config.workspaceId);expect(req.headers["x-looplabs-binding"]).toBe(config.quoteBinding);json(res,answer);},async origin=>{
  const c=client(origin);expect(await c.read()).toEqual(current);
  for(const next of [{...current,workspaceId:"company-b"},{...current,totalMinor:1},{...current,extra:true},{...current,sourceVersion:""}]){answer={contract:"quote-versioned-read-1",binding:config.quoteBinding,current:next};expect(await c.read()).toBeNull();}
  answer={contract:"quote-versioned-read-1",binding:config.emailBinding,current};expect(await c.read()).toBeNull();expect(calls).toBe(6);
 });
});
it("exact PATCH snapshots request and idempotency; an HTTP200 is observation only, never verification",async()=>{
 let seen:unknown,requests=0;await listener(async(req,res)=>{requests++;expect(req.method).toBe("PATCH");expect(req.headers["idempotency-key"]).toBe(action);const chunks=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));seen=JSON.parse(Buffer.concat(chunks).toString());json(res,{unexpected:"not execution evidence"});},async origin=>{
  const output=await client(origin).write(request);expect(output).toEqual({status:"observed",body:{unexpected:"not execution evidence"}});expect(seen).toEqual(request);expect(requests).toBe(1);expect(observeQuoteEffect(request,output.status==="observed"?output.body:null).outcome).toBe("unknown");
 });
});
it("lost reply never retries; separate authenticated lookup supplies raw evidence only",async()=>{
 let writes=0,lookups=0;await listener((req,res)=>{if(req.method==="PATCH"){writes++;res.destroy();}else{lookups++;expect(req.url).toBe("/quote-effects/"+action);json(res,{contract:"quote-effect-lookup-1",status:"available",effects:[],current:null});}},async origin=>{
  const c=client(origin);expect(await c.write(request)).toEqual({status:"unavailable"});expect(writes).toBe(1);const raw=await c.lookup(action);expect(lookups).toBe(1);expect(writes).toBe(1);expect(observeQuoteEffect(request,raw).outcome).toBe("unknown");
 });
});
it("maps explicit stale conflict without verification and refuses authentication/server failures",async()=>{
 let status=409;await listener((_req,res)=>json(res,{status:"unavailable"},status),async origin=>{const c=client(origin);expect(await c.write(request)).toEqual({status:"conflict"});for(status of [401,403,404,503]){expect(await c.write(request)).toEqual({status:"unavailable"});expect(await c.lookup(action)).toBeNull();expect(await c.read()).toBeNull();}});
});
it("contains redirects, nonJSON, invalidJSON and oversized streaming bodies without retry",async()=>{
 let mode="redirect",calls=0;await listener((_req,res)=>{calls++;if(mode==="redirect"){res.writeHead(302,{location:"http://127.0.0.1:1/secret"});res.end();}else if(mode==="text"){res.writeHead(200,{"content-type":"text/plain"});res.end("not evidence");}else if(mode==="invalid"){res.writeHead(200,{"content-type":"application/json"});res.end("{");}else{res.writeHead(200,{"content-type":"application/json"});res.write('"'+"x".repeat(17000));res.end('"');}},async origin=>{for(mode of ["redirect","text","invalid","oversized"])expect(await client(origin).write(request)).toEqual({status:"unavailable"});expect(calls).toBe(4);});
});
it("bounds credentials and body reads with one deadline and no leaked errors or transport attempts",async()=>{
 let calls=0;await listener((_req,res)=>{calls++;res.writeHead(200,{"content-type":"application/json"});res.write("{");},async origin=>{
  expect(await client(origin,40,async()=>"short").read()).toBeNull();expect(calls).toBe(0);
  expect(await client(origin,40,()=>new Promise(()=>{})).read()).toBeNull();expect(calls).toBe(0);
  expect(await client(origin,40).lookup(action)).toBeNull();expect(calls).toBe(1);
  expect(await client(origin,40,async()=>{throw Error("private credential error");}).write(request)).toEqual({status:"unavailable"});expect(calls).toBe(1);
 });
});

it("readonly native policy is exactly correlated and never inferred from numeric quote state",async()=>{
 const policy={version:3,delegatedBps:1000,hardCapBps:2000,active:true};let response:unknown={contract:"quote-pricing-policy-1",workspaceId:config.workspaceId,quoteId:config.quoteId,binding:config.quoteBinding,policy};let status=200,calls=0;
 await listener((req,res)=>{calls++;expect(req.method).toBe("GET");expect(req.url).toBe("/quotes/quote-42/policy");expect(req.headers.authorization).toBe("Bearer "+token);expect(req.headers['x-looplabs-workspace']).toBe(config.workspaceId);expect(req.headers['x-looplabs-binding']).toBe(config.quoteBinding);json(res,response,status);},async origin=>{
  const c=client(origin),exact=response;expect(await c.policy()).toEqual(exact);response={...(exact as object),policy:{...policy,active:false}};expect((await c.policy())?.policy.active).toBe(false);
  for(const bad of [{...(exact as object),binding:config.emailBinding},{...(exact as object),workspaceId:'foreign'},{...(exact as object),quoteId:'other'},{...(exact as object),extra:true},{...(exact as object),policy:{...policy,version:'3'}},{...(exact as object),policy:{...policy,version:0}},{...(exact as object),policy:{...policy,hardCapBps:999}},{...(exact as object),policy:{...policy,hardCapBps:10001}},{...(exact as object),policy:{...policy,extra:true}}, {contract:'quote-versioned-read-1',binding:config.quoteBinding,current:{...body}}]){response=bad;expect(await c.policy()).toBeNull();}
  response=exact;for(status of [401,403,404,503])expect(await c.policy()).toBeNull();expect(calls).toBe(16);
 });
});

it('refuses accessor, ambient secret and mixed TLS fixture options without invoking accessors',()=>{let reads=0;const accessor={};Object.defineProperty(accessor,'https',{enumerable:true,get(){reads++;return{mode:'verified-tls',trust:'standard'};}});expect(()=>new NativeQuoteTransport({...config,origin:"http://127.0.0.1:8019"},async()=>token,1500,accessor)).toThrow();expect(reads).toBe(0);for(const options of [{https:{mode:'verified-tls',trust:'standard'},assertGeneration:async()=>{},ownedTestOrigin:true},{unknownSecret:'not-forwarded'},{https:{mode:'verified-tls',trust:'standard'}}])expect(()=>new NativeQuoteTransport({...config,origin:"http://127.0.0.1:8019"},async()=>token,1500,options as never)).toThrow();});
