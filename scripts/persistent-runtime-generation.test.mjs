import {describe,it,expect,vi,beforeAll,afterAll,afterEach} from "vitest";
import {mkdtemp,mkdir,readFile,writeFile,rm,stat,chmod,symlink,link,readdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {createHash,createPublicKey,X509Certificate,createPrivateKey,sign} from "node:crypto";
import {parseEnv} from "node:util";
import {generateTemporalConfiguration} from "./staging-temporal-config.mjs";
import {prepareTemporalRenewal} from "./persistent-temporal-renewal.mjs";
import {runtimeInputs} from "./staging-runtime-inputs.mjs";
import {preparePersistentRuntimeGeneration} from "./persistent-runtime-generation.mjs";
import {membershipAuthoritySourceFiles} from "./staging-browser-record.mjs";
const fault=vi.hoisted(()=>({writeWorker:false}));
vi.mock("node:fs/promises",async importOriginal=>{
 const original=await importOriginal();return {...original,writeFile:async(path,...args)=>{
  if(fault.writeWorker&&String(path).includes("runtime-generation-")&&String(path).endsWith("/worker.env")){fault.writeWorker=false;throw Error("private partial-write failure");}
  return original.writeFile(path,...args);
 }};
});
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
let parent,runtime,installation,renewal,artifact,registry,identity,webBytes,workerBytes,renewalBytes,renewalReceipt,sequence=0;
const output=()=>resolve(parent,`runtime-generation-${sequence++}`);
const input=()=>({runtimeDirectory:runtime,installationDirectory:installation,renewalDirectory:renewal,outputDirectory:output(),identity:structuredClone(identity),artifact:structuredClone(artifact),approvedRuntimeFiles:[...registry],validateEligibility:vi.fn(async descriptor=>({eligible:true,...descriptor}))});
const unchanged=async()=>{expect(await readFile(resolve(runtime,"web.env"))).toEqual(webBytes);expect(await readFile(resolve(runtime,"worker.env"))).toEqual(workerBytes);expect(await readFile(resolve(renewal,"temporal-auth.env"))).toEqual(renewalBytes);expect(await readFile(resolve(renewal,"temporal-renewal.json"))).toEqual(renewalReceipt);};
beforeAll(async()=>{
 parent=await mkdtemp(resolve(tmpdir(),"ll-runtime-generation-"));runtime=resolve(parent,"runtime");installation=resolve(parent,"installation");renewal=resolve(parent,"renewal");await mkdir(runtime,{mode:0o700});
 const namespace="looplabs-staging-generation-test";await generateTemporalConfiguration(installation,namespace);
 const jwk=JSON.parse(await readFile(resolve(installation,"jwks.json"))).keys[0],transport={namespace,kid:jwk.kid,issuerSpkiSha256:sha(createPublicKey({key:jwk,format:"jwk"}).export({format:"der",type:"spki"})),caFingerprint:new X509Certificate(await readFile(resolve(installation,"client-tls/ca.pem"))).fingerprint256,clientFingerprint:new X509Certificate(await readFile(resolve(installation,"client-tls/client.pem"))).fingerprint256,serverFingerprint:new X509Certificate(await readFile(resolve(installation,"server-tls/server.pem"))).fingerprint256};
 await prepareTemporalRenewal(installation,renewal,transport,{ttlSeconds:600});renewalBytes=await readFile(resolve(renewal,"temporal-auth.env"));renewalReceipt=await readFile(resolve(renewal,"temporal-renewal.json"));
 // The test's registry is an explicit approved fixture, not artifact authority.
 // Eligibility callback observations are mocked; no actual release is asserted.
 registry=Object.keys(JSON.parse(await readFile("docs/evidence/staging-platform-browser-proof.json")).sourceFingerprints).sort();
 artifact={buildId:`ack-${"a".repeat(64)}`,images:{web:`sha256:${"b".repeat(64)}`,worker:`sha256:${"c".repeat(64)}`},sourceFingerprints:Object.fromEntries(await Promise.all(registry.map(async file=>[file,sha(await readFile(file))])))};
 const epoch="11111111-1111-4111-8111-111111111111",origin="https://staging.example.test";
 const temporal=parseEnv(await readFile(resolve(installation,"temporal-auth.env"),"utf8"));
 const roles=runtimeInputs({LOOPLABS_DATABASE_URL:"postgres://ll_runtime:private-runtime@application-db:5432/looplabs_staging",LOOPLABS_WORKSPACE_ID:"local-proof",LOOPLABS_RECOVERY_EPOCH:epoch},{LOOPLABS_TEMPORAL_WORKER_TOKEN:"w".repeat(40)},temporal,{origin,buildId:artifact.buildId,taskQueue:"staging-ack",connectorToken:"c".repeat(40),records:[{version:"record-scope-1",workspaceId:"local-proof",contactId:"2001",recipient:"customer@example.test"}]});
 // Opaque existing model credentials are preserved; no IAM permission claim.
 Object.assign(roles.web,{LOOPLABS_CHAT_MODEL:"us.amazon.nova-lite-v1:0",AWS_REGION:"us-west-2",AWS_ACCESS_KEY_ID:"existing-private-access",AWS_SECRET_ACCESS_KEY:"existing-private-secret",AWS_SESSION_TOKEN:"existing-private-session"});
 webBytes=Buffer.from(Object.entries(roles.web).map(([k,v])=>`${k}=${v}`).join("\n")+"\n");workerBytes=Buffer.from(Object.entries(roles.worker).map(([k,v])=>`${k}=${v}`).join("\n")+"\n");
 await writeFile(resolve(runtime,"web.env"),webBytes,{mode:0o600});await writeFile(resolve(runtime,"worker.env"),workerBytes,{mode:0o600});
 identity={transport,workspace:"local-proof",origin,recoveryEpoch:epoch,webSha256:sha(webBytes),workerSha256:sha(workerBytes)};
},30000);
afterEach(async()=>{
 vi.useRealTimers();fault.writeWorker=false;
 for(const [path,bytes] of [[resolve(runtime,"web.env"),webBytes],[resolve(runtime,"worker.env"),workerBytes],[resolve(renewal,"temporal-auth.env"),renewalBytes],[resolve(renewal,"temporal-renewal.json"),renewalReceipt]]){await rm(path,{force:true});await writeFile(path,bytes,{mode:0o600});}
 await chmod(runtime,0o700);
});
afterAll(async()=>{await rm(parent,{recursive:true,force:true});});
describe("persistent runtime generation preparation (mock eligibility callback; no release proof)",()=>{
 it("preserves all existing authority bytes except the actual verified transport JWT",async()=>{
  const request=input(),result=await preparePersistentRuntimeGeneration(request);
  expect(request.validateEligibility).toHaveBeenCalledExactlyOnceWith(artifact);
  expect(result).toMatchObject({buildId:artifact.buildId,images:artifact.images,webUnchanged:true,changedWorkerKeys:["LOOPLABS_TEMPORAL_API_KEY"],schedulerUsesWorkerInput:true,activated:false,releaseEligibilityEstablished:false});
  expect(await readFile(resolve(request.outputDirectory,"web.env"))).toEqual(webBytes);
  const prepared=await readFile(resolve(request.outputDirectory,"worker.env"),"utf8"),token=parseEnv(renewalBytes.toString()).LOOPLABS_TEMPORAL_API_KEY;
  expect(prepared).toBe(workerBytes.toString().replace(/^LOOPLABS_TEMPORAL_API_KEY=.*$/m,`LOOPLABS_TEMPORAL_API_KEY=${token}`));
  expect((await stat(request.outputDirectory)).mode&0o777).toBe(0o700);
  for(const file of await readdir(request.outputDirectory))expect((await stat(resolve(request.outputDirectory,file))).mode&0o777).toBe(0o600);
  expect(JSON.stringify(result)).not.toContain("existing-private");expect(JSON.stringify(result)).not.toContain(token);await unchanged();
 });
 it("requires a trusted asynchronous verifier and refuses supplied eligible booleans",async()=>{
  for(const change of [{validateEligibility:undefined},{validateEligibility:true},{validateEligibility:()=>({eligible:true,...artifact})},{eligible:true},{validateEligibility:async()=>({eligible:false,...artifact})},{validateEligibility:async()=>({eligible:true,...artifact,buildId:`ack-${"d".repeat(64)}`})},{validateEligibility:async()=>{throw Error("private-secret");}}])await expect(preparePersistentRuntimeGeneration({...input(),...change})).rejects.toThrow(/^Persistent runtime preparation refused/);
  await unchanged();
 });
 it("binds exact approved registry and independently observed images, build and source hashes",async()=>{
  for(const change of [{approvedRuntimeFiles:registry.slice(1)},{approvedRuntimeFiles:[...registry.slice(1),registry[1]]},{approvedRuntimeFiles:["../private",...registry.slice(1)]},{artifact:{...artifact,buildId:"legacy"}},{artifact:{...artifact,images:{...artifact.images,worker:artifact.images.web}}},{artifact:{...artifact,sourceFingerprints:{...artifact.sourceFingerprints,[registry[0]]:"0".repeat(64)}}},{validateEligibility:async()=>({eligible:true,...artifact,images:{...artifact.images,web:`sha256:${"d".repeat(64)}`}})},{validateEligibility:async()=>({eligible:true,...artifact,sourceFingerprints:{...artifact.sourceFingerprints,[registry[0]]:"0".repeat(64)}})}])await expect(preparePersistentRuntimeGeneration({...input(),...change})).rejects.toThrow();
  await unchanged();
 });
 it("refuses the historical registry without membership-history runtime sources before eligibility observation",async()=>{
  expect(registry).toHaveLength(106);
  const added=["lib/workspace/membership-authority.ts","lib/workspace/membership-authority-schema.sql","scripts/membership-authority-setup.ts","lib/quotes/schema.sql","lib/quotes/authority-schema.sql","lib/quotes/plan-v2-schema.sql","lib/quotes/membership-schema.sql"];
  for(const file of added)expect(registry).toContain(file);
  const historical=registry.filter(file=>!added.includes(file));expect(historical).toHaveLength(99);
  const request=input();request.approvedRuntimeFiles=historical;
  request.artifact.sourceFingerprints=Object.fromEntries(historical.map(file=>[file,artifact.sourceFingerprints[file]]));
  await expect(preparePersistentRuntimeGeneration(request)).rejects.toThrow(/^Persistent runtime preparation refused/);
  expect(request.validateEligibility).not.toHaveBeenCalled();await unchanged();
 });
 it("refuses equal-length substitution of each required membership source before eligibility observation",async()=>{
  for(const required of membershipAuthoritySourceFiles){
   const replacement="scripts/persistent-runtime-generation.test.mjs";expect(registry).not.toContain(replacement);
   const substituted=registry.map(file=>file===required?replacement:file),request=input();
   expect(substituted).toHaveLength(106);expect(new Set(substituted).size).toBe(106);
   request.approvedRuntimeFiles=substituted;
   request.artifact.sourceFingerprints=Object.fromEntries(await Promise.all(substituted.map(async file=>[file,sha(await readFile(file))])));
   await expect(preparePersistentRuntimeGeneration(request)).rejects.toThrow(/^Persistent runtime preparation refused/);
   expect(request.validateEligibility).not.toHaveBeenCalled();await unchanged();
  }
 });
 it("refuses changed generation bytes, recovery epoch, namespace and installation identity",async()=>{
  for(const change of [{workspace:"other"},{origin:"https://other.example.test"},{recoveryEpoch:"22222222-2222-4222-8222-222222222222"},{webSha256:"0".repeat(64)},{workerSha256:"0".repeat(64)},{transport:{...identity.transport,namespace:identity.transport.namespace+"-other"}},{transport:{...identity.transport,issuerSpkiSha256:"0".repeat(64)}}])await expect(preparePersistentRuntimeGeneration({...input(),identity:{...identity,...change}})).rejects.toThrow();
  await unchanged();
 });
 it("refuses authority additions even if caller updates its byte pin",async()=>{
  for(const [file,bytes,addition,pin] of [["worker.env",workerBytes,"AWS_SECRET_ACCESS_KEY=not-permitted\n","workerSha256"],["worker.env",workerBytes,"LOOPLABS_OPERATOR_TOKEN=not-permitted\n","workerSha256"],["worker.env",workerBytes,"LOOPLABS_RECOVERY_EPOCH=duplicate\n","workerSha256"],["web.env",webBytes,"LOOPLABS_TEMPORAL_WORKER_TOKEN=not-permitted\n","webSha256"]]) {
   const changed=Buffer.concat([bytes,Buffer.from(addition)]);await writeFile(resolve(runtime,file),changed);
   await expect(preparePersistentRuntimeGeneration({...input(),identity:{...identity,[pin]:sha(changed)}})).rejects.toThrow();await writeFile(resolve(runtime,file),bytes);
  }
  const changed=Buffer.from(webBytes.toString().replace(/^AWS_REGION=.*\n/m,""));await writeFile(resolve(runtime,"web.env"),changed);await expect(preparePersistentRuntimeGeneration({...input(),identity:{...identity,webSha256:sha(changed)}})).rejects.toThrow();
 });
 it("rejects forged, stale, over-scoped or altered renewal independently of its receipt",async()=>{
  const temporal=parseEnv(renewalBytes.toString()),parts=temporal.LOOPLABS_TEMPORAL_API_KEY.split("."),original=JSON.parse(Buffer.from(parts[1],"base64url")),signer=createPrivateKey(await readFile(resolve(installation,"offline/signing.pem")));
  for(const changes of [{permissions:["temporal-system:admin"]},{sub:"other"},{iat:original.iat-100,exp:original.exp-100},{exp:original.iat+90000},{exp:original.iat+1}]) {
   const body=Buffer.from(JSON.stringify({...original,...changes})).toString("base64url"),content=`${parts[0]}.${body}`,token=`${content}.${sign("RSA-SHA256",Buffer.from(content),signer).toString("base64url")}`;
   await writeFile(resolve(renewal,"temporal-auth.env"),renewalBytes.toString().replace(temporal.LOOPLABS_TEMPORAL_API_KEY,token));await expect(preparePersistentRuntimeGeneration(input())).rejects.toThrow();
  }
  await writeFile(resolve(renewal,"temporal-auth.env"),renewalBytes.toString().replace(temporal.LOOPLABS_TEMPORAL_API_KEY,`${parts[0]}.${parts[1]}.invalid`));await expect(preparePersistentRuntimeGeneration(input())).rejects.toThrow();
 });
 it("rejects malformed renewal receipt, altered TLS paths, no-op tokens and expired freshness",async()=>{
  const receipt=JSON.parse(renewalReceipt);
  for(const changed of [{activated:true},{rotatedIssuer:true},{expiresAt:receipt.expiresAt+1},{caFingerprint:Array(32).fill("AA").join(":")},{extra:true}]){await writeFile(resolve(renewal,"temporal-renewal.json"),JSON.stringify({...receipt,...changed}));await expect(preparePersistentRuntimeGeneration(input())).rejects.toThrow();}
  await writeFile(resolve(renewal,"temporal-renewal.json"),renewalReceipt);
  await writeFile(resolve(renewal,"temporal-auth.env"),renewalBytes.toString().replace("temporal:7233","production:7233"));await expect(preparePersistentRuntimeGeneration(input())).rejects.toThrow();
  await writeFile(resolve(renewal,"temporal-auth.env"),await readFile(resolve(installation,"temporal-auth.env")));await expect(preparePersistentRuntimeGeneration(input())).rejects.toThrow();
  await writeFile(resolve(renewal,"temporal-auth.env"),renewalBytes);vi.setSystemTime((receipt.issuedAt+61)*1000);await expect(preparePersistentRuntimeGeneration(input())).rejects.toThrow();
 });
 it("refuses duplicate output and canonical containment through a symlink ancestor",async()=>{
  const request=input();await preparePersistentRuntimeGeneration(request);const original=await readFile(resolve(request.outputDirectory,"worker.env"));
  await expect(preparePersistentRuntimeGeneration(request)).rejects.toThrow();expect(await readFile(resolve(request.outputDirectory,"worker.env"))).toEqual(original);
  const child=resolve(runtime,"private-child"),alias=resolve(parent,"runtime-alias");await mkdir(child,{mode:0o700});await symlink(runtime,alias);
  try{const nested=resolve(alias,"private-child","new-generation");await expect(preparePersistentRuntimeGeneration({...input(),outputDirectory:nested})).rejects.toThrow();await expect(stat(nested)).rejects.toMatchObject({code:"ENOENT"});await unchanged();}
  finally{await rm(alias);await rm(child,{recursive:true,force:true});}
 });
 it("cleans only the newly owned partial generation after a write failure",async()=>{
  const request=input(),sentinel=resolve(parent,"keep-sentinel");await writeFile(sentinel,"preserve",{mode:0o600});fault.writeWorker=true;
  await expect(preparePersistentRuntimeGeneration(request)).rejects.toThrow(/^Persistent runtime preparation refused/);
  await expect(stat(request.outputDirectory)).rejects.toMatchObject({code:"ENOENT"});expect(await readFile(sentinel,"utf8")).toBe("preserve");await unchanged();
 });
 it("refuses certificate lifetime shorter than a newly signed fresh JWT",async()=>{
  const temporal=parseEnv(renewalBytes.toString()),parts=temporal.LOOPLABS_TEMPORAL_API_KEY.split("."),signer=createPrivateKey(await readFile(resolve(installation,"offline/signing.pem"))),old=JSON.parse(renewalReceipt);
  const expiry=Math.floor(Date.parse(new X509Certificate(await readFile(resolve(installation,"client-tls/ca.pem"))).validTo)/1000),now=expiry-3600;
  vi.setSystemTime(now*1000);const claims={sub:identity.transport.namespace,permissions:[`${identity.transport.namespace}:read`,`${identity.transport.namespace}:write`,`${identity.transport.namespace}:worker`],iat:now,exp:now+7200};
  const body=Buffer.from(JSON.stringify(claims)).toString("base64url"),content=`${parts[0]}.${body}`,token=`${content}.${sign("RSA-SHA256",Buffer.from(content),signer).toString("base64url")}`;
  await writeFile(resolve(renewal,"temporal-auth.env"),renewalBytes.toString().replace(temporal.LOOPLABS_TEMPORAL_API_KEY,token));await writeFile(resolve(renewal,"temporal-renewal.json"),JSON.stringify({...old,issuedAt:now,expiresAt:claims.exp}));
  await expect(preparePersistentRuntimeGeneration(input())).rejects.toThrow();
 });
 it("refuses insecure, linked and multiply-linked runtime files",async()=>{
  const path=resolve(runtime,"web.env"),alias=resolve(parent,"web-copy");await chmod(path,0o644);await expect(preparePersistentRuntimeGeneration(input())).rejects.toThrow();await chmod(path,0o600);
  await link(path,alias);await expect(preparePersistentRuntimeGeneration(input())).rejects.toThrow();await rm(alias);
  await rm(path);await writeFile(alias,webBytes,{mode:0o600});await symlink(alias,path);await expect(preparePersistentRuntimeGeneration(input())).rejects.toThrow();await rm(path);await writeFile(path,webBytes,{mode:0o600});await rm(alias);await unchanged();
 });
});
