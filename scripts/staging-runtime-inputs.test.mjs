import {describe,it,expect} from "vitest";
import {mkdtemp,mkdir,writeFile,readFile,stat,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {parseEnv} from "node:util";
import {runtimeInputs,assembleRuntimeInputs} from "./staging-runtime-inputs.mjs";
const epoch="11111111-1111-4111-8111-111111111111";
const database={LOOPLABS_RECOVERY_EPOCH:epoch,LOOPLABS_DATABASE_URL:"postgres://ll_runtime:isolated-password@application-db:5432/looplabs_staging",LOOPLABS_WORKSPACE_ID:"local-proof",LOOPLABS_MIGRATION_DATABASE_URL:"must-not-copy"};
const workload={LOOPLABS_TEMPORAL_WORKER_TOKEN:"w".repeat(40),LOOPLABS_OPERATOR_TOKEN:"must-not-copy"};
const temporal={LOOPLABS_TEMPORAL_ADDRESS:"temporal:7233",LOOPLABS_TEMPORAL_NAMESPACE:"looplabs-staging-input-proof",LOOPLABS_TEMPORAL_API_KEY:"scoped-token",LOOPLABS_TEMPORAL_CA_PATH:"/run/temporal-tls/ca.pem",LOOPLABS_TEMPORAL_CERT_PATH:"/run/temporal-tls/client.pem",LOOPLABS_TEMPORAL_KEY_PATH:"/run/temporal-tls/client.key",SIGNER:"must-not-copy"};
const settings={origin:"https://staging.example.test",buildId:`ack-${"a".repeat(64)}`,taskQueue:"staging-ack",connectorToken:"c".repeat(40),records:[{version:"record-scope-1",workspaceId:"local-proof",contactId:"2001",recipient:"customer@example.test"}]};
describe("staging role input assembly",()=>{
 it("separates web and workload authority and copies only reviewed runtime fields",()=>{
  const {web,worker}=runtimeInputs(database,workload,temporal,settings);
  expect(web.LOOPLABS_TEMPORAL_API_KEY).toBeUndefined();expect(web.LOOPLABS_TEMPORAL_WORKER_TOKEN).toBeUndefined();
  expect(web.LOOPLABS_RECOVERY_EPOCH).toBe(epoch);expect(worker.LOOPLABS_RECOVERY_EPOCH).toBe(epoch);
  expect(worker.LOOPLABS_TEMPORAL_WORKER_TOKEN).toBe(workload.LOOPLABS_TEMPORAL_WORKER_TOKEN);
  expect(worker.LOOPLABS_TEMPORAL_RECORD_BUILD_ID).toBe(settings.buildId);
  expect(JSON.stringify({web,worker})).not.toContain("must-not-copy");
 });
 it("refuses production/owner retargeting, insecure transports and incomplete record routes",()=>{
  for(const url of [database.LOOPLABS_DATABASE_URL.replace("ll_runtime","ll_stage_owner"),database.LOOPLABS_DATABASE_URL.replace("application-db","production-db"),database.LOOPLABS_DATABASE_URL+"?sslmode=disable"])
   expect(()=>runtimeInputs({...database,LOOPLABS_DATABASE_URL:url},workload,temporal,settings)).toThrow();
  for(const change of [{origin:"http://staging.example.test"},{origin:"https://name:password@staging.example.test"},{buildId:"legacy"},{records:[]},{connectorToken:"short"},{records:[{...settings.records[0],workspaceId:"another-company"}]},{records:[...settings.records,{...settings.records[0],workspaceId:"another-company"}]},{unknown:"secret"}])
   expect(()=>runtimeInputs(database,workload,temporal,{...settings,...change})).toThrow();
  expect(()=>runtimeInputs(database,workload,{...temporal,LOOPLABS_TEMPORAL_ADDRESS:"localhost:7233"},settings)).toThrow();
  expect(()=>runtimeInputs(database,{},temporal,settings)).toThrow();
  for(const value of [undefined,"","old"])expect(()=>runtimeInputs({...database,LOOPLABS_RECOVERY_EPOCH:value},workload,temporal,settings)).toThrow(/recovery epoch/);
 });
 it("writes private parseable files and refuses replacement on repeat",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"ll-role-inputs-"));
  try{
   for(const name of ["db","temporal"])await mkdir(join(dir,name));
   const save=(name,value)=>writeFile(join(dir,name),Object.entries(value).map(([k,v])=>`${k}=${v}`).join("\n")+"\n");
   await save("db/runtime-db.env",database);await save("db/workload.env",workload);await save("temporal/temporal-auth.env",temporal);
   await writeFile(join(dir,"settings.json"),JSON.stringify(settings));
   const args=[join(dir,"db"),join(dir,"temporal"),join(dir,"settings.json"),join(dir,"runtime")];
   expect((await assembleRuntimeInputs(...args)).prepared).toBe(true);
   for(const role of ["web","worker"]){const path=join(dir,"runtime",`${role}.env`);expect((await stat(path)).mode&0o777).toBe(0o600);expect(JSON.parse(parseEnv(await readFile(path,"utf8")).LOOPLABS_RECORD_CATALOG).records).toEqual(settings.records);}
   const before=await readFile(join(dir,"runtime/worker.env"),"utf8");
   await expect(assembleRuntimeInputs(...args)).rejects.toThrow();expect(await readFile(join(dir,"runtime/worker.env"),"utf8")).toBe(before);
  }finally{await rm(dir,{recursive:true,force:true});}
 });
});
