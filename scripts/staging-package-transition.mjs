// Disposable-trial application package switch only. No database/schema/authority rollback.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {posix} from "node:path";
const services=["web","temporal-worker","temporal-scheduler"];
const retained=["application-db","temporal-db","temporal","authorization","connector-twin"];
const imageId=/^sha256:[a-f0-9]{64}$/;
const hash=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
function packageContract(value){
 assert(value&&typeof value==="object"&&!Array.isArray(value));
 assert.deepEqual(Object.keys(value).sort(),["buildId","web","worker"]);
 assert(typeof value.buildId==="string"&&/^ack-[a-f0-9]{64}$/.test(value.buildId));
 for(const role of ["web","worker"])assert(typeof value[role]==="string"&&imageId.test(value[role]));
 assert.notEqual(value.web,value.worker);
 return {...value};
}
function inspect(docker,compose,service,project){
 const id=compose("ps","-aq",service);
 assert(typeof id==="string"&&/^[a-f0-9]{64}$/.test(id),"Exactly one existing trial container required");
 const list=JSON.parse(docker("inspect",id));assert(Array.isArray(list)&&list.length===1);
 const c=list[0];
 assert(c.Id===id&&c.Config?.Labels?.["com.docker.compose.project"]===project&&c.Config?.Labels?.["com.docker.compose.service"]===service,"Container is outside the owned trial");
 assert(typeof c.Image==="string"&&imageId.test(c.Image));
 assert(typeof c.State?.Running==="boolean");
 assert(Array.isArray(c.Config.Env)&&Array.isArray(c.Mounts));
 return c;
}
function environmentEntries(entries){
 assert(Array.isArray(entries),"Explicit runtime environment entries required");
 const keys=new Set();
 for(const entry of entries){
  assert(typeof entry==="string"&&!entry.includes("\0"),"Malformed runtime environment entry");
  const separator=entry.indexOf("="),key=entry.slice(0,separator);
  assert(separator>0&&/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)&&!keys.has(key),"Malformed or duplicate runtime environment name");
  keys.add(key);
 }
 // Docker Compose can reorder unique environment entries during recreation.
 // Values remain exact; duplicates are refused because their ordering can matter.
 return [...entries].sort();
}
function mountEntries(entries){
 assert(Array.isArray(entries),"Explicit runtime mounts required");
 const destinations=new Set();
 for(const entry of entries){
  assert(entry&&typeof entry==="object"&&!Array.isArray(entry),"Malformed runtime mount");
  const destination=entry.Destination;
  assert(typeof destination==="string"&&destination.startsWith("/")&&(destination==="/"||!destination.endsWith("/"))&&!destination.includes("\0")&&posix.normalize(destination)===destination&&!destinations.has(destination),"Malformed or duplicate runtime mount destination");
  destinations.add(destination);
 }
 // Docker inspect enumerates its mount map in varying orders, even for the same
 // stopped container. Preserve all attributes; compare only the list order canonically.
 return [...entries].sort((a,b)=>a.Destination<b.Destination?-1:a.Destination>b.Destination?1:0);
}
function configuration(c){
 return {env:environmentEntries(c.Config.Env),user:c.Config.User,command:c.Config.Cmd,entrypoint:c.Config.Entrypoint,healthcheck:c.Config.Healthcheck,mounts:mountEntries(c.Mounts),host:c.HostConfig};
}
function unchangedConfiguration(c){
 // Compare sensitive environment/configuration in memory; return only its digest.
 return hash(configuration(c));
}
export async function transitionRuntimePackage({project,environment,current,target,docker,assertPending,ready}){
 let phase="inputs";
 try{
 assert(typeof project==="string"&&/^ll-platform-[a-f0-9]{12}$/.test(project),"Explicit owned disposable project required");
 const from=packageContract(current),to=packageContract(target);
 assert.equal(from.buildId,to.buildId,"A different worker build needs independent version-compatibility acceptance");
 assert.notEqual(from.web,to.web,"Different retained web packages required");
 assert.notEqual(from.worker,to.worker,"Different retained worker packages required");
 assert(environment&&typeof environment==="object"&&!Array.isArray(environment));
 assert(Object.values(environment).every(v=>typeof v==="string"),"Explicit string runtime environment required");
 assert.equal(environment.LOOPLABS_STAGING_WEB_IMAGE,from.web);assert.equal(environment.LOOPLABS_STAGING_WORKER_IMAGE,from.worker);
 assert(typeof docker==="function"&&typeof assertPending==="function"&&typeof ready==="function");
 const original=Object.freeze({...environment});
 const next=Object.freeze({...original,LOOPLABS_STAGING_WEB_IMAGE:to.web,LOOPLABS_STAGING_WORKER_IMAGE:to.worker});
 const compose=(...args)=>docker("compose","-p",project,"-f","docker-compose.temporal-platform.yml",...args,{env:original});
 const nextCompose=(...args)=>docker("compose","-p",project,"-f","docker-compose.temporal-platform.yml",...args,{env:next});
 // Caller must first verify archive provenance/digests and cold-load both releases.
 // Recheck actual target identities and the packaged worker build before stopping anything.
 phase="target-images";
 for(const id of [to.web,to.worker])assert.equal(docker("image","inspect",id,"--format","{{.Id}}"),id,"Target image identity mismatch");
 phase="target-build";
 const build=JSON.parse(docker("run","--rm","--network","none","--read-only","--cap-drop","ALL","--security-opt","no-new-privileges","--memory","128m","--pids-limit","64",to.worker,"node","-e","process.stdout.write(require('fs').readFileSync('.worker/temporal-manifest.json','utf8'))"));
 assert.equal(build.buildId,to.buildId,"Target packaged worker build mismatch");
 phase="current-containers";
 const before=Object.fromEntries([...services,...retained].map(s=>[s,inspect(docker,compose,s,project)]));
 for(const c of Object.values(before))unchangedConfiguration(c);
 for(const s of services){assert(before[s].State.Running,"Current application role must be running");assert.equal(before[s].Image,s==="web"?from.web:from.worker);}
 for(const s of retained)assert(before[s].State.Running,"Retained infrastructure must be running");
 phase="pending-before-stop";await assertPending();
 // Any failure after stopping is containment, not permission to auto-start old code.
 // Do not change the caller's environment until every postcondition has passed.
 let succeeded=false;
 try{
  phase="writer-stop";compose("stop",...services);
  phase="stopped-writers";
  for(const s of services)assert.equal(inspect(docker,compose,s,project).State.Running,false,"All writers must actually stop before package replacement");
  phase="pending-after-stop";await assertPending();
  phase="replacement-start";nextCompose("up","-d","--no-deps","--force-recreate",...services);
  phase="replacement-readiness";await ready(nextCompose,services);
  for(const s of services){
   phase="replacement-identity";
   const after=inspect(docker,nextCompose,s,project);
   assert(after.State.Running&&after.State.Health?.Status==="healthy","Replacement must actually be healthy");
   assert.notEqual(after.Id,before[s].Id,"Application container was not replaced");
   assert.equal(after.Image,s==="web"?to.web:to.worker,"Replacement used an unexpected image");
   phase="application-configuration";
   if(unchangedConfiguration(after)!==unchangedConfiguration(before[s])){
    const old=configuration(before[s]),replacement=configuration(after);
    for(const key of ["env","user","command","entrypoint","healthcheck","mounts","host"]){
     if(hash([old[key]])!==hash([replacement[key]])){phase=`application-${key}`;break;}
    }
   }
   assert(unchangedConfiguration(after)===unchangedConfiguration(before[s]),"Runtime authority, mounts or hardening changed during package replacement");
  }
  phase="retained-infrastructure";
  for(const s of retained){
   phase="retained-infrastructure";const after=inspect(docker,nextCompose,s,project);
   phase="retained-running";assert(after.State.Running,"Retained infrastructure stopped during replacement");
   phase="retained-identity";assert(after.Id===before[s].Id&&after.Image===before[s].Image,"Retained infrastructure identity changed during replacement");
   phase="retained-configuration";
   if(unchangedConfiguration(after)!==unchangedConfiguration(before[s])){
    const old=configuration(before[s]),replacement=configuration(after);
    for(const key of ["env","user","command","entrypoint","healthcheck","mounts","host"]){
     if(hash([old[key]])!==hash([replacement[key]])){phase=`retained-${key}`;break;}
    }
   }
   assert(unchangedConfiguration(after)===unchangedConfiguration(before[s]),"Database, provider or orchestration service configuration changed during package replacement");
  }
  phase="pending-after-replacement";await assertPending();succeeded=true;
 }finally{
  if(!succeeded){
   const failedPhase=phase;
   // An RPC/health/evidence failure is not success. Attempt writer containment;
   // failed containment propagates too. Never restore a database or approvals.
   phase="containment-stop";nextCompose("stop",...services);
   phase="containment-verification";
   for(const s of services)assert.equal(inspect(docker,nextCompose,s,project).State.Running,false,"Failed package transition could not contain application writers");
   phase=failedPhase;
  }
 }
 return {environment:next,evidence:{buildId:to.buildId,from:{web:from.web,worker:from.worker},to:{web:to.web,worker:to.worker},replacedRoles:3,retainedRoles:5,pendingAuthorityChecks:3}};
 }catch(error){
  console.error(`Package transition refused at ${phase}; no raw configuration or output printed.`);
  throw error;
 }
}

