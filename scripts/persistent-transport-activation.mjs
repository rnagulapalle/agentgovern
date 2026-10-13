// Bounded activation primitive. The trusted adapter owns authenticated release,
// actual Docker/config observations and namespace probes. No standalone CLI,
// launcher, credential renewal, authority write or production-release assertion.
// resolveConfiguration must independently hash private generation files and return
// normalized resolved runtime configuration (including mounts/HostConfig). inspect
// must normalize actual owned Docker containers to that same complete shape.
// The trusted verifier binds current accepted provenance and generation hashes;
// uploaded booleans/receipts and this library cannot supply that trust boundary.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {open,lstat,realpath,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
const pollers=['temporal-worker','temporal-scheduler'];
const retained=['web','application-db','temporal-db','temporal','authorization','connector-twin'];
const roles=[...pollers,...retained];
const sha=/^[a-f0-9]{64}$/;
const image=/^sha256:[a-f0-9]{64}$/;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&isDeepStrictEqual(Object.keys(value).sort(),[...keys].sort());
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function configuration(value){
 assert(exact(value,roles),'Exact eight-service configuration required');
 for(const role of roles){const c=value[role];assert(exact(c,['image','environment','user','command','entrypoint','healthcheck','mounts','host'])&&image.test(c.image)&&c.environment&&typeof c.environment==='object'&&!Array.isArray(c.environment)&&typeof c.user==='string'&&Array.isArray(c.command)&&Array.isArray(c.entrypoint)&&c.healthcheck&&typeof c.healthcheck==='object'&&Array.isArray(c.mounts)&&c.host&&typeof c.host==='object','Complete normalized container configuration required');assert(Object.entries(c.environment).every(([k,v])=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)&&typeof v==='string'&&!v.includes('\0')));}
 return structuredClone(value);
}
function observation(value,project,config){
 assert(exact(value,roles),'Exact eight-service observation required');
 for(const role of roles){const c=value[role];assert(exact(c,['id','project','service','image','running','healthy','configuration'])&&/^[a-f0-9]{64}$/.test(c.id)&&c.project===project&&c.service===role&&c.image===config[role].image&&typeof c.running==='boolean'&&typeof c.healthy==='boolean'&&isDeepStrictEqual(c.configuration,config[role]),'Actual role identity/configuration mismatch');}
 assert(new Set(roles.map(r=>value[r].id)).size===8,'Distinct owned containers required');
 return structuredClone(value);
}
function checkpoint(value,identity){
 assert(exact(value,['workspace','namespace','recoveryEpoch','buildId','authorityDigest'])&&value.workspace===identity.workspace&&value.namespace===identity.namespace&&value.recoveryEpoch===identity.recoveryEpoch&&value.buildId===identity.buildId&&sha.test(value.authorityDigest),'Independent authority checkpoint mismatch');return structuredClone(value);
}
export async function activatePersistentTransport(input){
 let lock,lockPath,lockIdentity,before,phase='inputs',stopped=false,succeeded=false;
 try{
 assert(exact(input,['directory','project','identity','generation','validateEligibility','operations']));
 const {project,operations:ops}=input;const identity=structuredClone(input.identity),generation=structuredClone(input.generation);
 assert(typeof project==='string'&&/^ll-platform-[a-f0-9]{12}$/.test(project));
 assert(exact(identity,['workspace','namespace','recoveryEpoch','buildId','images'])&&identity.workspace==='local-proof'&&/^looplabs-staging-[a-z0-9-]+$/.test(identity.namespace)&&identity.namespace.length<=128&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(identity.recoveryEpoch)&&/^ack-[a-f0-9]{64}$/.test(identity.buildId)&&exact(identity.images,roles)&&Object.values(identity.images).every(v=>image.test(v)));
 assert(exact(generation,['id','webSha256','workerSha256','transportExpiresAt'])&&sha.test(generation.id)&&sha.test(generation.webSha256)&&sha.test(generation.workerSha256)&&Number.isSafeInteger(generation.transportExpiresAt)&&generation.transportExpiresAt-Math.floor(Date.now()/1000)>=240);
 assert(typeof input.validateEligibility==='function'&&exact(ops,['resolveConfiguration','inspect','checkpoint','stop','start','ready'])&&Object.values(ops).every(v=>typeof v==='function'));
 const directory=resolve(input.directory),state=await lstat(directory);assert(state.isDirectory()&&!state.isSymbolicLink()&&state.uid===process.getuid()&&(state.mode&0o077)===0&&await realpath(directory)===directory,'Owned canonical private operation directory required');
 lockPath=resolve(directory,'transport-activation.lock');lock=await open(lockPath,'wx',0o600);lockIdentity=await lock.stat();
 phase='eligibility';const promise=input.validateEligibility(structuredClone({project,identity,generation}));assert(promise&&typeof promise.then==='function');const eligible=await promise;assert(exact(eligible,['eligible','project','identity','generation'])&&eligible.eligible===true&&isDeepStrictEqual(eligible,{eligible:true,project,identity,generation}),'Trusted eligibility/prerequisite binding required');
 phase='resolved-config';const current=configuration(await ops.resolveConfiguration('current',structuredClone(generation))),next=configuration(await ops.resolveConfiguration('prepared',structuredClone(generation)));
 for(const role of roles){assert(current[role].image===identity.images[role]&&next[role].image===identity.images[role],'Accepted image binding changed');if(pollers.includes(role)){const a=current[role].environment,b=next[role].environment;assert(typeof a.LOOPLABS_TEMPORAL_API_KEY==='string'&&a.LOOPLABS_TEMPORAL_API_KEY&&typeof b.LOOPLABS_TEMPORAL_API_KEY==='string'&&b.LOOPLABS_TEMPORAL_API_KEY&&a.LOOPLABS_TEMPORAL_API_KEY!==b.LOOPLABS_TEMPORAL_API_KEY);assert(a.LOOPLABS_RECOVERY_EPOCH===identity.recoveryEpoch&&a.LOOPLABS_TEMPORAL_NAMESPACE===identity.namespace&&a.LOOPLABS_TEMPORAL_RECORD_BUILD_ID===identity.buildId);assert(isDeepStrictEqual({...next[role],environment:{...b,LOOPLABS_TEMPORAL_API_KEY:a.LOOPLABS_TEMPORAL_API_KEY}},current[role]),'Only poller transport JWT may change');}else assert(isDeepStrictEqual(current[role],next[role]),'Retained configuration changed');}
 assert(next[pollers[0]].environment.LOOPLABS_TEMPORAL_API_KEY===next[pollers[1]].environment.LOOPLABS_TEMPORAL_API_KEY,'Poller credentials differ');
 phase='current-observation';before=observation(await ops.inspect('current'),project,current);assert(roles.every(r=>before[r].running),'Current topology must be running');
 phase='authority-before-stop';const baseline=checkpoint(await ops.checkpoint(),identity);
 phase='stop';stopped=true;await ops.stop([...pollers],'current');
 phase='stopped-observation';const paused=observation(await ops.inspect('current'),project,current);for(const role of roles)assert(paused[role].id===before[role].id&&paused[role].running===!pollers.includes(role),'Stop changed an unrelated role or failed');
 phase='authority-after-stop';assert(isDeepStrictEqual(checkpoint(await ops.checkpoint(),identity),baseline),'Pending authority changed');
 phase='replace';assert(generation.transportExpiresAt-Math.floor(Date.now()/1000)>=240,'Fresh transport lifetime exhausted');await ops.start([...pollers],{generation:structuredClone(generation),noBuild:true,noDeps:true,forceRecreate:true});
 phase='readiness';const ready=await ops.ready(structuredClone(identity));assert(exact(ready,['namespaceAuthenticated','otherNamespaceDenied','workerReady','schedulerReady'])&&Object.values(ready).every(v=>v===true),'Independent namespace/poller readiness required');
 phase='replacement-observation';const after=observation(await ops.inspect('prepared'),project,next);for(const role of roles){assert(after[role].running);if(pollers.includes(role))assert(after[role].healthy&&after[role].id!==before[role].id,'Poller was not replaced and healthy');else assert(isDeepStrictEqual(after[role],before[role]),'Retained role changed');}
 phase='authority-after-replacement';assert(generation.transportExpiresAt>Math.floor(Date.now()/1000),'Transport expired during activation');assert(isDeepStrictEqual(checkpoint(await ops.checkpoint(),identity),baseline),'Pending authority changed');succeeded=true;
 return {version:1,scope:'transport-only activation primitive',activated:true,generationId:generation.id,buildId:identity.buildId,replacedRoles:[...pollers],retainedRoles:[...retained],authorityDigest:baseline.authorityDigest,configurationDigest:digest(next),persistentLauncherIntegrated:false,actualDockerProofEstablished:false};
 }catch{
 if(stopped&&!succeeded){try{phase='containment';await input.operations.stop([...pollers],'prepared');const contained=await input.operations.inspect('prepared');assert(exact(contained,roles)&&pollers.every(r=>contained[r]?.project===input.project&&contained[r]?.service===r&&/^[a-f0-9]{64}$/.test(contained[r]?.id)&&contained[r]?.image===input.identity.images[r]&&contained[r]?.running===false));assert(retained.every(r=>isDeepStrictEqual(contained[r],before[r])));}catch{throw Error('Transport activation refused; poller containment could not be verified');}}
 throw Error(`Transport activation refused at ${phase}; private diagnostics suppressed`);
 }finally{
 await lock?.close();if(lockIdentity){const current=await lstat(lockPath).catch(()=>null);if(current?.dev===lockIdentity.dev&&current?.ino===lockIdentity.ino)await unlink(lockPath);}
 }
}
