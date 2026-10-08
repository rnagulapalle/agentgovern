import {mkdir,readFile,writeFile,symlink} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {parseEnv} from "node:util";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import pg from "pg";
import {migrationDigests,stagingDatabase} from "../runtime/temporal/staging-preflight.ts";
const exec=promisify(execFile);
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const steps=["durable-setup.ts","durable-runtime-role.ts","refund-setup.ts","workspace-setup.ts","connector-setup.ts","enquiry-setup.ts","enquiry-managed-setup.ts","temporal-setup.ts","proposal-boundary-setup.ts","record-scope-setup.ts","record-routing-setup.ts"];

export function stagingOwner(url,loopbackProof=false) {
  const u=new URL(url);
  if(!["postgres:","postgresql:"].includes(u.protocol) || u.username!=="ll_stage_owner" || !u.password || u.pathname!=="/looplabs_staging" || u.search || u.hash || !(u.hostname==="application-db" || (loopbackProof && u.hostname==="127.0.0.1"))) throw Error("Use the dedicated staging owner/database; no production or implicit target is allowed");
  return u.href;
}
export function stagingRuntime(url,owner,restricted=true) {
 const runtime=new URL(url),target=new URL(owner);
 if(["protocol","hostname","port","pathname","search","hash"].some(k=>runtime[k]!==target[k]) || !runtime.password || !(runtime.username==="ll_runtime" || (!restricted && runtime.username===target.username)) || (restricted && runtime.password===target.password))throw Error("Runtime connection differs from its dedicated installation");
 return runtime;
}
async function preserveWorkloads(dir) {
 const env=parseEnv(await readFile(resolve(dir,".env.local"),"utf8"));
 for(const file of ["enquiry-worker.env","temporal-worker.env"]) {
  try{Object.assign(env,parseEnv(await readFile(resolve(dir,".local",file),"utf8")));}catch(error){if(error.code!=="ENOENT")throw error;}
 }
 await writeFile(resolve(dir,".env.local"),Object.entries(env).map(([k,v])=>`${k}=${v}`).join("\n")+"\n",{mode:0o600});
}
export async function bootstrapDatabase(dir,url,loopbackProof=false) {
 const owner=stagingOwner(url,loopbackProof);
 dir=resolve(dir);
 // A caller must explicitly allocate this dedicated database. Name validation is
 // an accidental-target guard, not cryptographic attestation of infrastructure.
 const db=new pg.Pool({connectionString:owner,connectionTimeoutMillis:5000,query_timeout:10000});
 try {
  const identity=(await db.query("SELECT current_user username,current_database() database")).rows[0];
  if(identity.username!=="ll_stage_owner" || identity.database!=="looplabs_staging")throw Error("Dedicated staging database identity mismatch");
  const envPath=resolve(dir,".env.local");
  let prior;
  try{prior=parseEnv(await readFile(envPath,"utf8"));}catch(error){if(error.code!=="ENOENT")throw error;}
  if(prior) {
   if(prior.LOOPLABS_MIGRATION_DATABASE_URL!==owner || prior.LOOPLABS_WORKSPACE_ID!=="local-proof")throw Error("Existing provisioning directory targets another installation");
   stagingRuntime(prior.LOOPLABS_DATABASE_URL,owner,false);
  } else {
   const occupied=(await db.query("SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relkind IN ('r','p') LIMIT 1")).rows.length;
   if(occupied || (await db.query("SELECT 1 FROM pg_roles WHERE rolname='ll_runtime'")).rows.length)throw Error("First bootstrap requires an empty dedicated cluster/database; existing authority is not adopted");
   await mkdir(dir,{mode:0o700});
   await writeFile(envPath,`LOOPLABS_MIGRATION_DATABASE_URL=${owner}\nLOOPLABS_DATABASE_URL=${owner}\nLOOPLABS_WORKSPACE_ID=local-proof\n`,{mode:0o600,flag:"wx"});
   await symlink(resolve(root,"lib"),resolve(dir,"lib"));
   await symlink(resolve(root,"node_modules"),resolve(dir,"node_modules"));
  }
  // Migration scripts retain their own immutable digests/transactions. They do
  // not receive planner/cloud credentials or another workspace's filesystem.
  for(const step of steps) {
   await preserveWorkloads(dir);
   try {
    await exec(process.execPath,["--env-file=.env.local","--import","tsx",resolve(root,"scripts",step)],{cwd:dir,env:{PATH:process.env.PATH||"",HOME:dir},timeout:30000,maxBuffer:1024*1024});
   }catch{throw Error(`Staging provisioning stopped at ${step}; keep private state for inspection, do not silently reset credentials`);}
  }
  await preserveWorkloads(dir);
  // The read-only staging preflight inspects exact migration digests. Existing
  // application provisioners do not need this ledger and grant no access to it.
  await db.query("GRANT SELECT ON ll_migrations TO ll_runtime");
  const env=parseEnv(await readFile(envPath,"utf8"));
  const runtime=stagingRuntime(env.LOOPLABS_DATABASE_URL,owner);
  const check=new pg.Pool({connectionString:runtime.href,connectionTimeoutMillis:5000,query_timeout:10000});
  try {
   if((await stagingDatabase(check,await migrationDigests(),"local-proof",env.LOOPLABS_TEMPORAL_WORKER_TOKEN)).length)throw Error("Restricted runtime prerequisites failed");
  }finally{await check.end();}
  await writeFile(resolve(dir,"runtime-db.env"),`LOOPLABS_DATABASE_URL=${runtime.href}\nLOOPLABS_WORKSPACE_ID=local-proof\n`,{mode:0o600});
  await writeFile(resolve(dir,"workload.env"),`LOOPLABS_TEMPORAL_WORKER_TOKEN=${env.LOOPLABS_TEMPORAL_WORKER_TOKEN}\n`,{mode:0o600});
  const migrations=(await db.query("SELECT version,digest FROM ll_migrations ORDER BY version")).rows;
  const actions=(await db.query("SELECT (SELECT count(*) FROM ll_connector_actions)::int actions,(SELECT count(*) FROM ll_workflow_runs)::int runs")).rows[0];
  const result={scope:"isolated staging database provisioning only",migrations,steps:steps.length,existingActions:actions.actions,existingRuns:actions.runs,notVerified:["Temporal service and namespace","provider state and enrolled record binding","TLS and image integrity","full stack/browser/fault/load/restore acceptance"]};
  await writeFile(resolve(dir,"database-bootstrap-evidence.json"),JSON.stringify(result,null,2)+"\n",{mode:0o600});
  return result;
 }finally{await db.end();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const [dir,extra]=process.argv.slice(2);
 if(!dir || extra || process.env.LOOPLABS_STAGING_BOOTSTRAP!=="isolated")throw Error("Explicit isolated staging opt-in and private output directory required");
 bootstrapDatabase(dir,process.env.LOOPLABS_STAGING_OWNER_URL,process.env.LOOPLABS_STAGING_LOOPBACK_PROOF==="true")
  .then(result=>console.log(JSON.stringify(result,null,2)))
  .catch(error=>{console.error(error.message.startsWith("Staging provisioning stopped")?error.message:"Staging database provisioning refused or unavailable. No credentials printed; inspect the private installation before retry.");process.exitCode=1;});
}
