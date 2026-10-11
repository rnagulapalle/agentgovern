import {constants} from "node:fs";
import {open,mkdtemp,writeFile,rm} from "node:fs/promises";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {parseEnv,promisify} from "node:util";
import {execFile} from "node:child_process";
import pg from "pg";
import {bootstrapDatabase,stagingOwner,stagingRuntime,stagingRecoveryEpoch} from "./staging-database-bootstrap.mjs";
import {stagingDatabase} from "../runtime/temporal/staging-preflight.ts";
import {persistentMigrationDigests} from "../runtime/temporal/persistent-preflight.ts";
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const exec=promisify(execFile);
// Released schemas are immutable. These pins are checked before provisioning,
// including fresh installations where no retained ledger exists yet.
const released=[
 [14,"lib/enquiries/worker-admission-schema.sql","8fa0d638e759fec11b0f529e56383a0fd4b7e8cecf13f432b096128e6e70fa73","worker-admission-setup.ts"],
 [15,"lib/enquiries/reset-intent-schema.sql","907e8dc8168d4f538a576c4a79bceab4f9ed12bc5fbd9a742565a63343828297","reset-intent-setup.ts"],
 [16,"lib/workspace/cloud-inventory-schema.sql","aceb85a2cf7bf8f4c8d29a110904233267847ce64d7f26eca9f5ce210730dd49","cloud-inventory-setup.ts"],
 [17,"lib/workspace/cloud-project-schema.sql","5538a143044622368f606262ea9f6fada5f69a110f4c4d2002f0ee95bf10f7bf","cloud-project-setup.ts"],
 [18,"lib/workspace/cloud-owner-review-schema.sql","336f33a43ba22b5b6e9bb5f93e75bd5101267328184821fb76c6df93371c05c6","cloud-owner-review-setup.ts"],
];
async function sourceBytes(file) {const handle=await open(resolve(root,file),constants.O_RDONLY|constants.O_NOFOLLOW);try{return await handle.readFile();}finally{await handle.close();}}
export async function verifyReleasedPersistentSources(readSource=sourceBytes) {
 for(const [version,file,digest] of released) {
  let actual;try{actual=createHash("sha256").update(await readSource(file)).digest("hex");}catch{throw Error(`Released migration ${version} source unavailable`);}
  if(actual!==digest)throw Error(`Released migration ${version} source digest mismatch`);
 }
}
async function privateEnvironment(file,optional=false) {
 let handle;
 try {
  handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  const stat=await handle.stat();
  if(!stat.isFile()||stat.nlink!==1||stat.uid!==process.getuid()||(stat.mode&0o777)!==0o600||stat.size>65536)throw Error("Private provisioning environment refused");
  return parseEnv(await handle.readFile("utf8"));
 }catch(error){if(optional&&error.code==="ENOENT")return undefined;throw Error("Private provisioning environment refused");}
 finally{await handle?.close();}
}
function installationMatches(env,owner,epoch,restricted) {
 if(env.LOOPLABS_MIGRATION_DATABASE_URL!==owner||env.LOOPLABS_WORKSPACE_ID!=="local-proof"||env.LOOPLABS_RECOVERY_EPOCH!==epoch)throw Error("Existing provisioning directory targets another installation");
 stagingRuntime(env.LOOPLABS_DATABASE_URL,owner,restricted);
}
export async function bootstrapPersistentDatabase(dir,url,loopbackProof=false,recoveryEpoch) {
 const epoch=stagingRecoveryEpoch(recoveryEpoch),owner=stagingOwner(url,loopbackProof);
 if(typeof dir!=="string"||!dir.trim())throw Error("Explicit private provisioning directory required");
 dir=resolve(dir);
 await verifyReleasedPersistentSources();
 const prior=await privateEnvironment(resolve(dir,".env.local"),true);
 if(prior)installationMatches(prior,owner,epoch,false);
 let base;
 try{base=await bootstrapDatabase(dir,owner,loopbackProof,epoch);}catch{throw Error("Persistent base provisioning refused or unavailable; retain private installation state");}
 const env=await privateEnvironment(resolve(dir,".env.local"));
 installationMatches(env,owner,epoch,true);
 // Never give owner credentials to runtime output, web/worker or a cloud client.
 // Only existing migration CLIs receive this temporary owner-only environment.
 const temporary=await mkdtemp(resolve(dir,".persistent-owner-"));
 try {
  const ownerFile=resolve(temporary,"owner.env");
  await writeFile(ownerFile,`LOOPLABS_MIGRATION_DATABASE_URL=${owner}\nLOOPLABS_WORKSPACE_ID=local-proof\nLOOPLABS_RECOVERY_EPOCH=${epoch}\n`,{mode:0o600,flag:"wx"});
  for(const [version,,,script] of released) {
   try{await exec(process.execPath,[`--env-file=${ownerFile}`,"--import","tsx",resolve(root,"scripts",script)],{cwd:dir,env:{PATH:process.env.PATH||"",HOME:temporary},timeout:30000,maxBuffer:1024*1024});}
   catch{throw Error(`Persistent provisioning stopped at migration ${version}; retain private installation state`);}
  }
 }finally{await rm(temporary,{recursive:true,force:true});}
 const db=new pg.Pool({connectionString:stagingRuntime(env.LOOPLABS_DATABASE_URL,owner).href,connectionTimeoutMillis:5000,query_timeout:10000});
 let expected;
 try {
  expected=await persistentMigrationDigests({quotePlans:false});
  if((await stagingDatabase(db,expected,"local-proof",env.LOOPLABS_TEMPORAL_WORKER_TOKEN,epoch)).length)throw Error("prerequisites");
  const ledger=(await db.query("SELECT version,digest FROM ll_migrations ORDER BY version")).rows;
  if(ledger.length!==expected.length||ledger.some((row,index)=>row.version!==expected[index].version||row.digest!==expected[index].digest))throw Error("ledger");
  if(Number((await db.query("SELECT count(*)::int n FROM ll_temporal_worker_builds")).rows[0].n)!==0)throw Error("enrollment");
 }catch{throw Error("Persistent database prerequisites failed; no worker enrollment or quote authority was created");}
 finally{await db.end();}
 const result={...base,scope:"isolated persistent database provisioning only",migrations:expected,steps:base.steps+released.length,workerEnrollment:false,quotePlans:false,notVerified:[...base.notVerified,"current worker build enrollment","persistent private operator deployment"]};
 await writeFile(resolve(dir,"persistent-database-bootstrap-evidence.json"),JSON.stringify(result,null,2)+"\n",{mode:0o600});
 return result;
}
export async function runPersistentBootstrapCLI(args,env,output=console) {
 try {
  const [dir,extra]=args;
  if(!dir||extra||env.LOOPLABS_STAGING_BOOTSTRAP!=="isolated")throw Error("Explicit isolated staging opt-in and private directory required");
  const result=await bootstrapPersistentDatabase(dir,env.LOOPLABS_STAGING_OWNER_URL,env.LOOPLABS_STAGING_LOOPBACK_PROOF==="true",env.LOOPLABS_RECOVERY_EPOCH);
  output.log(JSON.stringify(result,null,2));return 0;
 }catch{output.error("Persistent database provisioning refused or unavailable. Inspect the private installation; no credentials printed.");return 1;}
}
if(process.argv[1]===fileURLToPath(import.meta.url))process.exitCode=await runPersistentBootstrapCLI(process.argv.slice(2),process.env);
