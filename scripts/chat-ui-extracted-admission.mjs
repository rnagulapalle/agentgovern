// Offline proof-only: authenticates fixed independently intaken artifact bytes,
// then reuses existing extracted-worker owner enrollment. No local Docker claim.
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {open,lstat,realpath,readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {enrollExtractedWorker,profileArtifactBytes} from './worker-artifact-enrollment.mjs';
import {chatWorkerBuildInputs} from './chat-ui-worker-admission.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export const chatExtractedPins=Object.freeze({zipSha256:'0f82b3d845ca3100a4e08026b4f1a8bf5d7943ffb9daaa34ff654ed0d91e1154',intakeSha256:'840ae1b3b29b0be18969c44b596760df7353dba41c287d0cbb950b4927699f43',receiptSha256:'8f9563e36fa407c8092d1c1a46c6c0f4399072bbc82396dbf10e8ad3b9b12394',componentSha256:'877143aef01c4e489af8d423916447aec84808d6ae35aaa5367b9124f27a0987',sourceManifestSha256:'77d9e7f3cde69ee092a0022a1961fe3254de59ebb5484a839e2aef3238dc16ee',runId:38128824896,artifactId:11698436492,workflowCommit:'19318a1f57ab0983c0a6cd30108f9f6f7cd877e1'});
// Public, fixed-digest build artifacts exceed the credential reader's1MiB cap.
// This proof-only FD read allows at most2MiB+1, never reads FIFOs, and retains no
// authority from a caller's metadata. Sealed credential reader remains unchanged.
async function artifactBytes(file){const path=resolve(file);assert.equal(await realpath(path),path);const named=await lstat(path);assert(named.isFile()&&!named.isSymbolicLink()&&named.nlink===1&&named.uid===process.getuid()&&named.size>0&&named.size<=2097152);
 const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);try{const st=await h.stat();for(const k of ['dev','ino','uid','size','mode','mtimeMs','ctimeMs','nlink'])assert.equal(st[k],named[k]);const bytes=Buffer.alloc(st.size+1);let n=0;while(n<bytes.length){const r=await h.read(bytes,n,bytes.length-n,n);if(!r.bytesRead)break;n+=r.bytesRead;}assert.equal(n,st.size);const after=await h.stat(),namespace=await lstat(path);for(const k of ['dev','ino','uid','size','mode','mtimeMs','ctimeMs','nlink']){assert.equal(after[k],st[k]);assert.equal(namespace[k],st[k]);}return bytes.subarray(0,n);}finally{await h.close();}}
