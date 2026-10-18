import {execFileSync} from "node:child_process";
import {randomBytes,createHash} from "node:crypto";
import {mkdtemp,mkdir,writeFile,readFile,rm} from "node:fs/promises";
import {resolve} from "node:path";
import {tmpdir} from "node:os";
import assert from "node:assert/strict";
const backend=process.env.FETCHSANDBOX_BACKEND_PATH||resolve(process.env.HOME,"sandbox/backend");
const dir=await mkdtemp(resolve(tmpdir(),"ll-twin-container-")),name=`ll-twin-${randomBytes(6).toString("hex")}`,image=`${name}:proof`,token=randomBytes(32).toString("base64url");
const docker=(...args)=>execFileSync("docker",args,{encoding:"utf8",timeout:300000,maxBuffer:1024*1024,stdio:["ignore","pipe","pipe"]}).trim();
const state=resolve(dir,"state");await mkdir(state,{mode:0o700});
const owned=[];let network=false,built=false,stage="build";
try{
 // Build copies reviewed source paths only; no backend .env/private stores.
 docker("build","-f","Dockerfile.connector-twin","--build-context",`fetchsandbox=${backend}`,"-t",image,".");built=true;
 await writeFile(resolve(state,"connector-twin-credentials.json"),JSON.stringify({token}),{mode:0o600});
 await writeFile(resolve(state,"connector-twin-records.json"),JSON.stringify({records:[{version:"record-scope-1",workspaceId:"local-proof",contactId:"2001",recipient:"customer@example.test"}]}),{mode:0o600});
 // Same fixture UID used by the Compose seed contract, private to this proof.
 // macOS bind mounts map host ownership; Linux requires owner correction.
 if(process.platform==="linux")docker("run","--rm","--mount",`type=bind,src=${state},dst=/state`,"--user","0","--entrypoint","chown",image,"-R","1000:1000","/state");
 stage="network-and-container";
 docker("network","create","--internal",name);network=true;
 owned.push(name);docker("run","-d","--name",name,"--network",name,"--network-alias","connector-twin","--memory","256m","--cpus","0.25","--pids-limit","256","--read-only","--tmpfs","/tmp","--cap-drop","ALL","--security-opt","no-new-privileges","--mount",`type=bind,src=${state},dst=/state`,image);
 const controller=()=>{const child=`${name}-controller-${randomBytes(3).toString("hex")}`;owned.push(child);return JSON.parse(docker("run","--rm","--name",child,"--network",name,"--memory","128m","--pids-limit","128","--read-only","--cap-drop","ALL","--security-opt","no-new-privileges","--env-file",resolve(dir,"controller.env"),"--mount",`type=bind,src=${resolve("scripts/staging-twin-controller.mjs")},dst=/proof.mjs,readonly`,"node:22-bookworm-slim","node","/proof.mjs"));};
 await writeFile(resolve(dir,"controller.env"),`TWIN_PROOF_TOKEN=${token}\n`,{mode:0o600});
 stage="cross-container-effects";const first=controller();assert.equal(first.passed,true);
 docker("kill","--signal","KILL",name);docker("start",name);
 await writeFile(resolve(dir,"controller.env"),`TWIN_PROOF_TOKEN=${token}\nTWIN_PROOF_RESTART=1\nTWIN_PROOF_ACTIONS=${first.actions.join(",")}\n`,{mode:0o600});
 stage="restart-readback";const second=controller();assert.equal(second.passed,true);
 const inspect=JSON.parse(docker("inspect",name))[0];assert.equal(inspect.HostConfig.ReadonlyRootfs,true);assert.equal(inspect.Config.User,"fixture");assert.equal(Object.keys(inspect.HostConfig.PortBindings||{}).length,0);
 const sources=await Promise.all(["Dockerfile.connector-twin","scripts/connector-twin-requirements.txt","scripts/connector-twin.py","scripts/staging-twin-controller.mjs","scripts/staging-twin-proof.mjs","docker-compose.temporal-platform.yml"].map(async file=>({file,sha256:createHash("sha256").update(await readFile(file)).digest("hex")})));
 console.log(JSON.stringify({passed:true,scope:"isolated FetchSandbox fixture container only",imageId:inspect.Image,sources,checks:[...first.checks,...second.checks,"read-only non-root fixture without published ports"],notVerified:["full eight-service platform","application approvals and Temporal execution","remote staging or live provider parity"]},null,2));
}catch{
 console.error(`Private twin container proof failed at ${stage}; no raw command, provider payload or credential printed.`);process.exitCode=1;
}finally{
 for(const child of owned.reverse())try{docker("rm","-f",child);}catch{}
 if(network)try{docker("network","rm",name);}catch{}
 if(built)try{docker("image","rm",image);}catch{}
 // Linux seeded files belong to UID1000; controlled teardown needs that owner.
 if(process.platform==="linux")try{docker("run","--rm","--user","0","--mount",`type=bind,src=${state},dst=/state`,"python:3.12-slim","sh","-c",`rm -f /state/*; chown ${process.getuid()}:${process.getgid()} /state`);}catch{}
 await rm(dir,{recursive:true,force:true});
}
