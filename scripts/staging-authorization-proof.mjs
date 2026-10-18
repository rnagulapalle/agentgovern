import {execFileSync} from "node:child_process";
import {generateKeyPairSync,randomBytes} from "node:crypto";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {resolve} from "node:path";
import assert from "node:assert/strict";
const image=process.env.LOOPLABS_STAGING_WORKER_IMAGE;
if(!image)throw Error("Supply the actual reviewed worker image");
const dir=await mkdtemp(resolve(".local/staging-authorization-"));
const name=`ll-stage-auth-${randomBytes(6).toString("hex")}`;
const docker=(...args)=>execFileSync("docker",args,{encoding:"utf8",timeout:30000,stdio:["ignore","pipe","pipe"]}).trim();
let created=false;
try{
 const key=generateKeyPairSync("rsa",{modulusLength:2048}).publicKey.export({format:"jwk"});
 const path=resolve(dir,"jwks.json");
 const replace=k=>writeFile(path,JSON.stringify({keys:[{...key,kid:k,use:"sig",alg:"RS256"}]}),{mode:0o644});
 await replace("stage-1");
 docker("run","-d","--name",name,"--read-only","--cap-drop","ALL","--security-opt","no-new-privileges","--memory","128m","--cpus","0.1","--pids-limit","256","--user","node","--mount",`type=bind,src=${resolve("scripts/staging-authorization.mjs")},dst=/run/staging/authorization.mjs,readonly`,"--mount",`type=bind,src=${path},dst=/run/staging/jwks.json,readonly`,"-p","127.0.0.1::8080",image,"node","/run/staging/authorization.mjs");created=true;
 const port=docker("port",name,"8080").split(":").pop();
 const url=`http://127.0.0.1:${port}/jwks`;
 let ready=false;
 for(let i=0;i<60;i++){try{ready=(await fetch(url,{signal:AbortSignal.timeout(500)})).status===200;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}
 assert(ready,"Actual authorization container did not become ready");
 assert.equal((await (await fetch(url)).json()).keys[0].kid,"stage-1");
 await replace("stage-2");assert.equal((await (await fetch(url)).json()).keys[0].kid,"stage-2");
 await writeFile(path,JSON.stringify({keys:[{...key,kid:"stage-private",alg:"RS256",use:"sig",d:"private-material"}]}));
 const blocked=await fetch(url);assert.equal(blocked.status,503);assert(!(await blocked.text()).includes("private-material"));
 await replace("stage-2");assert.equal((await fetch(url)).status,200);
 const info=JSON.parse(docker("inspect","--format","{{json .HostConfig}}",name));
 assert.equal(info.Memory,128*1024**2);assert.equal(info.NanoCpus,100000000);assert.equal(info.PidsLimit,256);assert.equal(info.ReadonlyRootfs,true);assert.deepEqual(info.CapDrop,["ALL"]);assert(info.SecurityOpt.includes("no-new-privileges"));
 console.log(JSON.stringify({scope:"actual authorization container only",passed:true,imageId:docker("inspect","--format","{{.Image}}",name),checks:["public key HTTP response","key replacement without restart","private signing material refused","recovery after public key correction","128 MiB memory, 0.1 CPU, 256 PIDs, read-only root and dropped capabilities"],notVerified:["complete platform bootstrap","Temporal authorization using this endpoint","remote HTTPS UI","fault/load/restore acceptance"]},null,2));
}finally{
 if(created)docker("rm","-f",name);
 await rm(dir,{recursive:true,force:true});
}
