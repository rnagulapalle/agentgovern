// Host-owned controller for the real installed producer. No uploaded metadata,
// preparation result or successful component receipt can satisfy completion.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,copyFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {withInspectedWorkerArtifact} from './worker-artifact-enrollment.mjs';
import {installedAssemblyCompose} from './staging-installed-compose.ts';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export async function waitOwnedPublication(file,running,seconds=180){const deadline=Date.now()+seconds*1000;for(;;){try{return JSON.parse(await readFile(file,'utf8'));}catch{assert(await running(),'Owned controller exited before checkpoint');assert(Date.now()<deadline,'Owned installed checkpoint unavailable');await pause(250);}}}
export async function retainInstalledImageBytes(imageId,profile,docker,directory){assert(resolve(directory)===directory);await mkdir(directory,{mode:0o700});return withInspectedWorkerArtifact(imageId,docker,profile,async(artifact,raw)=>{const prefix=profile==='quote'?'quote-temporal':'temporal';for(const name of [prefix+'-manifest.json',prefix+'-service.cjs',prefix+'-workflow.cjs','pnpm-lock.yaml'])await writeFile(join(directory,name),await readFile(join(raw,name)),{mode:0o600,flag:'wx'});return {...artifact,profile,directory};});}
export async function prepareInstalledOwnerInput(input){assert(process.platform==='linux'&&process.arch==='x64','Fresh genuine Linux/AMD64 required');const {root,docker,images,database,settings}=input;assert(resolve(root)===root);const artifacts=[];for(const profile of ['ack','quote']){assert(/^sha256:[a-f0-9]{64}$/.test(images[profile]));const observed=await retainInstalledImageBytes(images[profile],profile,docker,join(root,profile+'-artifact'));artifacts.push({profile,imageId:observed.imageId,directory:observed.directory});if(profile==='ack')assert.equal(observed.buildId,settings.buildId);}await writeFile(join(root,'owner-input.json'),JSON.stringify({database,settings,artifacts}),{mode:0o600,flag:'wx'});return {artifactsPrepared:true,currentImagesExecuted:false,releaseAccepted:false};}
export async function attachInstalledOwnerPublications(input){const {root,base,ready,uid,gid,images,database}=input;assert(ready.currentImageExecution===false&&ready.quotePublications.nativeExecutionApproved===false);const baseFile=input.baseAttachmentFile??join(root,'attached','compose-installed.json'),quoteFile=input.quoteAttachmentFile??join(root,'quote-publications','attached','compose-quote-installed.json');for(const file of [baseFile,quoteFile])assert(resolve(file)===file&&file.startsWith(root+'/'));const baseAttachment=JSON.parse(await readFile(baseFile,'utf8')),quoteAttachment=JSON.parse(await readFile(quoteFile,'utf8'));
 const provider=ready.quoteProvider,c=JSON.parse(await readFile(provider.listenerFile,'utf8'));
 const topology=installedAssemblyCompose({databaseLifecycle:input.databaseLifecycle,base,baseAttachment,quoteAttachment,root,uid,gid,images:{quote:images.quote,provisioner:images.provisioner,quoteEmail:images.quoteEmail},databaseTls:database.tlsDirectory,databaseData:database.dataDirectory,databasePasswd:database.passwdFile,databaseCa:database.caFile,quote:{webExecutionFile:ready.quotePublications.webExecutionFile,backgroundFile:ready.quotePublications.backgroundFile,provider:{listenerFile:provider.listenerFile,provisionerFile:join(dirname(provider.listenerFile),'../pin-provisioner/provisioner.json'),nativeCa:JSON.parse(await readFile(ready.quotePublications.workerExecutionFile,'utf8')).nativeTransport.caFile,emailCa:c.emailTransport.caFile,nativeTls:c.tlsFile,emailTls:provider.emailProcess.argv.at(-1),emailState:provider.emailProcess.state}}});
 const file=input.outputFile??join(root,'compose-installed-stack.json');assert(resolve(file)===file&&file.startsWith(root+'/'));await writeFile(file,JSON.stringify(topology),{mode:0o600,flag:'wx'});return {file,topology};}
/** Stop actual writers, capture existing recovery identity, produce an actual
 * schema archive, independently recreate its OID, and trigger the existing
 * recovery API. Does not revive sessions, worker tokens or approvals. */
