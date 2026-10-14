// Explicit one-shot continuation of the retained October 14 failure. Not a retry.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {lstat,readlink,mkdir,writeFile,rmdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readOwnedPrivateFile} from '../lib/workspace/owned-private-file.ts';
import {authority} from './control-demo-web-release.mjs';
import {commitInternalTlsSelection,containFailedInternalTlsRecovery,assertInstalledInternalTlsHost} from './persistent-internal-tls-renewal.mjs';
import {internalTlsServices} from './persistent-internal-tls-generation.mjs';
import {inspectInternalCertificateGeneration} from './internal-transport-tls-issuer.mjs';
import {inspectRetainedTemporalCertificateMetadata} from './retained-temporal-certificate-metadata.mjs';
import {observePersistentRuntimeContinuation} from './persistent-installed-continuation-observer.mjs';
import {observeQuiescedInternalTlsContinuity} from './internal-tls-quiesced-continuity.mjs';
const configRoot='/srv/looplabs-production/config',configuration=configRoot+'/temporal-renewal-2dc7e4dccd24bc838dfdb578',project='ll-platform-27ec7699f577';
const sha=b=>createHash('sha256').update(b).digest('hex');
const docker=(...args)=>execFileSync('/usr/bin/docker',args,{encoding:'utf8',timeout:180000,maxBuffer:8*1024**2,stdio:['ignore','pipe','pipe']}).trim();
const json=async p=>JSON.parse((await readOwnedPrivateFile(p,1048576)).bytes.toString());
const put=(p,v)=>writeFile(p,JSON.stringify(v,null,2)+'\n',{mode:0o600,flag:'wx'});
const container=s=>{const id=docker('ps','-aq','--filter','label=com.docker.compose.project='+project,'--filter','label=com.docker.compose.service='+s);assert(id&&!id.includes('\n'));return JSON.parse(docker('inspect',id))[0];};
export function assertOriginalAuthorityPreserved(original,current){
 assert(original&&current&&original.connectorStateFiles&&current.connectorStateFiles);
 const a=structuredClone(original),b=structuredClone(current);delete a.connectorStateFiles;delete b.connectorStateFiles;
 assert.deepEqual(b,a,'Original database/email authority changed; continuation refused');return true;
}
export function assertRetainedConnectorCompose(twin,compose){
 const service=compose?.services?.['connector-twin'];assert(service?.image===twin.Image);
 const volumes=service.volumes.filter(v=>v.target==='/state');assert(volumes.length===1&&volumes[0].type==='volume'&&/^[A-Za-z0-9_.-]+$/.test(volumes[0].source));
 const mounts=twin.Mounts.filter(m=>m.Destination==='/state');assert(mounts.length===1&&mounts[0].Type==='volume'&&mounts[0].Name===project+'_'+volumes[0].source&&mounts[0].RW===true);return true;
}
export function assertRetainedConnectorRestart(before,after){
 assert(after.State.Running===true);const select=v=>({id:v.Id,image:v.Image,mounts:v.Mounts,config:v.Config,host:v.HostConfig});assert.deepEqual(select(after),select(before),'Retained connector changed at restart');return true;
}
export function assertQuiescedHelperContinuationFailure(v){assert(v?.contract==='owned-internal-tls-failure-1'&&v.activated===false&&v.failedPhase==='quiesced-continuity'&&v.clientsContained===true&&v.lockRetained===true&&v.expiredRollbackClaimedHealthy===false,'Only the retained helper-inventory failure may continue');return true;}
export async function runContainedContinuation(io){
 const before=await io.snapshot();await io.compareOriginal(before);await io.saveBefore(before);
 await io.startProviders();await io.observeProviders();const after=await io.snapshot();assert.deepEqual(after,before,'Quiesced authority/provider state changed');await io.saveAfter(after);
 await io.startClients();await io.observeProviders();await io.recheck();await io.select();await io.unlock();return true;
}
export async function continueInstalledInternalTlsRecovery(){
 assertInstalledInternalTlsHost({platform:process.platform,arch:process.arch,uid:process.getuid()});
 const lock=join(configRoot,'temporal-renewal.lock'),stat=await lstat(lock);assert(stat.isDirectory()&&!stat.isSymbolicLink()&&stat.uid===1001&&(stat.mode&0o777)===0o700);
 const plan=await json(join(configuration,'internal-tls-plan.json')),failed=await json(join(configuration,'internal-tls-failure.json'));
 assert(plan.configuration===configuration&&plan.project===project&&plan.applicationRoot===authority+'/installation/private-runtime/application');
 assert(failed.activated===false&&failed.failedPhase==='continuity-after-database'&&failed.clientsContained===true&&failed.lockRetained===true);
 const clients=internalTlsServices.filter(s=>s!=='application-db');assert(clients.every(s=>!container(s).State.Running));
 assert(await readlink(join(configRoot,'temporal-recovery-current'))===plan.previousPointer);
 const recheck=async()=>{for(const [file,hash]of Object.entries({...plan.publication.sourceDigests,...plan.publication.successorDigests})){const r=await readOwnedPrivateFile(file,131072);assert(sha(r.bytes)===hash);await r.assertStable();}
 const c=await readOwnedPrivateFile(plan.composition,1048576);assert(sha(c.bytes)===plan.compositionSha256);await c.assertStable();
 for(const [kind,v]of Object.entries(plan.certificates)){const a=await inspectInternalCertificateGeneration({kind,caFile:v.caFile,certificateFile:v.certificateFile,keyFile:v.keyFile});assert(a.caSha256===v.caSha256&&a.certificateSha256===v.certificateSha256&&a.keySha256===v.keySha256);}
 const t=await json(join(configRoot,'temporal-renewal-config.json'));assert.deepEqual(await inspectRetainedTemporalCertificateMetadata({runtimeRoot:t.installation,identity:t.identity}),plan.temporalCertificateMetadata);
 for(const [s,v]of Object.entries(plan.observed))assert(container(s).Image===v.image);
 const db=container('application-db');assert(db.State.Running&&db.State.Health?.Status==='healthy');assert(db.Mounts.some(m=>m.Source===authority+'/installation/private-runtime/db-data'&&m.Destination==='/owned-pg'&&m.RW));assert(db.Mounts.some(m=>m.Source===plan.certificates.db.serverDirectory&&m.Destination==='/owned-tls'&&!m.RW));};
 await recheck();assertQuiescedHelperContinuationFailure(await json(join(configuration,'contained-continuation-failure.json')));const attempt=await lstat(join(configuration,'contained-continuation.lock'));assert(attempt.isDirectory()&&!attempt.isSymbolicLink()&&attempt.uid===1001&&(attempt.mode&0o777)===0o700);await mkdir(join(configuration,'contained-continuation-v2.lock'),{mode:0o700});
 const compose=(...a)=>docker('compose','-p',project,'-f',plan.composition,...a),twin=container('connector-twin');assert(twin.State.Running===false);assertRetainedConnectorCompose(twin,await json(plan.composition));
 let phase='stop-observed-connector';
 try{assert(!container('connector-twin').State.Running);const original=await json(join(configuration,'continuity-before.json'));
 const observe=()=>observePersistentRuntimeContinuation({root:plan.generation,sourceRoot:authority+'/app',sourceFreezeSha256:plan.sourceFreezeSha256,imageId:plan.provisionerImage,network:project+'_application',project,uid:1001,gid:1001});
 const receipt={contract:'owned-internal-tls-activation-1',applicationRoot:plan.applicationRoot,generation:plan.generation,sourceFreezeSha256:plan.sourceFreezeSha256,continuationSha256:plan.publication.continuationSha256,composition:plan.composition,executionAuthorityChanged:false,continuityPreserved:true,originalOverallProviderFilePreservationPassed:false,continuedHelperInventoryFailure:true,originalDatabaseAndEmailPreserved:true,quiescedSameContractPreserved:true,continuedFromPhase:failed.failedPhase,activated:true,boundedFirstRecovery:true,automaticRenewalImplemented:false,temporalCertificatesRenewed:false,temporalCertificateDeadlines:plan.temporalCertificateDeadlines,oldExpiredGenerationRetainedForensics:true,founderLoginAcceptance:false};
 await runContainedContinuation({snapshot:()=>{phase='quiesced-continuity';return observeQuiescedInternalTlsContinuity(plan);},compareOriginal:v=>{phase='compare-original-authority';return assertOriginalAuthorityPreserved(original,v);},saveBefore:v=>put(join(configuration,'continuation-v2-quiesced-before.json'),v),startProviders:()=>{phase='start-providers';compose('up','-d','--no-deps','--no-build','--pull','never','--force-recreate','quote-email','quote-twin');},observeProviders:()=>{phase='observe-installed-providers';return observe();},saveAfter:v=>put(join(configuration,'continuation-v2-quiesced-after-providers.json'),v),startClients:async()=>{phase='start-clients';docker('start',twin.Id);assertRetainedConnectorRestart(twin,container('connector-twin'));compose('up','-d','--no-deps','--no-build','--pull','never','--force-recreate','quote-scheduler','quote-worker','temporal-scheduler','temporal-worker','web');for(let n=0;;n++){if(clients.every(s=>{const v=container(s);return v.State.Running&&(!v.State.Health||v.State.Health.Status==='healthy');}))break;assert(n<90);await new Promise(r=>setTimeout(r,500));}},recheck:()=>{phase='source-recheck';return recheck();},select:async()=>{phase='select-successor';await commitInternalTlsSelection(configuration,receipt);},unlock:()=>{phase='release-lock';return rmdir(lock);}});return receipt;
 }catch{return containFailedInternalTlsRecovery({phase,contain:()=>{compose('stop',...clients);docker('stop',twin.Id);},observeContained:()=>[...clients,'connector-twin'].every(s=>!container(s).State.Running),writeFailure:v=>put(join(configuration,'contained-continuation-v2-failure.json'),v)});}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){try{assert(process.argv.length===2);console.log(JSON.stringify(await continueInstalledInternalTlsRecovery()));}catch{console.error('Contained TLS continuation refused; inspect preserved phase evidence and lock. No credentials printed.');process.exitCode=1;}}