// Version2 is an installed candidate component only. Authenticated package origin
// admission belongs to the source-owned coordinator before this primitive.
// No receipt, label, callback or transition result establishes release eligibility.
import {writeFile,unlink} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';
const installedWriters=['web','temporal-worker','temporal-scheduler','quote-worker','quote-scheduler'];
const installedRetained=['application-db','temporal-db','temporal','authorization','connector-twin','quote-twin','quote-email'];
const installedNames=[...installedWriters,...installedRetained,'offline-installer'];
const packageImages=['web','worker','quote','twin','quoteEmail','provisioner'];
const writerImage=s=>s==='web'?'web':s.startsWith('quote-')?'quote':'worker';
const retainedImage={'connector-twin':'twin','quote-twin':'provisioner','quote-email':'quoteEmail'};
function installedCandidate(value){
 assert(value&&Object.getPrototypeOf(value)===Object.prototype);
 assert.deepEqual(Object.keys(value).sort(),['builds','contract','images']);assert.equal(value.contract,'installed-candidate-package-2');
 assert(value.images&&Object.getPrototypeOf(value.images)===Object.prototype);assert.deepEqual(Object.keys(value.images).sort(),[...packageImages].sort());
 for(const image of Object.values(value.images))assert(typeof image==='string'&&imageId.test(image));assert.equal(new Set(Object.values(value.images)).size,6);
 assert(value.builds&&Object.getPrototypeOf(value.builds)===Object.prototype);assert.deepEqual(Object.keys(value.builds).sort(),['ack','quote']);for(const profile of ['ack','quote'])assert(new RegExp('^'+profile+'-[a-f0-9]{64}$').test(value.builds[profile]));
 return structuredClone(value);
}
function candidateContainer(docker,id,project,ownerName){
 assert(typeof id==='string'&&/^[a-f0-9]{64}$/.test(id));const list=JSON.parse(docker('inspect',id));assert(Array.isArray(list)&&list.length===1);const c=list[0];assert.equal(c.Id,id);assert.equal(c.Config?.Labels?.['looplabs.assembly.owner'],project);assert(imageId.test(c.Image));assert(typeof c.State?.Running==='boolean');unchangedConfiguration(c);
 if(ownerName){assert.equal(c.Name,'/'+ownerName);assert.deepEqual(c.Config.Cmd,['node','--import','tsx','scripts/staging-installed-platform-lifecycle.mjs']);}
 return c;
}
/** Caller owns authenticated current source/archive admission and the pending
 * observer. This never enrolls images, issues authority or selects a DB target. */
