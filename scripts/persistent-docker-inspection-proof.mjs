// Actual disposable Docker fixture proof only; never starts accepted platform images.
import {execFileSync} from 'node:child_process';
import {randomBytes,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {persistentRoles,inspectOwnedPersistentDocker,normalizeOwnedDockerInspection} from './persistent-docker-inspection.mjs';
const roles=[...persistentRoles];
const label='com.docker.compose.project';
const tag='alpine:3.20'; // Fixture selection only, not an accepted platform dependency.
const docker=(args,timeout=15000)=>execFileSync('docker',args,{encoding:'utf8',timeout,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']}).trim();
const read=args=>JSON.parse(docker(args));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function assertInspectionFixtureHost(env=process.env,platform=process.platform,arch=process.arch){
 assert(env.LOOPLABS_DOCKER_INSPECTION_PROOF==='isolated-fixture'&&env.GITHUB_ACTIONS==='true'&&platform==='linux'&&arch==='x64'&&typeof env.GITHUB_RUN_ID==='string'&&/^[1-9][0-9]{0,19}$/.test(env.GITHUB_RUN_ID)&&typeof env.GITHUB_SHA==='string'&&/^[a-f0-9]{40}$/.test(env.GITHUB_SHA),'Explicit isolated Linux/AMD64 CI fixture required');
}
function refused(fn){let denied=false;try{fn();}catch{denied=true;}assert(denied,'Malformed measured observation must refuse');}
export async function inspectionFixtureProof(){
 assertInspectionFixtureHost();
 const sources=['scripts/persistent-docker-inspection.mjs','scripts/persistent-docker-inspection-proof.mjs'];
 const fingerprints=async()=>Object.fromEntries(await Promise.all(sources.map(async file=>[file,createHash('sha256').update(await readFile(new URL(`../${file}`,import.meta.url))).digest('hex')])));
 const sourceFingerprints=await fingerprints();
 const project=`ll-platform-${randomBytes(6).toString('hex')}`,network=`${project}-fixture`,extra=`${project}-extra`,volume=`${project}-data`;
 const names=Object.fromEntries(roles.map(role=>[role,`${project}-${role}`]));
 const networks=[],volumes=[],attempted=[];let outcome,phase='image',cleanup=true;
 try{
  docker(['pull','--platform','linux/amd64',tag],120000);
  const image=read(['image','inspect',tag]);assert.equal(image.length,1);
  const imageId=image[0].Id;assert(/^sha256:[a-f0-9]{64}$/.test(imageId));assert.equal(image[0].Os,'linux');assert.equal(image[0].Architecture,'amd64');
  const repoDigest=image[0].RepoDigests.find(value=>/^alpine@sha256:[a-f0-9]{64}$/.test(value));assert(repoDigest,'Actual pulled fixture repository digest required');
  phase='resources';
  for(const name of [network,extra]){networks.push(name);docker(['network','create','--internal','--label',`${label}=${project}`,name]);}
  volumes.push(volume);docker(['volume','create','--label',`${label}=${project}`,volume]);
  const identity={project,containers:{},images:Object.fromEntries(roles.map(role=>[role,imageId]))};
  for(const role of roles){
   const name=names[role];attempted.push(name);
   const id=docker(['create','--name',name,'--label',`${label}=${project}`,'--label',`com.docker.compose.service=${role}`,'--network',network,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','32m','--pids-limit','32','--user','65534:65534','--mount',`type=volume,src=${volume},dst=/fixture,readonly`,'--health-cmd','test -d /fixture','--health-interval','1s','--health-timeout','1s','--health-retries','5',imageId,'sleep','300']);
   assert(/^[a-f0-9]{64}$/.test(id));identity.containers[role]=id;docker(['start',id]);
  }
  phase='ready';let baseline;
  for(const until=Date.now()+30000;Date.now()<until;){baseline=await inspectOwnedPersistentDocker(identity);if(roles.every(role=>baseline[role].running&&baseline[role].healthy))break;await wait(300);}
  assert(roles.every(role=>baseline?.[role].running&&baseline[role].healthy),'Actual fixture health required');
  for(const role of roles){const c=baseline[role].configuration;assert.equal(c.host.hostConfig.ReadonlyRootfs,true);assert.equal(c.host.hostConfig.Memory,32*1024*1024);assert.equal(c.host.hostConfig.PidsLimit,32);assert(c.host.hostConfig.CapDrop.includes('ALL'));assert(c.host.hostConfig.SecurityOpt.includes('no-new-privileges'));assert.equal(Object.keys(c.host.hostConfig.PortBindings||{}).length,0);assert.equal(c.mounts.length,1);assert.equal(c.mounts[0].RW,false);assert.deepEqual(Object.keys(c.host.networkSettings.Networks),[network]);}
  phase='measured-refusals';
  const raw=read(['inspect',...roles.map(role=>identity.containers[role])]);
  refused(()=>normalizeOwnedDockerInspection(raw.slice(1),identity));
  refused(()=>normalizeOwnedDockerInspection([...raw,structuredClone(raw[0])],identity));
  const wrongIds=structuredClone(identity);wrongIds.containers.web='f'.repeat(64);refused(()=>normalizeOwnedDockerInspection(raw,wrongIds));
  const wrongImage=structuredClone(identity);wrongImage.images.web='sha256:'+'f'.repeat(64);refused(()=>normalizeOwnedDockerInspection(raw,wrongImage));
  const wrongLabels=structuredClone(raw);wrongLabels[0].Config.Labels[label]='foreign';refused(()=>normalizeOwnedDockerInspection(wrongLabels,identity));
  const wrongRole=structuredClone(raw);wrongRole[0].Config.Labels['com.docker.compose.service']='foreign';refused(()=>normalizeOwnedDockerInspection(wrongRole,identity));
  phase='network-change';const changedId=identity.containers['temporal-worker'];
  docker(['network','connect',extra,changedId]);
  const attached=await inspectOwnedPersistentDocker(identity);
  assert(!isDeepStrictEqual(attached['temporal-worker'].configuration,baseline['temporal-worker'].configuration));
  assert(Object.hasOwn(attached['temporal-worker'].configuration.host.networkSettings.Networks,extra));
  for(const role of roles.slice(1))assert.deepEqual(attached[role],baseline[role]);
  docker(['network','disconnect',extra,changedId]);
  const restored=await inspectOwnedPersistentDocker(identity);assert(!Object.hasOwn(restored['temporal-worker'].configuration.host.networkSettings.Networks,extra));
  // Restore attachment set, not an assertion that Docker reused endpoint/IP metadata.
  assert.deepEqual(Object.keys(restored['temporal-worker'].configuration.host.networkSettings.Networks),[network]);
  phase='stopped-observation';docker(['stop','--time','1',changedId]);
  const stopped=await inspectOwnedPersistentDocker(identity);assert.equal(stopped['temporal-worker'].running,false);
  outcome={version:1,passed:true,scope:'actual isolated lightweight Docker inspection fixture only',image:{selectionTag:tag,id:imageId,repoDigest},roles:8,checks:{actualHealthyRunning:true,completeSecurityConfiguration:true,measuredMalformedRefusal:true,actualExtraNetworkDetected:true,extraNetworkRemoved:true,stoppedContainerObserved:true},workflowRunId:process.env.GITHUB_RUN_ID,workflowCommit:process.env.GITHUB_SHA,productionChanged:false,activationEstablished:false,acceptedProvenanceEstablished:false,enterpriseSlaEstablished:false};
 }catch{throw Error(`Isolated Docker inspection fixture failed at ${phase}; private diagnostics suppressed`);}
 finally{
  for(const name of attempted.reverse())try{const c=read(['inspect',name]);assert.equal(c.length,1);assert.equal(c[0].Config.Labels[label],project);docker(['rm','--force',c[0].Id]);}catch{cleanup=false;}
  for(const name of volumes.reverse())try{const v=read(['volume','inspect',name]);assert.equal(v[0].Labels[label],project);docker(['volume','rm',name]);}catch{cleanup=false;}
  for(const name of networks.reverse())try{const n=read(['network','inspect',name]);assert.equal(n[0].Labels[label],project);docker(['network','rm',name]);}catch{cleanup=false;}
  try{assert.equal(docker(['ps','-a','--quiet','--filter',`label=${label}=${project}`]),'');assert.equal(docker(['network','ls','--quiet','--filter',`label=${label}=${project}`]),'');assert.equal(docker(['volume','ls','--quiet','--filter',`label=${label}=${project}`]),'');}catch{cleanup=false;}
  if(!cleanup)throw Error('Owned Docker fixture cleanup could not be verified; private diagnostics suppressed');
 }
 assert.deepEqual(await fingerprints(),sourceFingerprints,'Both actual proof sources must remain unchanged');
 return {...outcome,ownedResourceCleanupVerified:true,sourceFingerprints};
}
if(process.argv[1]===fileURLToPath(import.meta.url))inspectionFixtureProof().then(receipt=>console.log(JSON.stringify(receipt,null,2))).catch(()=>{console.error('Isolated Docker inspection fixture refused or failed; no credentials or raw Docker diagnostics printed.');process.exitCode=1;});
