import {describe,it,expect} from "vitest";
import {stagingOwner,stagingRuntime,stagingRecoveryEpoch,bootstrapDatabase} from "./staging-database-bootstrap.mjs";
describe("staging bootstrap target guard",()=>{
 it("requires an explicitly supplied external epoch before any database or filesystem work",async()=>{
  const epoch="11111111-1111-4111-8111-111111111111";expect(stagingRecoveryEpoch(epoch)).toBe(epoch);
  for(const value of [undefined,"","old","11111111-1111-1111-8111-111111111111"]){expect(()=>stagingRecoveryEpoch(value)).toThrow();await expect(bootstrapDatabase("not-created","bad-target",false,value)).rejects.toThrow(/recovery epoch/);}
 });
 it("requires an explicit dedicated owner, database and private service target",()=>{
  expect(stagingOwner("postgresql://ll_stage_owner:test-password@application-db:5432/looplabs_staging")).toContain("application-db");
  expect(()=>stagingOwner("postgresql://ll_stage_owner:test-password@127.0.0.1:5432/looplabs_staging")).toThrow();
  expect(stagingOwner("postgresql://ll_stage_owner:test-password@127.0.0.1:5432/looplabs_staging",true)).toContain("127.0.0.1");
 });
 it("binds runtime credentials to the exact allocated database and a separate role",()=>{
  const owner="postgresql://ll_stage_owner:owner-password@application-db:5432/looplabs_staging";
  const runtime="postgresql://ll_runtime:runtime-password@application-db:5432/looplabs_staging";
  expect(stagingRuntime(runtime,owner).username).toBe("ll_runtime");
  expect(()=>stagingRuntime(owner,owner)).toThrow();
  expect(stagingRuntime(owner,owner,false).username).toBe("ll_stage_owner");
  for(const value of [runtime.replace("application-db","other-host"),runtime.replace(":5432",":5544"),runtime.replace("looplabs_staging","other_db"),runtime.replace("runtime-password","owner-password"),runtime+"?options=unsafe",runtime.replace("ll_runtime","postgres")])expect(()=>stagingRuntime(value,owner)).toThrow();
 });
 it("rejects production-like, implicit, runtime, credential-free and search-path override targets before connection",()=>{
  for(const url of ["bad-url","postgresql://ll_stage_owner:test-password@production.example/looplabs_staging","postgresql://ll_stage_owner:test-password@application-db/production","postgresql://ll_runtime:test-password@application-db/looplabs_staging","postgresql://ll_stage_owner@application-db/looplabs_staging","postgresql://ll_stage_owner:test-password@application-db/looplabs_staging?options=unsafe","postgresql://ll_stage_owner:test-password@application-db/looplabs_staging#other","https://ll_stage_owner:test-password@application-db/looplabs_staging"])
   expect(()=>stagingOwner(url,true)).toThrow();
 });
});
