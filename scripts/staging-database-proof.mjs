import {execFileSync} from "node:child_process";
import {randomUUID,randomBytes} from "node:crypto";
import {mkdtemp,writeFile,readFile,rm} from "node:fs/promises";
import {resolve} from "node:path";
import {tmpdir} from "node:os";
import {parseEnv} from "node:util";
import assert from "node:assert/strict";
import pg from "pg";
import {installedRestoreProof} from "./staging-installed-restore-proof.mjs";
import {bootstrapDatabase} from "./staging-database-bootstrap.mjs";
import {migrationDigests,stagingDatabase} from "../runtime/temporal/staging-preflight.ts";
const dir=await mkdtemp(resolve(tmpdir(),"looplabs-staging-db-proof-"));
const name=`ll-stage-db-${randomBytes(6).toString("hex")}`;
const epoch=randomUUID(),password=randomBytes(32).toString("base64url");
const docker=(...args)=>execFileSync("docker",args,{encoding:"utf8",timeout:30000,stdio:["ignore","pipe","pipe"]}).trim();
let created=false,network=false,volume=false,owner,runtime;
const volumeName=name+'-data';
try {
 const envFile=resolve(dir,"postgres.env");
 await writeFile(envFile,`POSTGRES_USER=ll_stage_owner\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=looplabs_staging\n`,{mode:0o600});
 docker("network","create",name);network=true;
 assert.equal(docker("volume","create","--label","looplabs.staging-db="+name,volumeName),volumeName);volume=true;
 const observedVolume=JSON.parse(docker("volume","inspect",volumeName))[0];assert.equal(observedVolume.Name,volumeName);assert.equal(observedVolume.Labels?.["looplabs.staging-db"],name);
 docker("run","-d","--rm","--name",name,"--network",name,"--mount","type=volume,source="+volumeName+",target=/var/lib/postgresql/data","--memory","512m","--cpus","0.5","--pids-limit","128","--cap-drop","ALL","--cap-add","CHOWN","--cap-add","DAC_OVERRIDE","--cap-add","FOWNER","--cap-add","SETGID","--cap-add","SETUID","--security-opt","no-new-privileges","--env-file",envFile,"-p","127.0.0.1::5432","postgres:16");created=true;
 const volumeMounts=JSON.parse(docker("inspect",name))[0].Mounts.filter(m=>m.Type==="volume");assert.equal(volumeMounts.length,1);assert.equal(volumeMounts[0].Name,volumeName);assert.equal(volumeMounts[0].Destination,"/var/lib/postgresql/data");
 const port=docker("port",name,"5432").split(":").pop();
 const url=`postgresql://ll_stage_owner:${password}@127.0.0.1:${port}/looplabs_staging`;
 owner=new pg.Pool({connectionString:url,connectionTimeoutMillis:1000});
 let ready=false;
 for(let i=0;i<100;i++){try{await owner.query("SELECT 1");ready=true;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}
 assert(ready,"Disposable database did not become ready");
 const installation=resolve(dir,"installation");
 const first=await bootstrapDatabase(installation,url,true,epoch);
 assert.equal(first.existingActions,0);assert.equal(first.existingRuns,0);
 const revisionDigest=(await migrationDigests()).find(m=>m.version===24);
 assert(revisionDigest,"Current staging requires the saved-plan revision migration");
 assert.deepEqual(first.migrations.find(m=>m.version===24),revisionDigest);
 const credentials=await readFile(resolve(installation,".env.local"),"utf8");
 const accounts=await readFile(resolve(installation,".local/workspace-accounts.json"),"utf8");
 const env=parseEnv(credentials);
 runtime=new pg.Pool({connectionString:env.LOOPLABS_DATABASE_URL});
 assert.deepEqual(await stagingDatabase(runtime,await migrationDigests(),"local-proof",env.LOOPLABS_TEMPORAL_WORKER_TOKEN,epoch),[]);
 assert.equal((await runtime.query("SELECT current_user")).rows[0].current_user,"ll_runtime");
 assert.deepEqual((await runtime.query("SELECT has_table_privilege(current_user,'ll_enquiry_revisions','SELECT') AS read,has_table_privilege(current_user,'ll_enquiry_revisions','INSERT') AS propose,has_table_privilege(current_user,'ll_enquiry_revisions','UPDATE') AS rewrite,has_table_privilege(current_user,'ll_enquiry_revisions','DELETE') AS erase")).rows[0],{read:true,propose:true,rewrite:false,erase:false});
 await assert.rejects(runtime.query("UPDATE ll_members SET active=false"),e=>e.code==="42501");
 assert.equal((await owner.query("SELECT count(*)::int n FROM ll_connector_scopes")).rows[0].n,0);
 assert.equal((await owner.query("SELECT count(*)::int n FROM ll_connector_scope_grants")).rows[0].n,0);
 const tokenCount=(await owner.query("SELECT count(*)::int n FROM ll_tokens")).rows[0].n;
 const second=await bootstrapDatabase(installation,url,true,epoch);
 assert.deepEqual(second.migrations,first.migrations);
 assert((await readFile(resolve(installation,".env.local"),"utf8"))===credentials,"Provisioning credentials changed on repeat");
 assert((await readFile(resolve(installation,".local/workspace-accounts.json"),"utf8"))===accounts,"Named member credentials changed on repeat");
 assert.equal((await owner.query("SELECT count(*)::int n FROM ll_tokens")).rows[0].n,tokenCount);
 await writeFile(resolve(installation,".env.local"),credentials.replace(env.LOOPLABS_DATABASE_URL,env.LOOPLABS_DATABASE_URL.replace("127.0.0.1","other-host")));
 await assert.rejects(bootstrapDatabase(installation,url,true,epoch),/Runtime connection differs/);
 assert.equal((await owner.query("SELECT count(*)::int n FROM ll_tokens")).rows[0].n,tokenCount);
 await writeFile(resolve(installation,".env.local"),credentials);
 await owner.query("UPDATE ll_migrations SET digest=$1 WHERE version=9",["0".repeat(64)]);
 await assert.rejects(bootstrapDatabase(installation,url,true,epoch),/Staging provisioning stopped/);
 assert.equal((await owner.query("SELECT count(*)::int n FROM ll_tokens")).rows[0].n,tokenCount);
 assert.equal((await owner.query("SELECT count(*)::int n FROM ll_connector_actions")).rows[0].n,0);
 await owner.query("UPDATE ll_migrations SET digest=$1 WHERE version=9",[first.migrations.find(m=>m.version===9).digest]);
 await assert.rejects(bootstrapDatabase(installation,url,true,randomUUID()),/Existing provisioning directory/);
 assert.equal((await owner.query("SELECT epoch FROM ll_workspace_recovery WHERE org_id='local-proof'")).rows[0].epoch,epoch);
 for(const sql of ["UPDATE ll_workspace_recovery SET epoch=gen_random_uuid()", "DELETE FROM ll_workspace_recovery", "TRUNCATE ll_workspace_recovery_events"])
  await assert.rejects(runtime.query(sql),e=>e.code==="42501");
 const installedRestore=await installedRestoreProof();

 console.log(JSON.stringify({scope:"actual isolated legacy bootstrap and verified-TLS installed archive recovery",passed:true,migrations:first.migrations.map(m=>m.version),archiveRestore:true,restoredAuthorityContained:true,restoreCounts:installedRestore.restoreCounts,installedRestore,checks:["existing provisioners complete","restricted runtime passes schema/workload/member prerequisites","membership rewrite refused","runtime cannot mutate recovery fence or journal","changed external epoch refuses bootstrap without rotating enrolled authority","post-restore installed startup refuses before creating replacement tokens","actual installed archive restores revoked workload row but scoped authority refuses authentication and delayed authorization","offline quarantine revokes restored authority and replay is idempotent","repeat preserves credentials, members, migration digests and token count","retargeted runtime refused before provisioning","corrupt retained migration stops provisioning","no record grants, actions or workflow execution created"],notVerified:["Temporal namespace and TLS configuration","provider bootstrap","full eight-service startup","remote fault/browser/restore/load acceptance"]},null,2));
} finally {
 await runtime?.end();await owner?.end();
 if(created)docker("rm","-f",name);
 if(volume){const current=JSON.parse(docker("volume","inspect",volumeName))[0];assert.equal(current.Name,volumeName);assert.equal(current.Labels?.["looplabs.staging-db"],name);docker("volume","rm",volumeName);assert(!docker("volume","ls","--format","{{.Name}}").split("\n").includes(volumeName));}
 if(network)docker("network","rm",name);
 await rm(dir,{recursive:true,force:true});
}
