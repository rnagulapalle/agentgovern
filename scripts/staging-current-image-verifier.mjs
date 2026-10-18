// Same-process build observation, not authenticated CI intake or release eligibility.
// Existing hosted workflow injects this unchanged component helper at app root.
import {validateFreeze,validateSelectedImage} from '../current-profile-image-bytes-component.mjs';
import {actualInstalledDiagnosticRunner} from './installed-diagnostic-runner.mjs';
import {ownedBuilder} from './staging-owned-builder.mjs';
import {inspectedWorkerArtifact} from './worker-artifact-enrollment.mjs';
import {validateInstalledProofConstruction} from './current-proof-source-registry.mjs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,lstat,realpath,rm,chmod} from 'node:fs/promises';
import {resolve,join,dirname,parse} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
const digest=/^[a-f0-9]{64}$/;
const reusedHelperSha256='d9612f5d505a9e957b859be6010a352270e2ed389d150bb1779f6386de491e59';
async function producerBytes(){
 const helper=await canonicalRegular(fileURLToPath(new URL('../current-profile-image-bytes-component.mjs',import.meta.url)),1024**2);assert.equal(sha(helper),reusedHelperSha256,'Reviewed injected helper bytes differ');
 return {helper:sha(helper),producer:sha(await canonicalRegular(fileURLToPath(import.meta.url),1024**2))};
}
async function canonicalRegular(file,limit){
 const path=resolve(file);assert.equal(path,file);assert.equal(await realpath(path),path);
 for(let p=dirname(path);;p=dirname(p)){assert(!(await lstat(p)).isSymbolicLink());if(p===parse(p).root)break;}
 const before=await lstat(path);assert(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&before.size>0&&before.size<=limit);
 const bytes=await readFile(path),after=await lstat(path);for(const k of ['dev','ino','uid','mode','size','mtimeMs','ctimeMs','nlink'])assert.equal(after[k],before[k]);assert.equal(bytes.length,before.size);return bytes;
}
export async function verifyApprovedCurrentBuildSources({sourceRoot,freezeFile,freezeSha256,constructionSha256}){
 assert(digest.test(freezeSha256)&&digest.test(constructionSha256));assert.equal(resolve(sourceRoot),sourceRoot);assert.equal(await realpath(sourceRoot),sourceRoot);
 const bytes=await canonicalRegular(freezeFile,2*1024**2);assert.equal(sha(bytes),freezeSha256,'Approved source freeze bytes differ');const freeze=JSON.parse(bytes);validateFreeze(freeze);
 validateInstalledProofConstruction(sourceRoot);
 assert.equal(sha(await canonicalRegular(join(sourceRoot,'scripts/current-installed-proof-sources.json'),1024**2)),constructionSha256);
 for(const [file,h]of Object.entries(freeze.sourceHashes))assert.equal(sha(await canonicalRegular(join(sourceRoot,file),4*1024**2)),h,'Approved source byte drift');
 return freeze;
}
/** Closed ACK/quote recipe; no arbitrary target, label, Dockerfile or build argument. */
export function currentAssemblyBuildArguments({sourceRoot,iidFile,tag,owner,freezeSha256,runId,profile='ack',execution='github-actions'}){
 assert.equal(resolve(sourceRoot),sourceRoot);assert.equal(resolve(iidFile),iidFile);assert(['ack','quote'].includes(profile));assert(['github-actions','dedicated-isolated-linux'].includes(execution));assert(new RegExp('^ll-platform-[a-f0-9]{24}:'+profile+'$').test(tag));assert(/^[a-f0-9]{48}$/.test(owner));assert(digest.test(freezeSha256));assert(execution==='github-actions'?/^[1-9][0-9]*$/.test(runId):/^dedicated-[a-f0-9]{24}$/.test(runId));
 const target=profile==='quote'?'quote-runtime':'runner';return ['--platform','linux/amd64','--target',target,'--build-arg','LOOPLABS_WORKER_PROFILE='+profile,'--file',join(sourceRoot,'Dockerfile.temporal'),'--iidfile',iidFile,'--tag',tag,
 '--label','looplabs.worker.profile='+profile,'--label','looplabs.worker.target='+target,'--label','looplabs.source-manifest-sha256='+freezeSha256,'--label','looplabs.profile.component.run='+runId,'--label','looplabs.assembly.build.owner='+owner,sourceRoot];
}
export function validateOwnedAssemblyImage(facts,{imageId,freezeSha256,runId,owner,profile='ack'}){
 validateSelectedImage(facts,imageId,profile,freezeSha256);assert.equal(facts.Config.Labels?.['looplabs.profile.component.run'],runId);assert.equal(facts.Config.Labels?.['looplabs.assembly.build.owner'],owner);
}
const handles=new WeakMap();
function dockerFor(root){
 const env={PATH:process.env.PATH,HOME:process.env.HOME};
 return (...args)=>{try{return execFileSync('docker',args,{cwd:root,env,encoding:'utf8',timeout:600000,maxBuffer:4*1024**2,stdio:['ignore','pipe','pipe']}).trim();}catch{throw Error('Owned Docker operation refused; cleanup may require operator inspection.');}};
}
/** Only this factory can originate its returned verifier. No image metadata,
 * uploaded label, Docker callback or eligible JSON is accepted as build evidence.
 * Caller must supply independently reviewed immutable source expectations.
 * This may build one owned image/builder; it never runs application containers,
 * opens a database, grants/enrolls authority or authorizes an accepted artifact. */
