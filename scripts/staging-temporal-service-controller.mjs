import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {parseEnv} from "node:util";
import {randomUUID,sign,createPrivateKey} from "node:crypto";
import assert from "node:assert/strict";
import {Connection} from "@temporalio/client";
import {bootstrapNamespace} from "./staging-namespace-bootstrap.mjs";
const dir="/run/installation",address="temporal:7233",namespace="looplabs-staging-service-proof";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ready=false;
for(const deadline=Date.now()+90000;Date.now()<deadline;){try{await bootstrapNamespace(dir);ready=true;break;}catch{await sleep(1000);}}
assert(ready,"Actual namespace bootstrap did not become ready");
assert.equal((await bootstrapNamespace(dir)).retentionSeconds,86400);
 const env=parseEnv(await readFile(resolve(dir,"temporal-auth.env"),"utf8"));
 const tls={serverRootCACertificate:await readFile(resolve(dir,"client-tls/ca.pem")),clientCertPair:{crt:await readFile(resolve(dir,"client-tls/client.pem")),key:await readFile(resolve(dir,"client-tls/client.key"))}};
 const rpc=async(token,fn)=>{const c=await Connection.connect({address,tls,apiKey:token,connectTimeout:"2 seconds"});try{return await fn(c.workflowService);}finally{await c.close();}};
 const key=env.LOOPLABS_TEMPORAL_API_KEY;
 await rpc(key,s=>s.describeNamespace({namespace}));
 const deny=async(token,target)=>assert.rejects(rpc(token,s=>s.describeNamespace({namespace:target})),e=>[7,16].includes(e.code??e.cause?.code));
 await deny(key,"temporal-system");await deny("invalid-jwt",namespace);
 const parts=key.split("."),signature=Buffer.from(parts[2],"base64url");signature[0]^=1;await deny(`${parts[0]}.${parts[1]}.${signature.toString("base64url")}`,namespace);
 const issuer=createPrivateKey(await readFile(resolve(dir,"offline/signing.pem")));
 const signed=(permissions,exp)=>{const body=Buffer.from(JSON.stringify({sub:namespace,permissions,exp})).toString("base64url"),content=`${parts[0]}.${body}`;return `${content}.${sign("RSA-SHA256",Buffer.from(content),issuer).toString("base64url")}`;};
 await deny(signed([`${namespace}:read`],Math.floor(Date.now()/1000)-60),namespace);
 await assert.rejects(rpc(signed([`${namespace}:read`],Math.floor(Date.now()/1000)+300),s=>s.startWorkflowExecution({namespace,workflowId:"reader-must-not-start",workflowType:{name:"pinnedAcknowledgement"},taskQueue:{name:"unpolled"},requestId:randomUUID()})),e=>e.code===7);

console.log(JSON.stringify({passed:true,namespace,checks:"real namespace creation/repeat and scoped/adversarial RPCs"}));