export async function restoreInstalledAssembly(input){const {root,ready,docker,compose,dbContainer,ownerRunning}=input;const writers=['web','temporal-worker','temporal-scheduler','quote-worker','quote-scheduler'];compose('stop',...writers);for(const name of writers)assert.equal(docker('inspect','--format','{{.State.Running}}',input.container(name)),'false');
 await writeFile(join(root,'capture.request'),'capture',{mode:0o600,flag:'wx'});const capture=await waitOwnedPublication(join(root,'capture-ready.json'),ownerRunning);assert(/^[a-f0-9]{64}$/.test(capture.sha256));assert(/^gateway_[a-f0-9]{16}$/.test(ready.schema));
 const sql=statement=>docker('exec',dbContainer,'psql','-h','/tmp','-U','trial','-d','trial','-v','ON_ERROR_STOP=1','-At','-c',statement);
 const beforeOid=sql("SELECT oid::text FROM pg_namespace WHERE nspname='"+ready.schema+"'");assert(/^[1-9][0-9]*$/.test(beforeOid));
 // The supplied exact byte executor avoids UTF8 corruption and enforces the
 // existing owned archive bounds. It must be source-owned, never provider JSON.
 const archive=await input.dumpBytes(['exec',dbContainer,'pg_dump','-h','/tmp','-U','trial','-d','trial','--schema='+ready.schema,'--format=custom']);assert(Buffer.isBuffer(archive)&&archive.length>5&&archive.subarray(0,5).toString()==='PGDMP');await writeFile(join(root,'approved.archive'),archive,{mode:0o600,flag:'wx'});const sha256=createHash('sha256').update(archive).digest('hex');
 sql('DROP SCHEMA '+ready.schema+' CASCADE');await input.restoreBytes(['exec','-i',dbContainer,'pg_restore','-h','/tmp','-U','trial','-d','trial','--no-owner','--exit-on-error'],archive);const afterOid=sql("SELECT oid::text FROM pg_namespace WHERE nspname='"+ready.schema+"'");assert(/^[1-9][0-9]*$/.test(afterOid)&&afterOid!==beforeOid);
 const nextEpoch=randomUUID();assert.notEqual(nextEpoch,ready.epoch);await writeFile(join(root,'restore.request'),JSON.stringify({restoredSchemaOid:afterOid,nextEpoch}),{mode:0o600,flag:'wx'});const repaired=await waitOwnedPublication(join(root,'recovery-ready.json'),ownerRunning);assert.equal(repaired.archiveSha256,sha256);assert.equal(repaired.revivedAuthority,false);assert.equal(repaired.newEpoch,nextEpoch);return {repaired,archive:{sha256,bytes:archive.length,beforeOid,afterOid},writersStopped:5,releaseAccepted:false};}
/** Controller operations used by the typed quote browser. All observations
 * come from an actual offline read-only SQL/provider-state process. */
export function installedQuoteBrowserController(input){const {root,trial,ready,compose,runObserver,runNativePolicyReady,docker,container}=input;
 return async(operation,detail)=>{assert(['observe','arm-lost-quote-response','restart-app'].includes(operation));assert(detail&&/^[a-z-]+$/.test(detail.phase));
  if(operation==='arm-lost-quote-response'){assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(detail.updateActionId));const faults=join(root,'native-loss');await mkdir(faults,{mode:0o700});const file=join(faults,'fault.json');await writeFile(file,JSON.stringify({contract:'owned-native-lost-response-1',workspaceId:'local-proof',quoteId:'quote-42',actionIds:[detail.updateActionId]}),{mode:0o600,flag:'wx'});
   compose('stop','quote-twin');assert.equal(docker('inspect','--format','{{.State.Running}}',container('quote-twin')),'false');const stack=JSON.parse(await readFile(join(root,'compose-installed-stack.json'),'utf8'));stack.services['quote-twin'].command=[ready.quoteProvider.listenerFile,file];stack.services['quote-twin'].volumes.push({type:'bind',source:faults,target:faults,read_only:true});await writeFile(join(root,'compose-installed-stack.json'),JSON.stringify(stack),{mode:0o600});compose('up','-d','--no-deps','--force-recreate','quote-twin');assert.equal(typeof runNativePolicyReady,'function');await runNativePolicyReady();
  }else if(operation==='restart-app'){compose('kill','-s','SIGKILL','web','quote-worker','quote-scheduler');compose('start','web','quote-worker','quote-scheduler');}
  await runObserver();await copyFile(join(root,'quote-provider-observation.json'),join(trial,'quote-provider-observation.json'));return {observedFromActualProvider:true};
 };
}

/** Select exactly the main owned service, preserving retired one-off refusal
 * containers for independent evidence. No arbitrary first-ID selection. */
export function installedServiceContainerId({project,owner,service,docker}){
 assert(/^ll-platform-[a-f0-9]{12}$/.test(project));assert.equal(owner,project);assert(/^[a-z][a-z0-9-]*$/.test(service));
 const ids=docker('ps','-aq','--no-trunc','--filter',`label=com.docker.compose.project=${project}`,'--filter',`label=com.docker.compose.service=${service}`,'--filter','label=com.docker.compose.oneoff=False').split(/\s+/).filter(Boolean);
 assert(ids.length<=1,'Ambiguous installed main runtime service');if(!ids.length)return '';assert(/^[a-f0-9]{64}$/.test(ids[0]));
 const labels=JSON.parse(docker('inspect','--format','{{json .Config.Labels}}',ids[0]));
 for(const [key,value]of Object.entries({'com.docker.compose.project':project,'com.docker.compose.service':service,'com.docker.compose.oneoff':'False','looplabs.assembly.owner':owner}))assert.equal(labels?.[key],value,'Installed main runtime identity mismatch');
 return ids[0];
}

/** Counts/state only for failure containment. Raw rows and identifiers omitted. */
export function quoteRuntimeFailureSummary(observation){
 assert(Array.isArray(observation?.workspaceEvidence?.quoteActions)&&Array.isArray(observation?.backgroundRoutes)&&Array.isArray(observation?.quoteEffects));assert(observation.mailEffects&&typeof observation.mailEffects==='object'&&!Array.isArray(observation.mailEffects));
 const counts={};for(const action of observation.workspaceEvidence.quoteActions){assert(['proposed','held','ready','executing','uncertain','succeeded','failed','blocked','compensated','cancelled'].includes(action.state));counts[action.state]=(counts[action.state]??0)+1;}
 return {available:true,routeCount:observation.backgroundRoutes.length,actionStates:counts,quoteEffectCount:observation.quoteEffects.length,mailEffectCount:Object.keys(observation.mailEffects).length};
}
