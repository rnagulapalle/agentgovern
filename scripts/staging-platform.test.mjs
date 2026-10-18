import {describe,it,expect} from "vitest";
import {generateKeyPairSync} from "node:crypto";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {publicJwks,authorizationServer} from "./staging-authorization.mjs";
const key=generateKeyPairSync("rsa",{modulusLength:2048});
const publicKey={...key.publicKey.export({format:"jwk"}),kid:"stage-1",use:"sig",alg:"RS256"};
describe("isolated staging platform",()=>{
 it("renders all eight bounded services without public data/service ports or production networks",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"ll-stage-config-"));
  try{
   for(const f of ["web.env","worker.env","application-db.env","temporal-db.env"])await writeFile(join(dir,f),"");
   const env={...process.env,LOOPLABS_STAGING_PRIVATE_DIR:dir,LOOPLABS_STAGING_WEB_IMAGE:"looplabs-web:config-test",LOOPLABS_STAGING_WORKER_IMAGE:"looplabs-worker:config-test",LOOPLABS_STAGING_TWIN_IMAGE:"looplabs-twin:config-test",LOOPLABS_STAGING_WEB_PORT:"13007",LOOPLABS_STAGING_POSTGRES_IMAGE:"postgres@sha256:"+"1".repeat(64),LOOPLABS_STAGING_TEMPORAL_IMAGE:"temporalio/server@sha256:"+"2".repeat(64)};
   const c=JSON.parse(execFileSync("docker",["compose","-p","ll-isolated-config-test","-f","docker-compose.temporal-platform.yml","config","--format","json"],{env,encoding:"utf8",timeout:15000,stdio:["ignore","pipe","pipe"]}));
   expect(Object.keys(c.services)).toHaveLength(8);
   for(const [name,s] of Object.entries(c.services)){
    expect(Number(s.mem_limit)).toBeGreaterThan(0);expect(Number(s.cpus)).toBeGreaterThan(0);expect(s.pids_limit).toBe(256);
    expect(s.cap_drop).toEqual(["ALL"]);expect(s.security_opt).toContain("no-new-privileges:true");
    expect(s.network_mode).toBeUndefined();expect(s.privileged).not.toBe(true);
    if(name!=="web")expect(s.ports).toBeUndefined();
    if(!name.endsWith("-db"))expect(s.read_only).toBe(true);
    for(const mount of s.volumes||[])expect(mount.source).not.toContain("docker.sock");
   }
   for(const role of ["application-db","temporal-db"]){expect(c.services[role].image).toBe(env.LOOPLABS_STAGING_POSTGRES_IMAGE);expect(c.services[role].platform).toBe("linux/amd64");}
   expect(c.services.temporal.image).toBe(env.LOOPLABS_STAGING_TEMPORAL_IMAGE);expect(c.services.temporal.platform).toBe("linux/amd64");
   for(const key of ["LOOPLABS_STAGING_POSTGRES_IMAGE","LOOPLABS_STAGING_TEMPORAL_IMAGE"]){const missing={...env};delete missing[key];expect(()=>execFileSync("docker",["compose","-f","docker-compose.temporal-platform.yml","config"],{env:missing,timeout:15000,stdio:"pipe"})).toThrow(new RegExp(key));}
   expect(c.services.web.ports[0].host_ip).toBe("127.0.0.1");
   expect(c.services.web.env_file).toBeUndefined(); // Compose resolved inputs, not a production env-file shortcut.
   expect(c.networks.application.internal).toBe(true);expect(c.networks.orchestration.internal).toBe(true);
   for(const net of Object.values(c.networks))expect(net.external).not.toBe(true);
   for(const volume of Object.values(c.volumes))expect(volume.external).not.toBe(true);
   expect(Object.keys(c.services.authorization.networks)).toEqual(["orchestration"]);
   expect(Object.keys(c.services["connector-twin"].networks)).toEqual(["application"]);
   expect(c.services["connector-twin"].environment.LOOPLABS_TWIN_CONTAINER).toBe("1");
   expect(Object.keys(c.services["application-db"].networks)).toEqual(["application"]);
   expect(c.services.temporal.environment.TEMPORAL_SERVICES).toBe("frontend,matching,history,worker,internal-frontend");
   expect(Object.keys(c.services["temporal-db"].networks)).toEqual(["orchestration"]);
   expect(c.services["temporal-worker"].volumes.every(v=>!v.source.includes("server-tls"))).toBe(true);
   const missing={...env};delete missing.LOOPLABS_STAGING_PRIVATE_DIR;
   expect(()=>execFileSync("docker",["compose","-f","docker-compose.temporal-platform.yml","config"],{env:missing,timeout:15000,stdio:"pipe"})).toThrow(/LOOPLABS_STAGING_PRIVATE_DIR/);
  }finally{await rm(dir,{recursive:true,force:true});}
 // CI's Docker/Compose startup exceeded Vitest's default 5s (observed 9.8s).
 // Bound each external render at 15s and retain both renders/all assertions.
 },35000);
 it("accepts only strong public RSA verification keys, never private signing material",()=>{
  expect(JSON.parse(publicJwks(JSON.stringify({keys:[publicKey]}))).keys).toHaveLength(1);
  const weak=generateKeyPairSync("rsa",{modulusLength:1024}).publicKey.export({format:"jwk"});
  for(const value of [null,{}, {keys:[]},{keys:[publicKey,publicKey]}, {keys:Array(5).fill(publicKey)}, {keys:[null]}, {keys:[{...publicKey,kid:"bad kid"}]},{keys:[{...publicKey,alg:"none"}]},{keys:[{...publicKey,d:"private"}]},{keys:[{...publicKey,kty:"oct"}]},{keys:[{...publicKey,n:"invalid"}]},{keys:[{...publicKey,...weak}]}])expect(()=>publicJwks(JSON.stringify(value))).toThrow();
 });
 it("serves actual HTTP, reloads public keys and fails closed without disclosing invalid content",async()=>{
  let value=JSON.stringify({keys:[publicKey]});
  const server=authorizationServer(async()=>value);
  await new Promise(r=>server.listen(0,"127.0.0.1",r));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
   expect((await fetch(base+"/jwks")).status).toBe(200);
   expect((await fetch(base+"/other")).status).toBe(404);
   expect((await fetch(base+"/jwks",{method:"POST"})).status).toBe(404);
   value=JSON.stringify({keys:[{...publicKey,kid:"stage-2"}]});
   expect((await (await fetch(base+"/jwks")).json()).keys[0].kid).toBe("stage-2");
   value="private-secret-invalid-json";
   const denied=await fetch(base+"/jwks");expect(denied.status).toBe(503);expect(await denied.text()).not.toContain("private-secret");
  }finally{await new Promise(r=>server.close(r));}
 });
});