export function candidateConfigurationDifference(before,after){
 const a=configuration(before),b=configuration(after),fields=Object.keys(a).filter(k=>hash(a[k])!==hash(b[k]));
 const known=new Set(['Binds','Mounts','Memory','NanoCpus','PidsLimit','NetworkMode','PortBindings','Tmpfs','LogConfig','ReadonlyRootfs','RestartPolicy','Ulimits','CapAdd','CapDrop','SecurityOpt','GroupAdd','UsernsMode','CgroupnsMode','IpcMode','PidMode','CpuShares','CpuPeriod','CpuQuota','CpusetCpus','CpusetMems','MemoryReservation','MemorySwap','Devices','DeviceRequests','AutoRemove','Init','ConsoleSize','ExtraHosts','Dns','DnsOptions','DnsSearch','OomKillDisable','OomScoreAdj','StorageOpt','MaskedPaths','ReadonlyPaths','Isolation','VolumeDriver','VolumesFrom','PublishAllPorts','Privileged']);
 const changed=fields.includes('host')?[...new Set([...Object.keys(a.host),...Object.keys(b.host)])].filter(k=>hash([a.host[k]])!==hash([b.host[k]])):[];
 return {fields,hostFields:[...new Set(changed.map(k=>known.has(k)?k:'other-host-field'))].sort(),beforeSha256:hash(a),afterSha256:hash(b)};
}
export function candidateWriterConfigurationHash(container){
 const value=configuration(container),binds=value.host.Binds;
 if(binds!==null&&binds!==undefined){
  assert(Array.isArray(binds),'Explicit Docker bind list required');const destinations=new Set();
  for(const entry of binds){assert(typeof entry==='string'&&!entry.includes('\0'),'Exact Docker bind specification required');const parts=entry.split(':');assert(parts.length===3&&parts[0].startsWith('/')&&parts[1].startsWith('/')&&posix.normalize(parts[0])===parts[0]&&posix.normalize(parts[1])===parts[1]&&parts[2].length>0,'Canonical unambiguous Linux bind required');assert(!destinations.has(parts[1]),'Duplicate Docker bind destination');destinations.add(parts[1]);}
  // Docker/Compose enumerates the same unique bind map in different orders on
  // recreation. Preserve every byte of each spec, including source and options.
  value.host={...value.host,Binds:[...binds].sort()};
 }
 return hash(value);
}
export async function transitionInstalledCandidatePackage(input){
 let phase='inputs',derived,derivedLoaded,originalLoaded,stopped=false,containmentConfirmed=false,succeeded=false;
 try{
 assert(input&&Object.getPrototypeOf(input)===Object.prototype);assert.deepEqual(Object.keys(input).sort(),['assertPending','composeFile','current','docker','offlineOwner','outputFile','project','ready','target'].sort());
 const {project,docker,assertPending,ready,composeFile,outputFile}=input;assert(/^ll-platform-[a-f0-9]{12}$/.test(project));assert(typeof docker==='function'&&typeof assertPending==='function'&&typeof ready==='function');
 const {readOwnedPrivateFile}=await import('../lib/workspace/owned-private-file.ts'),{installedServiceContainerId}=await import('./staging-installed-host-coordinator.mjs'),{inspectedWorkerArtifact}=await import('./worker-artifact-enrollment.mjs');
 assert(typeof composeFile==='string'&&resolve(composeFile)===composeFile&&typeof outputFile==='string'&&resolve(outputFile)===outputFile&&dirname(outputFile)===dirname(composeFile)&&outputFile!==composeFile);
 const from=installedCandidate(input.current),to=installedCandidate(input.target);assert.deepEqual(from.builds,to.builds,'Independent cross-build compatibility is unavailable');for(const role of ['twin','quoteEmail','provisioner'])assert.equal(from.images[role],to.images[role],'Retained provider/owner images must not change');for(const role of ['web','worker','quote'])assert.notEqual(from.images[role],to.images[role],'Distinct candidate writer images required');
 const owner=input.offlineOwner;assert(owner&&Object.getPrototypeOf(owner)===Object.prototype);assert.deepEqual(Object.keys(owner).sort(),['id','image','name']);assert.equal(owner.name,project+'-installed-owner');assert.equal(owner.image,from.images.provisioner);
 phase='installed-publication';originalLoaded=await readOwnedPrivateFile(composeFile,1048576);const topology=JSON.parse(originalLoaded.bytes.toString('utf8'));assert.equal(originalLoaded.bytes.toString('utf8'),JSON.stringify(topology),'Exact source-owned constructor publication required');assert(topology.services&&Object.getPrototypeOf(topology.services)===Object.prototype);assert.deepEqual(Object.keys(topology.services).sort(),[...installedNames].sort());
 for(const s of installedNames)assert.equal(topology.services[s].labels?.['looplabs.assembly.owner'],project);assert.equal(topology.services['offline-installer'].image,from.images.provisioner);
 const composeFor=file=>(...args)=>docker('compose','-p',project,'-f',file,...args);const compose=composeFor(composeFile),replacementCompose=composeFor(outputFile);
 phase='target-image-admission';for(const role of packageImages)assert.equal(docker('image','inspect',to.images[role],'--format','{{.Id}}'),to.images[role]);
 const profileLocks=new Set();
 for(const [profile,role]of [['ack','worker'],['quote','quote']]){const current=await inspectedWorkerArtifact(from.images[role],docker,profile),target=await inspectedWorkerArtifact(to.images[role],docker,profile);assert.equal(current.imageId,from.images[role]);assert.equal(target.imageId,to.images[role]);assert.equal(current.buildId,from.builds[profile]);assert.equal(target.buildId,to.builds[profile]);profileLocks.add(current.lockHash);profileLocks.add(target.lockHash);for(const key of ['serviceHash','workflowHash','lockHash']){assert(/^[a-f0-9]{64}$/.test(current[key]));assert(/^[a-f0-9]{64}$/.test(target[key]));}for(const key of ['buildId','serviceHash','workflowHash','lockHash'])assert.equal(target[key],current[key],'Exact compiled ABI must remain unchanged');}
 assert.equal(profileLocks.size,1,'Both profiles must share the one installed application lock');
 const inspectMain=s=>candidateContainer(docker,installedServiceContainerId({project,owner:project,service:s,docker}),project);
 phase='current-identities';const before=Object.fromEntries([...installedWriters,...installedRetained].map(s=>[s,inspectMain(s)])),beforeOwner=candidateContainer(docker,owner.id,project,owner.name);assert(beforeOwner.State.Running&&beforeOwner.Image===owner.image);
 for(const s of installedWriters){assert(before[s].State.Running&&before[s].State.Health?.Status==='healthy');assert.equal(before[s].Image,from.images[writerImage(s)]);assert(before[s].HostConfig.ReadonlyRootfs&&before[s].HostConfig.Memory>0&&before[s].HostConfig.PidsLimit>0);assert(/^[1-9][0-9]*:[1-9][0-9]*$/.test(before[s].Config.User));assert(before[s].Mounts.filter(m=>m.Type==='bind').every(m=>m.RW===false),'Writer bind mounts must remain readonly');candidateWriterConfigurationHash(before[s]);assert.equal(docker('image','inspect',topology.services[s].image,'--format','{{.Id}}'),before[s].Image);}
 for(const s of installedRetained){assert(before[s].State.Running);if(retainedImage[s])assert.equal(before[s].Image,from.images[retainedImage[s]]);}
 phase='derived-publication';const next=structuredClone(topology);for(const s of installedWriters)next.services[s].image=to.images[writerImage(s)];await originalLoaded.assertStable();await writeFile(outputFile,JSON.stringify(next),{mode:0o600,flag:'wx'});derived=true;derivedLoaded=await readOwnedPrivateFile(outputFile,1048576);
 const oldResolved=JSON.parse(compose('config','--format','json','--no-env-resolution')),nextResolved=JSON.parse(replacementCompose('config','--format','json','--no-env-resolution')),expected=structuredClone(oldResolved);assert.deepEqual(Object.keys(oldResolved.services).sort(),[...installedNames].sort());for(const s of installedWriters)expected.services[s].image=to.images[writerImage(s)];assert.deepEqual(nextResolved,expected,'Only five resolved Compose image fields may change');
 phase='pending-before-stop';await assertPending();await originalLoaded.assertStable();await derivedLoaded.assertStable();
 try{
  phase='writer-stop';stopped=true;compose('stop',...installedWriters);for(const s of installedWriters)assert.equal(inspectMain(s).State.Running,false);
  phase='pending-after-stop';await assertPending();await originalLoaded.assertStable();await derivedLoaded.assertStable();
  phase='replacement-start';replacementCompose('up','-d','--no-deps','--no-build','--pull','never','--force-recreate',...installedWriters);
  phase='replacement-readiness';await ready(replacementCompose,[...installedWriters]);await originalLoaded.assertStable();await derivedLoaded.assertStable();
  for(const s of installedWriters){phase='replacement-health';const after=inspectMain(s);assert(after.State.Running&&after.State.Health?.Status==='healthy');phase='replacement-container-id';assert.notEqual(after.Id,before[s].Id);phase='replacement-image-id';assert.equal(after.Image,to.images[writerImage(s)]);phase='replacement-configuration';if(candidateWriterConfigurationHash(after)!==candidateWriterConfigurationHash(before[s]))await writeFile(join(dirname(input.outputFile),'package-config-mismatch.json'),JSON.stringify({contract:'private-package-configuration-diagnostic-1',role:s,...candidateConfigurationDifference(before[s],after),releaseEligible:false}),{mode:0o600,flag:'wx'});assert.equal(candidateWriterConfigurationHash(after),candidateWriterConfigurationHash(before[s]),'Writer authority/mounts/hardening changed');}
  for(const s of installedRetained){phase='retained-runtime';const after=inspectMain(s);assert(after.State.Running&&after.Id===before[s].Id&&after.Image===before[s].Image);assert.equal(unchangedConfiguration(after),unchangedConfiguration(before[s]));}
  phase='retained-offline-owner';const afterOwner=candidateContainer(docker,owner.id,project,owner.name);assert(afterOwner.State.Running&&afterOwner.Image===beforeOwner.Image);assert.equal(unchangedConfiguration(afterOwner),unchangedConfiguration(beforeOwner));
  phase='pending-after-replacement';await assertPending();await originalLoaded.assertStable();await derivedLoaded.assertStable();succeeded=true;
 }finally{
  if(!succeeded){const failedPhase=phase;phase='containment-stop';replacementCompose('stop',...installedWriters);phase='containment-verification';for(const s of installedWriters)assert.equal(inspectMain(s).State.Running,false,'Failed candidate writers remain uncontained');containmentConfirmed=true;phase=failedPhase;}
 }
 return {composeFile:outputFile,evidence:{contract:'installed-candidate-transition-2',candidateOnly:true,releaseEligible:false,authorityIssued:false,builds:to.builds,replacedRoles:5,retainedRunningRoles:7,retainedOfflineOwners:1,pendingAuthorityChecks:3,from:from.images,to:to.images,configurationSha256:hash(nextResolved)}};
 }catch{console.error(`Installed candidate transition refused at ${phase}; no raw configuration or output printed.`);throw new Error(`Installed candidate transition refused at ${phase}.`);}
 finally{if(derived&&!succeeded&&(!stopped||containmentConfirmed)){await derivedLoaded?.assertStable();await unlink(input.outputFile);}}
}
