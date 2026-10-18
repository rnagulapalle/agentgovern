import {it,expect} from "vitest";
import {mkdtemp,mkdir,writeFile,readFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {parseEnv} from "node:util";
import {attachPlannerInputs} from "./staging-planner-attachment.mjs";
it("attaches an explicit temporary planner only to web without replacing worker authority or allowing inherited cloud inputs",async()=>{
 const root=await mkdtemp(join(tmpdir(),"ll-planner-attachment-"));
 try{
  const runtime=join(root,"runtime"),session=join(root,"session.json"),output=join(root,"prepared");await mkdir(runtime,{mode:0o700});
  const worker="LOOPLABS_TEMPORAL_WORKER_TOKEN=scoped-worker\n",web="LOOPLABS_DURABLE_ORIGIN=https://staging.example.test\n";
  await writeFile(join(runtime,"web.env"),web,{mode:0o600});await writeFile(join(runtime,"worker.env"),worker,{mode:0o600});
  await writeFile(session,JSON.stringify({model:"us.amazon.nova-lite-v1:0",region:"us-west-2",accessKeyId:`ASIA${"A".repeat(16)}`,secretAccessKey:"s".repeat(40),sessionToken:"t".repeat(80),expiresAt:new Date(Date.now()+7200000).toISOString()}),{mode:0o600});
  expect((await attachPlannerInputs(runtime,session,output)).workerUnchanged).toBe(true);
  const env=parseEnv(await readFile(join(output,"web.env"),"utf8"));expect(env.LOOPLABS_CHAT_MODEL).toBe("us.amazon.nova-lite-v1:0");expect(env.LOOPLABS_TEMPORAL_WORKER_TOKEN).toBeUndefined();
  expect(await readFile(join(output,"worker.env"),"utf8")).toBe(worker);expect(await readFile(join(runtime,"web.env"),"utf8")).toBe(web);
  await expect(attachPlannerInputs(runtime,session,output)).rejects.toThrow();
  for(const role of ["web","worker"]){await writeFile(join(runtime,`${role}.env`),"AWS_PROFILE=unexpected\n",{mode:0o600});await expect(attachPlannerInputs(runtime,session,join(root,`bad-${role}`))).rejects.toThrow();await writeFile(join(runtime,`${role}.env`),role==="web"?web:worker,{mode:0o600});}
 }finally{await rm(root,{recursive:true,force:true});}
});