export async function buildCurrentAssemblyImage(input){
 assert.deepEqual(Object.keys(input).sort(),['sourceRoot','freezeFile','freezeSha256','constructionSha256',...(input.profile===undefined?[]:['profile']),...(input.execution===undefined?[]:['execution'])].sort());const profile=input.profile??'ack',execution=input.execution??'github-actions';assert(['ack','quote'].includes(profile));assert(['github-actions','dedicated-isolated-linux'].includes(execution));assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');if(execution==='github-actions'){assert.equal(process.env.GITHUB_ACTIONS,'true');assert(/^[1-9][0-9]*$/.test(process.env.GITHUB_RUN_ID));assert(/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA));}else{assert.equal(actualInstalledDiagnosticRunner().mode,'dedicated-isolated-linux');}assert(!process.env.DOCKER_HOST&&!process.env.DOCKER_CONTEXT&&!process.env.DOCKER_TLS_VERIFY&&!process.env.DOCKER_CERT_PATH,'Qualified same-job default Docker only');
 const producerBefore=await producerBytes(),before=await verifyApprovedCurrentBuildSources(input),docker=dockerFor(input.sourceRoot),nonce=randomBytes(12).toString('hex'),owner=randomBytes(24).toString('hex'),tag=`ll-platform-${nonce}:${profile}`,runId=execution==='github-actions'?process.env.GITHUB_RUN_ID:'dedicated-'+nonce;
 const builder=ownedBuilder(docker,'ll-platform-'+randomBytes(6).toString('hex')+'-build'),dir=await mkdtemp(join(await realpath(tmpdir()),'ll-current-assembly-'));await chmod(dir,0o700);
 let builtId,observation,handle,builderStarted=false;
 const inspect=id=>{const facts=JSON.parse(docker('image','inspect',id));assert.equal(facts.length,1);validateOwnedAssemblyImage(facts[0],{imageId:id,freezeSha256:input.freezeSha256,runId,owner,profile});return facts[0];};
 const absent=id=>{const ids=docker('image','ls','--no-trunc','--quiet').split('\n').filter(Boolean);assert(ids.every(v=>/^sha256:[a-f0-9]{64}$/.test(v)));return !ids.includes(id);};
 const retire=()=>{
  if(!builtId)return;
  if(absent(builtId))return;
  const facts=inspect(builtId);assert.deepEqual([...(facts.RepoTags||[])].sort(),[tag],'Image acquired another owner; no shared image deletion');
  docker('image','rm','--no-prune',tag);
  if(!absent(builtId)){const remaining=inspect(builtId);assert.equal((remaining.RepoTags||[]).length,0);docker('image','rm','--no-prune',builtId);}
  assert(absent(builtId),'Owned build image retirement incomplete');
 };
 try{
  assert.equal(docker('image','ls','--filter','reference='+tag,'--format','{{.ID}}'),'','Fresh owned tag required');
  builderStarted=true;builder.start();
  const iidFile=join(dir,'image-id');builder.build(...currentAssemblyBuildArguments({...input,iidFile,tag,owner,runId,profile,execution}));
  const iid=await canonicalRegular(iidFile,128);builtId=iid.toString('utf8').trim();assert(/^sha256:[a-f0-9]{64}$/.test(builtId));
  inspect(builtId);const tagged=JSON.parse(docker('image','inspect',tag));assert.equal(tagged.length,1);assert.equal(tagged[0].Id,builtId);
  const artifact=await inspectedWorkerArtifact(builtId,docker,profile);assert.equal(artifact.imageId,builtId);
  assert.deepEqual(await verifyApprovedCurrentBuildSources(input),before);assert.deepEqual(await producerBytes(),producerBefore);
  observation=Object.freeze({imageId:builtId,profile,buildId:artifact.buildId,serviceHash:artifact.serviceHash,workflowHash:artifact.workflowHash,lockHash:artifact.lockHash,constructionSha256:input.constructionSha256});
  builder.close();builderStarted=false;
  handle=Object.freeze({imageId:builtId,verifyCurrentImage:async expected=>{try{
   assert.deepEqual(Object.keys(expected).sort(),['imageId','constructionSha256'].sort());const owned=handles.get(handle);assert(owned&&!owned.closed,'Current build lease absent or retired');assert.equal(expected.imageId,observation.imageId);assert.equal(expected.constructionSha256,observation.constructionSha256);
   assert.deepEqual(await verifyApprovedCurrentBuildSources(input),before);inspect(builtId);const again=await inspectedWorkerArtifact(builtId,docker,profile);for(const field of ['buildId','serviceHash','workflowHash','lockHash'])assert.equal(again[field],observation[field]);assert.deepEqual(await verifyApprovedCurrentBuildSources(input),before);
   assert.deepEqual(await producerBytes(),producerBefore);return {...observation};
  }catch{throw Error('Current build verification refused; no current-image authority established.');}},close:async()=>{try{const owned=handles.get(handle);assert(owned&&!owned.closed,'Current build lease absent or retired');retire();owned.closed=true;}catch{throw Error('Owned image retirement unconfirmed; retain publication and inspect owned resources.');}},evidence:Object.freeze({contract:'same-process-current-assembly-build-1',sourceManifestSha256:input.freezeSha256,constructionSha256:input.constructionSha256,producerHashes:producerBefore,sourceBeforeAfter:true,observedBuild:true,execution,authenticatedCi:false,releaseAccepted:false})});
  handles.set(handle,{closed:false});return handle;
 }catch{
  let cleanupConfirmed=false;try{
  // If Docker completed but an iidfile was not observed, only a matching unique
  // owner-labelled random tag may supply the cleanup identity; never authority.
  if(!builtId&&docker('image','ls','--filter','reference='+tag,'--format','{{.ID}}')){const rows=JSON.parse(docker('image','inspect',tag));assert.equal(rows.length,1);validateOwnedAssemblyImage(rows[0],{imageId:rows[0].Id,freezeSha256:input.freezeSha256,runId,owner,profile});builtId=rows[0].Id;}
  retire();cleanupConfirmed=true;}catch{/* No raw Docker stderr or source paths leave this boundary. */}
  throw Error(cleanupConfirmed?'Current assembly build observation refused; no enrollment or release authority granted.':'Current assembly build observation refused; owned image cleanup unconfirmed.');
 }finally{try{if(builderStarted)builder.close();await rm(dir,{recursive:true});}catch{throw Error('Owned build temporary-resource cleanup unconfirmed; no release acceptance.');}}
}
