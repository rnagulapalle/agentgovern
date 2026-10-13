import {describe,it,expect,vi,beforeEach,afterEach} from "vitest";
import {mkdtemp,writeFile,readFile,readdir,rm,symlink,chmod,link} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {randomUUID,randomBytes} from "node:crypto";
import {parseEnv} from "node:util";
const state=vi.hoisted(()=>({base:vi.fn(),execute:vi.fn(),inspect:vi.fn(),query:vi.fn(),end:vi.fn(),digests:vi.fn()}));
vi.mock("./staging-database-bootstrap.mjs",async importOriginal=>({...await importOriginal(),bootstrapDatabase:state.base}));
vi.mock("node:child_process",async importOriginal=>({...await importOriginal(),execFile:(...args)=>state.execute(...args)}));
vi.mock("pg",()=>({default:{Pool:class {query(...args){return state.query(...args);}end(){return state.end();}}}}));
vi.mock("../runtime/temporal/staging-preflight.ts",async importOriginal=>({...await importOriginal(),stagingDatabase:state.inspect}));
vi.mock("../runtime/temporal/persistent-preflight.ts",async importOriginal=>({...await importOriginal(),persistentMigrationDigests:state.digests}));
import {bootstrapPersistentDatabase,verifyReleasedPersistentSources,runPersistentBootstrapCLI} from "./persistent-database-bootstrap.mjs";
const owner="postgresql://ll_stage_owner:private-owner@application-db:5432/looplabs_staging";
const runtime="postgresql://ll_runtime:private-runtime@application-db:5432/looplabs_staging";
const epoch="11111111-1111-4111-8111-111111111111";
const environment=`LOOPLABS_MIGRATION_DATABASE_URL=${owner}\nLOOPLABS_DATABASE_URL=${runtime}\nLOOPLABS_WORKSPACE_ID=local-proof\nLOOPLABS_RECOVERY_EPOCH=${epoch}\nLOOPLABS_TEMPORAL_WORKER_TOKEN=private-workload\nAWS_SECRET_ACCESS_KEY=must-not-leak\n`;
let dir;
beforeEach(async()=>{
 vi.clearAllMocks();dir=await mkdtemp(resolve(tmpdir(),"ll-persistent-unit-"));
 state.base.mockImplementation(async target=>{await writeFile(resolve(target,".env.local"),environment,{mode:0o600});return {steps:12,existingActions:3,existingRuns:2,notVerified:["external effects"]};});
 state.inspect.mockResolvedValue([]);state.end.mockResolvedValue();
 state.digests.mockResolvedValue([{version:18,digest:"a".repeat(64)}]);
 state.query.mockImplementation(async sql=>({rows:sql.includes("worker_builds")?[{n:0}]:[{version:18,digest:"a".repeat(64)}]}));
 state.execute.mockImplementation((_node,args,options,callback)=>{
  void (async()=>{
  const child=parseEnv(await readFile(args[0].slice("--env-file=".length),"utf8"));
  expect(Object.keys(child).sort()).toEqual(["LOOPLABS_MIGRATION_DATABASE_URL","LOOPLABS_RECOVERY_EPOCH","LOOPLABS_WORKSPACE_ID"]);
  expect(child.LOOPLABS_MIGRATION_DATABASE_URL).toBe(owner);
  expect(Object.keys(options.env).sort()).toEqual(["HOME","PATH"]);
  callback(null,"private child output","");
  })().catch(callback);
 });
});
afterEach(async()=>{await rm(dir,{recursive:true,force:true});});
describe("persistent owner bootstrap composition",()=>{
 it("validates immutable released sources including missing and altered bytes",async()=>{
  await verifyReleasedPersistentSources();
  for(const file of ["worker-admission-schema.sql","reset-intent-schema.sql","cloud-inventory-schema.sql","cloud-project-schema.sql","cloud-owner-review-schema.sql"]) {
   await expect(verifyReleasedPersistentSources(async path=>path.endsWith(file)?Buffer.from("tampered"):readFile(resolve(path)))).rejects.toThrow(/source digest mismatch/);
  }
  await expect(verifyReleasedPersistentSources(async()=>{throw Error("secret");})).rejects.toThrow(/14 source unavailable/);
 });
 it("prints bounded CLI success and sanitized refusal with explicit opt-in",async()=>{
  const output={log:vi.fn(),error:vi.fn()},env={LOOPLABS_STAGING_BOOTSTRAP:"isolated",LOOPLABS_STAGING_OWNER_URL:owner,LOOPLABS_RECOVERY_EPOCH:epoch};
  for(const [args,input] of [[[dir],{}],[[],env],[[dir,"extra"],env],[[dir],{...env,LOOPLABS_STAGING_OWNER_URL:"credential-secret"}]])expect(await runPersistentBootstrapCLI(args,input,output)).toBe(1);
  expect(output.error.mock.calls.flat().join()).not.toContain("credential-secret");
  expect(await runPersistentBootstrapCLI([dir],env,output)).toBe(0);expect(output.log.mock.calls[0][0]).not.toContain("private-");
 });
 it("requires dedicated target, directory and external epoch before provisioning",async()=>{
  for(const args of [[dir,owner,false,undefined],[dir,owner.replace("application-db","production"),false,epoch],["",owner,false,epoch]])await expect(bootstrapPersistentDatabase(...args)).rejects.toThrow();
  expect(state.base).not.toHaveBeenCalled();expect(state.execute).not.toHaveBeenCalled();
 });
 it("runs only existing owner migrations 14–18 and verifies restricted prerequisites",async()=>{
  const result=await bootstrapPersistentDatabase(dir,owner,false,epoch);
  expect(state.base).toHaveBeenCalledWith(dir,owner,false,epoch);
  expect(state.execute.mock.calls.map(call=>call[1][3].split("/").pop())).toEqual(["worker-admission-setup.ts","reset-intent-setup.ts","cloud-inventory-setup.ts","cloud-project-setup.ts","cloud-owner-review-setup.ts"]);
  expect(state.digests).toHaveBeenCalledWith({quotePlans:false});
  expect(result).toMatchObject({steps:17,existingActions:3,existingRuns:2,workerEnrollment:false,quotePlans:false});
  expect(state.inspect.mock.calls[0].slice(2)).toEqual(["local-proof","private-workload",epoch]);
  expect(await readdir(dir)).toEqual([".env.local","persistent-database-bootstrap-evidence.json"]);
  expect(JSON.stringify(result)).not.toContain("private-");
 });
 it("refuses stale epoch or retargeted existing installation before base provisioning",async()=>{
  for(const contents of [environment.replace(epoch,randomUUID()),environment.replace(runtime,runtime.replace("application-db","other-host")),environment.replace("local-proof","other-workspace")]) {
   await writeFile(resolve(dir,".env.local"),contents,{mode:0o600});
   await expect(bootstrapPersistentDatabase(dir,owner,false,epoch)).rejects.toThrow();
  }
  expect(state.base).not.toHaveBeenCalled();
 });
 it("refuses linked, broadly readable and multiply linked private environment files",async()=>{
  const target=resolve(dir,"private");await writeFile(target,environment,{mode:0o600});await symlink(target,resolve(dir,".env.local"));
  await expect(bootstrapPersistentDatabase(dir,owner,false,epoch)).rejects.toThrow(/Private provisioning/);
  await rm(resolve(dir,".env.local"));await writeFile(resolve(dir,".env.local"),environment,{mode:0o600});await chmod(resolve(dir,".env.local"),0o644);
  await expect(bootstrapPersistentDatabase(dir,owner,false,epoch)).rejects.toThrow(/Private provisioning/);
  await chmod(resolve(dir,".env.local"),0o600);await link(resolve(dir,".env.local"),resolve(dir,"duplicate"));
  await expect(bootstrapPersistentDatabase(dir,owner,false,epoch)).rejects.toThrow(/Private provisioning/);
  expect(state.base).not.toHaveBeenCalled();
 });
 it("sanitizes base and child failures and retires only temporary owner input",async()=>{
  state.base.mockRejectedValueOnce(Error(owner));await expect(bootstrapPersistentDatabase(dir,owner,false,epoch)).rejects.toThrow(/^Persistent base provisioning refused/);
  state.execute.mockImplementationOnce((_node,_args,_options,callback)=>callback(Error(owner+" secret stdout")));
  await expect(bootstrapPersistentDatabase(dir,owner,false,epoch)).rejects.toThrow(/^Persistent provisioning stopped at migration 14/);
  expect(await readFile(resolve(dir,".env.local"),"utf8")).toBe(environment);
  expect((await readdir(dir)).some(name=>name.startsWith(".persistent-owner-"))).toBe(false);
 });
 it("refuses changed final ledger, preexisting enrollment, or denied restricted inspection",async()=>{
  for(const refusal of ["ledger","enrollment","prerequisites","unavailable"]) {
   state.inspect.mockResolvedValue(refusal==="prerequisites"?["migration_missing"]:[]);
   state.query.mockImplementation(async sql=>{if(refusal==="unavailable")throw Error(owner);return {rows:sql.includes("worker_builds")?[{n:refusal==="enrollment"?1:0}]:[{version:18,digest:(refusal==="ledger"?"b":"a").repeat(64)}]};});
   await expect(bootstrapPersistentDatabase(dir,owner,false,epoch)).rejects.toThrow(/^Persistent database prerequisites failed/);
  }
  expect(state.end).toHaveBeenCalledTimes(4);
 });
});
// Explicit isolated CI proof. Ordinary tests above never create fixed roles in
// the shared test cluster. This opt-in owns a fresh container and no other DB.
if(process.env.LOOPLABS_PERSISTENT_BOOTSTRAP_PROOF==="isolated") {
 it("actually installs 1–18, repeats without authority changes, and refuses stale or tampered state",async()=>{
  const {execFileSync}=await vi.importActual("node:child_process");
  const {default:pg}=await vi.importActual("pg");
  const image=process.env.LOOPLABS_PERSISTENT_PROOF_POSTGRES_IMAGE;
  expect(image).toMatch(/^postgres@sha256:[a-f0-9]{64}$/);
  const name=`ll-persistent-proof-${randomBytes(6).toString("hex")}`,password=randomBytes(32).toString("base64url"),externalEpoch=randomUUID();
  const docker=(...args)=>execFileSync("docker",args,{encoding:"utf8",timeout:30000,stdio:["ignore","pipe","pipe"]}).trim();
  const imageId=docker("image","inspect",image,"--format","{{.Id}}");expect(imageId).toMatch(/^sha256:[a-f0-9]{64}$/);
  const postgresEnv=resolve(dir,"postgres.env");await writeFile(postgresEnv,`POSTGRES_USER=ll_stage_owner\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=looplabs_staging\n`,{mode:0o600});
  let created=false,db,runtimeDb;
  try {
   docker("run","-d","--rm","--name",name,"--memory","512m","--cpus","0.5","--pids-limit","128","--security-opt","no-new-privileges","--env-file",postgresEnv,"-p","127.0.0.1::5432",image);created=true;
   const port=docker("port",name,"5432").split(":").pop(),url=`postgresql://ll_stage_owner:${password}@127.0.0.1:${port}/looplabs_staging`;
   db=new pg.Pool({connectionString:url,connectionTimeoutMillis:1000});let ready=false;
   for(let n=0;n<100;n++){try{await db.query("SELECT 1");ready=true;break;}catch{}await new Promise(r=>setTimeout(r,100));}expect(ready).toBe(true);
   const installation=resolve(dir,"installation"),entry=resolve("scripts/persistent-database-bootstrap.mjs");
   const install=(currentEpoch=externalEpoch)=>JSON.parse(execFileSync(process.execPath,["--import","tsx",entry,installation],{cwd:process.cwd(),env:{PATH:process.env.PATH,HOME:dir,LOOPLABS_STAGING_BOOTSTRAP:"isolated",LOOPLABS_STAGING_OWNER_URL:url,LOOPLABS_STAGING_LOOPBACK_PROOF:"true",LOOPLABS_RECOVERY_EPOCH:currentEpoch},encoding:"utf8",timeout:180000,stdio:["ignore","pipe","pipe"]}));
   const first=install();expect(first.migrations.map(row=>row.version)).toEqual([1,2,3,4,5,7,8,9,10,11,12,13,14,15,16,17,18]);
   expect(first.existingActions).toBe(0);expect(first.workerEnrollment).toBe(false);expect(first.quotePlans).toBe(false);
   const privatePath=resolve(installation,".env.local"),credentials=await readFile(privatePath,"utf8"),env=parseEnv(credentials);
   const members=await readFile(resolve(installation,".local/workspace-accounts.json"),"utf8");
   const before=(await db.query("SELECT hash,subject,active FROM ll_tokens ORDER BY hash")).rows;
   await db.query("INSERT INTO ll_agents(org_id,id) VALUES('local-proof','persistent-proof-agent')");
   const actionId=randomUUID();await db.query("INSERT INTO ll_connector_actions(org_id,id,agent_id,connector,payload,payload_hash,policy_version,state,reason,proposed_by) VALUES('local-proof',$1,'persistent-proof-agent','crm','{}',$2,1,'held','bootstrap preservation fixture','operator')",[actionId,"a".repeat(64)]);
   const actionBefore=(await db.query("SELECT * FROM ll_connector_actions WHERE id=$1",[actionId])).rows;
   const repeat=install();expect(repeat.existingActions).toBe(1);expect(repeat.migrations).toEqual(first.migrations);
   expect(await readFile(privatePath,"utf8")).toBe(credentials);expect(await readFile(resolve(installation,".local/workspace-accounts.json"),"utf8")).toBe(members);
   expect((await db.query("SELECT hash,subject,active FROM ll_tokens ORDER BY hash")).rows).toEqual(before);
   expect((await db.query("SELECT * FROM ll_connector_actions WHERE id=$1",[actionId])).rows).toEqual(actionBefore);
   expect(()=>install(randomUUID())).toThrow();
   for(const version of [14,15,16,17,18]) {
    await db.query("UPDATE ll_migrations SET digest=$1 WHERE version=$2",["0".repeat(64),version]);expect(()=>install()).toThrow();
    await db.query("UPDATE ll_migrations SET digest=$1 WHERE version=$2",[first.migrations.find(row=>row.version===version).digest,version]);
   }
   expect((await db.query("SELECT count(*)::int n FROM ll_temporal_worker_builds")).rows[0].n).toBe(0);
   expect((await db.query("SELECT to_regclass('ll_quote_plans') present")).rows[0].present).toBeNull();
   const runtimeOutput=await readFile(resolve(installation,"runtime-db.env"),"utf8");expect(runtimeOutput).not.toContain(password);expect(runtimeOutput).not.toContain("MIGRATION");
   runtimeDb=new pg.Pool({connectionString:env.LOOPLABS_DATABASE_URL});expect((await runtimeDb.query("SELECT current_user")).rows[0].current_user).toBe("ll_runtime");
   await expect(runtimeDb.query("UPDATE ll_members SET active=false")).rejects.toMatchObject({code:"42501"});
   expect((await db.query("SELECT * FROM ll_connector_actions WHERE id=$1",[actionId])).rows).toEqual(actionBefore);
   console.log(JSON.stringify({scope:"actual isolated persistent database bootstrap",passed:true,imageId,migrations:first.migrations.map(row=>row.version),repeatPreservesAuthorityAndAction:true,staleEpochRefused:true,tampered14To18Refused:true,quotePlans:false,workerEnrollment:false}));
  }finally{await runtimeDb?.end();await db?.end();if(created)docker("rm","-f",name);}
 },240000);
}
