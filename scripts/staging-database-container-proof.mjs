import {execFileSync} from "node:child_process";
import {randomBytes,createHash} from "node:crypto";
import {mkdtemp,writeFile,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import assert from "node:assert/strict";
const dir=await mkdtemp(resolve(tmpdir(),"ll-offline-bootstrap-")),prefix=`ll-bootstrap-${randomBytes(6).toString("hex")}`,pg=`${prefix}-db`,image=`${prefix}:proof`,password=randomBytes(32).toString("base64url");
const docker=(...args)=>execFileSync("docker",args,{encoding:"utf8",timeout:300000,maxBuffer:1024*1024,stdio:["ignore","pipe","pipe"]}).trim();
let stage="build",built=false,network=false;const owned=[];
try{
 docker("build","-f","Dockerfile.staging-provisioner","-t",image,".");built=true;
 await writeFile(resolve(dir,"database.env"),`POSTGRES_USER=ll_stage_owner\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=looplabs_staging\n`,{mode:0o600});
 await writeFile(resolve(dir,"controller.env"),`LOOPLABS_STAGING_OWNER_URL=postgresql://ll_stage_owner:${password}@application-db:5432/looplabs_staging\n`,{mode:0o600});
 stage="internal-database";docker("network","create","--internal",prefix);network=true;
 owned.push(pg);docker("run","-d","--name",pg,"--network",prefix,"--network-alias","application-db","--memory","512m","--cpus","0.5","--pids-limit","256","--cap-drop","ALL","--cap-add","CHOWN","--cap-add","DAC_OVERRIDE","--cap-add","FOWNER","--cap-add","SETGID","--cap-add","SETUID","--security-opt","no-new-privileges","--env-file",resolve(dir,"database.env"),"postgres:16");
 for(let i=0;;i++)try{docker("exec",pg,"pg_isready","-U","ll_stage_owner","-d","looplabs_staging");break;}catch{if(i===40)throw Error("Database not ready");await new Promise(r=>setTimeout(r,250));}
 stage="offline-provisioner";const controller=`${prefix}-controller`;owned.push(controller);
 const result=JSON.parse(docker("run","--rm","--name",controller,"--network",prefix,"--user",`${process.getuid()}:${process.getgid()}`,"--memory","512m","--cpus","0.5","--pids-limit","256","--read-only","--tmpfs","/tmp","--cap-drop","ALL","--security-opt","no-new-privileges","--env-file",resolve(dir,"controller.env"),"--mount",`type=bind,src=${dir},dst=/run/private`,image,"node","--import","tsx","scripts/staging-database-container-controller.mjs"));
 assert.equal(result.passed,true);
 const db=JSON.parse(docker("inspect",pg))[0];assert.equal(Object.keys(db.HostConfig.PortBindings||{}).length,0);
 const sources=await Promise.all(["Dockerfile.staging-provisioner","scripts/staging-database-container-proof.mjs","scripts/staging-database-container-controller.mjs","scripts/staging-database-bootstrap.mjs"].map(async file=>({file,sha256:createHash("sha256").update(await readFile(file)).digest("hex")})));
 console.log(JSON.stringify({...result,imageId:docker("image","inspect",image,"--format","{{.Id}}"),sources,notVerified:["complete eight-service bootstrap/startup","provider enrollment and approved execution","browser experience and remote acceptance"]},null,2));
}catch{console.error(`Internal database container proof failed at ${stage}; no raw command or credential printed.`);process.exitCode=1;}
finally{
 for(const name of owned.reverse())try{docker("rm","-f","-v",name);}catch{}
 if(network)try{docker("network","rm",prefix);}catch{}
 if(built)try{docker("image","rm",image);}catch{}
 await rm(dir,{recursive:true,force:true});
}
