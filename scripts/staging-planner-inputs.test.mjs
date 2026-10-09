import {describe,it,expect} from "vitest";
import {mkdtemp,writeFile,readFile,stat,rm,symlink,chmod,link} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {parseEnv} from "node:util";
import {plannerRuntimeInputs,preparePlannerInputs} from "./staging-planner-inputs.mjs";
const now=Date.now(),session={model:"us.amazon.nova-lite-v1:0",region:"us-west-2",accessKeyId:`ASIA${"A".repeat(16)}`,secretAccessKey:"s".repeat(40),sessionToken:"t".repeat(80),expiresAt:new Date(now+7200000).toISOString()};
describe("web-only temporary planner assembly",()=>{
 it("copies only the explicit reviewed session, without inheriting worker/database or cloud defaults",()=>{
  const env=plannerRuntimeInputs(session,now);
  expect(Object.keys(env).sort()).toEqual(["AWS_ACCESS_KEY_ID","AWS_REGION","AWS_SECRET_ACCESS_KEY","AWS_SESSION_TOKEN","LOOPLABS_CHAT_MODEL"].sort());
  expect(env.AWS_SESSION_TOKEN).toBe(session.sessionToken);
  expect(env.LOOPLABS_CHAT_MODEL).toBe(session.model);
 });
 it("refuses long-lived, malformed, near-expiry, overlong and alternate-model authority",()=>{
  for(const change of [{accessKeyId:`AKIA${"A".repeat(16)}`},{sessionToken:""},{sessionToken:"newline\n".repeat(20)},{sessionToken:"x".repeat(16385)},{secretAccessKey:"short"},{model:"arbitrary"},{region:"us-east-1"},{expiresAt:new Date(now+1799999).toISOString()},{expiresAt:new Date(now+10800001).toISOString()},{expiresAt:"invalid"},{extra:"secret"}])expect(()=>plannerRuntimeInputs({...session,...change},now)).toThrow();
  expect(()=>plannerRuntimeInputs(null,now)).toThrow();expect(()=>plannerRuntimeInputs(session,NaN)).toThrow();
  const missing={...session};delete missing.sessionToken;expect(()=>plannerRuntimeInputs(missing,now)).toThrow();
 });
 it("retains private file boundaries and refuses repeat, symlink, shared-mode and hard-linked inputs",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"ll-planner-inputs-"));
  try{
   const input=join(dir,"session.json"),output=join(dir,"prepared");await writeFile(input,JSON.stringify(session),{mode:0o600});
   const result=await preparePlannerInputs(input,output);expect(result.role).toBe("web");expect(result.notVerified).toContain("actual model invocation");
   const envPath=join(output,"web-planner.env"),before=await readFile(envPath,"utf8");expect(parseEnv(before)).toEqual(plannerRuntimeInputs(session));
   expect((await stat(envPath)).mode&0o777).toBe(0o600);expect((await stat(output)).mode&0o777).toBe(0o700);
   await expect(preparePlannerInputs(input,output)).rejects.toThrow();expect(await readFile(envPath,"utf8")).toBe(before);
   const alias=join(dir,"alias.json");await symlink(input,alias);await expect(preparePlannerInputs(alias,join(dir,"alias-output"))).rejects.toThrow();
   await chmod(input,0o644);await expect(preparePlannerInputs(input,join(dir,"shared-output"))).rejects.toThrow();await chmod(input,0o600);
   await link(input,join(dir,"hard.json"));await expect(preparePlannerInputs(input,join(dir,"hard-output"))).rejects.toThrow();
  }finally{await rm(dir,{recursive:true,force:true});}
 });
});