async function inspectChatArtifactBytes(input,historical){
 assert.deepEqual(Object.keys(input).sort(),['artifactDirectory','componentFile','intakeFile','zipFile']);
 assert.equal(sha(await artifactBytes(input.zipFile)),chatExtractedPins.zipSha256,'Authenticated compiled ZIP changed');
 const intakeBytes=await artifactBytes(input.intakeFile);assert.equal(sha(intakeBytes),chatExtractedPins.intakeSha256,'Authenticated root intake changed');const intake=JSON.parse(intakeBytes);
 assert.equal(intake.runId,chatExtractedPins.runId);assert.equal(intake.artifactId,chatExtractedPins.artifactId);assert.equal(intake.privateCommit,chatExtractedPins.workflowCommit);assert.equal(intake.conclusion,'success');assert.equal(intake.exactRegularMemberCount,9);assert.equal(intake.releaseAccepted,false);assert.equal(intake.localDockerExecutionProved,false);
 const componentBytes=await artifactBytes(input.componentFile);assert.equal(sha(componentBytes),chatExtractedPins.componentSha256);const component=JSON.parse(componentBytes);assert.equal(component.sourceManifestSha256,chatExtractedPins.sourceManifestSha256);
 for(const file of historical?.inputs??chatWorkerBuildInputs)assert.equal(sha(historical?historical.sources[file]:await readFile(file)),component.sourceHashes[file],(historical?'Archived':'Current')+' compiled source drift: '+file);
 assert.deepEqual((await readdir(input.artifactDirectory)).sort(),['ack','compiled-profile-receipt.json','quote']);
 const receiptBytes=await artifactBytes(join(input.artifactDirectory,'compiled-profile-receipt.json'));assert.equal(sha(receiptBytes),chatExtractedPins.receiptSha256);const receipt=JSON.parse(receiptBytes);assert.equal(receipt.candidateOnly,true);assert.equal(receipt.releaseAccepted,false);assert.equal(receipt.extractionRunId,String(chatExtractedPins.runId));assert.equal(receipt.extractionWorkflowCommit,chatExtractedPins.workflowCommit);assert.equal(receipt.sourceManifestSha256,chatExtractedPins.sourceManifestSha256);
 assert.equal(sha(historical?historical.sources['scripts/worker-artifact-enrollment.mjs']:await readFile('scripts/worker-artifact-enrollment.mjs')),receipt.moduleSha256);
 const artifacts=[];
 for(const [index,profile] of ['ack','quote'].entries()){
  const prefix=profile==='ack'?'temporal':'quote-temporal',names=[`${prefix}-manifest.json`,`${prefix}-service.cjs`,`${prefix}-workflow.cjs`,'pnpm-lock.yaml'];const dir=join(input.artifactDirectory,profile);assert.deepEqual((await readdir(dir)).sort(),[...names].sort());const bytes=await Promise.all(names.map(f=>artifactBytes(join(dir,f))));const artifact=profileArtifactBytes(profile,JSON.parse(bytes[0]),bytes[1],bytes[2],bytes[3]);const expected=receipt.images[index];assert.equal(expected.profile,profile);for(const field of ['buildId','serviceHash','workflowHash','lockHash'])assert.equal(artifact[field],expected[field]);assert.equal(sha(bytes[0]),expected.manifestHash);assert.equal(artifact.lockHash,sha(historical?historical.sources['pnpm-lock.yaml']:await readFile('pnpm-lock.yaml')));assert.equal(expected.imageId,component.images[index].imageId);artifacts.push({...artifact,imageId:expected.imageId,profile,names,bytes});
 }
 return {artifact:artifacts[0],provenance:{contract:'authenticated-image-derived-chat-worker-1',runId:chatExtractedPins.runId,artifactId:chatExtractedPins.artifactId,artifactZipSha256:chatExtractedPins.zipSha256,sourceManifestSha256:chatExtractedPins.sourceManifestSha256,candidateOnly:true,releaseAccepted:false,localDockerExecutionProved:false,...(historical?{historical:true,eligible:false,currentSourceValidated:false}:{})}};
}
// Historical inspection authenticates original bytes only; no enrollment function
// calls it. Current inspection below continues checking current source bytes.
export const historicalChatSourceSha256='98cdb5fa86b3ca17d5523e95e1479251f05293a2f0a0c1452ed2f3ecf3a59cb1';
const historicalInputSha256='f34c56af9da78291441e8bfffc7acf7f9a71fb02bdc90d5a85cc7e80a6ebb4a1';
export function validateHistoricalChatSources(snapshot){
 assert.deepEqual(Object.keys(snapshot).sort(),['baseCommit','component','contract','eligible','historical','inputs','overlaySha256','sources']);
 assert.equal(snapshot.contract,'historical-chat-artifact-source-snapshot-1');assert.equal(snapshot.baseCommit,'46cf28cef76b6643aedacc5c1c1dd52e05826019');assert.equal(snapshot.overlaySha256,'8f2247ca31328fb19c6a956db629b0093193e54ea0af7eb159ddb2e0e2a1b9a9');assert.equal(snapshot.historical,true);assert.equal(snapshot.eligible,false);
 assert.equal(sha(snapshot.component),chatExtractedPins.componentSha256);const component=JSON.parse(snapshot.component);
 assert.equal(sha(JSON.stringify(snapshot.inputs)),historicalInputSha256);
 assert.deepEqual(Object.keys(snapshot.sources).sort(),snapshot.inputs);
 for(const file of snapshot.inputs){assert(typeof file==='string'&&/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(file)&&!file.split('/').some(p=>p==='.'||p==='..'));assert.equal(typeof snapshot.sources[file],'string');assert.equal(sha(snapshot.sources[file]),component.sourceHashes[file]);}
 return Object.freeze({historical:true,eligible:false,releaseAccepted:false,currentSourceValidated:false,inputs:snapshot.inputs,sources:snapshot.sources});
}
async function historicalChatSources(){
 const bytes=await artifactBytes(fileURLToPath(new URL('../docs/evidence/historical-chat-artifact-sources-v1.json.gz',import.meta.url)));assert.equal(sha(bytes),historicalChatSourceSha256);
 return validateHistoricalChatSources(JSON.parse(gunzipSync(bytes,{maxOutputLength:16777216}).toString('utf8')));
}
export async function inspectHistoricalAuthenticatedChatArtifact(input){return inspectChatArtifactBytes(input,await historicalChatSources());}
export async function inspectAuthenticatedChatArtifact(input){return inspectChatArtifactBytes(input);}
export async function admitExtractedChatProofWorker(owner,input,output){
 assert.equal(process.env.LOOPLABS_STAGING_DRAIN_PROOF,'isolated','Explicit offline owner enrollment required');
 const {artifact,provenance}=await inspectAuthenticatedChatArtifact(input);await mkdir(output,{mode:0o700});
 for(const [i,file]of artifact.names.entries())await writeFile(join(output,file),artifact.bytes[i],{mode:0o600,flag:'wx'});
 // Existing primitive validates actual concatenated bytes, exact migration14,
 // owner role and immutable active-only enrollment; no caller metadata API.
 const enrolled=await enrollExtractedWorker(owner,artifact.imageId,output,'ack');
 for(const field of ['buildId','serviceHash','workflowHash','lockHash'])assert.equal(enrolled[field],artifact[field]);
 await inspectAuthenticatedChatArtifact(input);return {...enrolled,provenance};
}
