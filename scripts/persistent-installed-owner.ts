/** Trusted offline one-shot owner preparation only. Runtime restart reads sealed
 * generations; it never repeats installation, mints credentials or starts owner.
 * Private twin scope; no release eligibility or production acceptance issued. */
import assert from 'node:assert/strict';
import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {bootstrapInstalledAssemblyDatabase,type PersistentMember} from './staging-installed-database-bootstrap';
import {installAssembledQuoteRoles} from './staging-installed-quote-roles';
import {prepareNativeQuoteProviderFixture} from './staging-native-quote-provider';
import {publishAssembledQuoteExecution} from './staging-installed-quote-publication';
import {attachInstalledRuntime} from './staging-installed-runtime-attachment';
import {readInstalledAssemblyGenerations} from './staging-installed-publication';
import {bootstrapTenantContext} from '../lib/workspace/tenant-bootstrap';
import {readOwnedPrivateFile} from '../lib/workspace/owned-private-file';
import {enrollExtractedWorker} from './worker-artifact-enrollment.mjs';
import {tokenHash} from '../lib/durable/service';
import {digest} from '../lib/workspace/identity';
import {assertTenantPool} from '../lib/durable/tenant-pool';
import {installedAssemblySourceSnapshot} from './staging-installed-source-snapshot.mjs';
import type {PostgreSQLTransport} from '../lib/durable/pg-transport';
import {readQuoteExecutionGeneration} from '../lib/quotes/execution-generation';
import {readQuoteWorkerExecution} from '../lib/quotes/worker-execution-generation';
import {readQuoteBackgroundGeneration} from '../lib/quotes/background-generation';
import {readWorkloadInstallation} from '../lib/workspace/tenant-bootstrap';
import {createWorkloadPool} from '../lib/durable/workload-pool';
import {attachInstalledOwnerPublications} from './staging-installed-host-coordinator.mjs';
import {inspectPersistentOfflineSource} from './persistent-installed-source-binding.mjs';
import {quotePrivateCause} from './typed-quote-browser-proof.mjs';
type Settings=Parameters<typeof attachInstalledRuntime>[1];
type Input={sourceRoot:string;database:{url:string;transport:PostgreSQLTransport};members:PersistentMember[];settings:Omit<Settings,'workloadToken'|'buildId'>;images:{ack:string;quote:string};sourceFreezeSha256:string};
const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
/** Internal offline process consumes host-extracted exact image bytes. This
 * construction is NOT release eligibility: trusted host verifies image/source
 * before extraction and after owner exits. No Docker socket or owner daemon. */
export function validatePersistentExtractedArtifacts(root:string,artifacts:ReadonlyArray<{profile:'ack'|'quote';imageId:string;directory:string}>,images:{ack:string;quote:string}){
 assert.equal(resolve(root),root);assert.equal(artifacts.length,2);assert.deepEqual(artifacts.map(a=>a.profile).sort(),['ack','quote']);
 for(const a of artifacts){assert.deepEqual(Object.keys(a).sort(),['profile','imageId','directory'].sort());assert.equal(a.imageId,images[a.profile]);assert.equal(resolve(a.directory),a.directory);assert(a.directory.startsWith(root+'/')&&!a.directory.split('/').includes('..'));}
}
/** Reuse the existing isolated extracted-artifact admission only inside the
 * source-checked one-shot owner; never retain this marker for runtime restart. */
export async function withPersistentOfflineEnrollment<T>(enroll:()=>Promise<T>){
 assert.equal(process.env.LOOPLABS_RETAINED_INSTALLATION,'explicit-offline');
 const previous=process.env.LOOPLABS_STAGING_DRAIN_PROOF;
 assert(previous===undefined||previous==='isolated','Foreign enrollment mode refused');
 process.env.LOOPLABS_STAGING_DRAIN_PROOF='isolated';
 try{return await enroll();}finally{if(previous===undefined)delete process.env.LOOPLABS_STAGING_DRAIN_PROOF;else process.env.LOOPLABS_STAGING_DRAIN_PROOF=previous;}
}
export async function preparePersistentOwnerFromExtracted(root:string,input:Input,artifacts:ReadonlyArray<{profile:'ack'|'quote';imageId:string;directory:string}>){
 assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.equal(process.env.LOOPLABS_RETAINED_INSTALLATION,'explicit-offline');assert.equal(artifacts.length,2);assert.deepEqual(artifacts.map(a=>a.profile).sort(),['ack','quote']);
 await inspectPersistentOfflineSource(input.sourceRoot,input.sourceFreezeSha256);validatePersistentExtractedArtifacts(root,artifacts,input.images);
 return preparePersistentOwnerFromArtifacts(root,input,async(db,profile)=>{const a=artifacts.find(a=>a.profile===profile)!;return withPersistentOfflineEnrollment(()=>enrollExtractedWorker(db,a.imageId,a.directory,profile));});
}
async function preparePersistentOwnerFromArtifacts(root:string,input:Input,enroll:(db:Parameters<typeof enrollExtractedWorker>[0],profile:'ack'|'quote')=>ReturnType<typeof enrollExtractedWorker>){
 const sourceBefore=await installedAssemblySourceSnapshot(input.sourceRoot);
 let installed:Awaited<ReturnType<typeof bootstrapInstalledAssemblyDatabase>>|undefined,provider:Awaited<ReturnType<typeof prepareNativeQuoteProviderFixture>>|undefined,stage='installation';
 try{
  const directory=join(root,'installation');await mkdir(directory,{mode:0o700});installed=await bootstrapInstalledAssemblyDatabase({...input.database,directory,endpoint:{kind:'owned-disposable-docker',hostname:'trial-db'},retention:'retain-owned-installation',members:input.members});
  stage='image-enrollment';const ack=await enroll(installed.owner,'ack'),quote=await enroll(installed.owner,'quote');assert.equal(ack.lockHash,quote.lockHash);assert.equal(ack.lockHash,sha(await readFile('pnpm-lock.yaml')));
  const workloadToken=randomBytes(32).toString('base64url');await installed.owner.query("INSERT INTO ll_tokens(hash,org_id,subject,role)VALUES($1,'local-proof','enquiry-temporal','worker')",[tokenHash(workloadToken)]);const settings={...input.settings,buildId:ack.buildId,workloadToken};
  const sealed=join(root,'sealed-web');await mkdir(sealed,{mode:0o700});for(const f of ['web.json','ready.json'])await copyFile(join(dirname(installed.webFile),f),join(sealed,f));const files={webFile:join(sealed,'web.json'),workerFile:installed.workerFile,schedulerFile:installed.schedulerFile};await attachInstalledRuntime(files,settings,join(root,'attached'));stage='quote-publication';const roles=await installAssembledQuoteRoles(installed.owner,files,join(root,'quote-roles'));
  provider=await prepareNativeQuoteProviderFixture({kind:'owned-disposable-docker',databaseUrl:input.database.url,transport:input.database.transport,directory:join(root,'quote-provider')},{retention:'retain-owned-installation'});
  const quotePublications=await publishAssembledQuoteExecution({owner:installed.owner,webFile:files.webFile,quoteFiles:roles.files,named:installed.named,provider,buildId:quote.buildId,temporal:settings.temporal,taskQueue:settings.taskQueue+'-quote'},join(root,'quote-publications'));
  await installed.owner.query('DELETE FROM ll_sessions WHERE hash=ANY($1::text[])',[[digest(installed.named.requesterToken),digest(installed.named.reviewerToken)]]);await installed.stopRuntimePools();assert.deepEqual(await installedAssemblySourceSnapshot(input.sourceRoot),sourceBefore);stage='ready';const ready={version:1,purpose:'retained-private-installed-runtime',files,quoteFiles:roles.files,quotePublications,quoteProvider:{listenerFile:provider.listenerFile,emailProcess:provider.emailProcess,providerSchema:provider.schema,providerSchemaOid:provider.schemaOid,providerRoles:Object.fromEntries(provider.roleOids)},schema:installed.schema,schemaOid:installed.schemaOid,epoch:installed.epoch,roles:{...installed.roles,...roles.roles},images:input.images,enrolled:[ack,quote],sourceFreezeSha256:input.sourceFreezeSha256,memberEmails:installed.members!.map(m=>m.email),offlineOwnerRequiredForRuntime:false,currentImageExecution:false,releaseAccepted:false,productionActivated:false};
  const continuation=join(root,'runtime-continuation');await mkdir(continuation,{mode:0o700});await writeFile(join(continuation,'retained-runtime-ready.json'),JSON.stringify(ready),{mode:0o600,flag:'wx'});return ready;
 }catch(error){await writeFile(join(root,'retained-owner-failure.json'),JSON.stringify({stage,cause:quotePrivateCause(error,[input.database.url,...input.members.map(m=>m.passwordHash)]),runtimePublished:false,automaticReinstallationPermitted:false,releaseAccepted:false}),{mode:0o600,flag:'wx'}).catch(()=>{});throw Error('Persistent owner preparation refused; preserve private state for explicit owner review');}
 finally{await provider?.disconnect();await installed?.disconnect();}
}
/** Resume validation is read-only and closes every scoped pool; no owner input,
 * passwords/import, initdb, schema generation or cleanup is accepted here. */
/** Stop only declared writer services. Bootstrap has no quote containers yet;
 * SQL/OID/session and exact baseline checks still follow before owned teardown. */
export function persistentCleanupWriterServices(declared:ReadonlyArray<string>){
 assert(Array.isArray(declared)&&declared.every(name=>typeof name==='string'));assert.equal(new Set(declared).size,declared.length);
 for(const required of ['application-db','temporal-db','web','temporal-worker','temporal-scheduler'])assert(declared.includes(required));
 return ['web','temporal-worker','temporal-scheduler','quote-worker','quote-scheduler','quote-twin','quote-email'].filter(name=>declared.includes(name));
}
export async function finishPersistentScopedCleanup(closers:ReadonlyArray<()=>Promise<void>>,primary?:{error:unknown}){
 const results=await Promise.allSettled(closers.map(close=>Promise.resolve().then(close)));
 const failures=results.filter((result):result is PromiseRejectedResult=>result.status==='rejected').map(result=>result.reason);
 if(failures.length)throw new AggregateError([...(primary?[primary.error]:[]),...failures],'Persistent scoped continuation cleanup failed; inspection not accepted');
}
export async function inspectPersistentRuntimeContinuation(root:string,expectedSourceFreezeSha256:string,sourceRoot=process.cwd()){
 assert.equal(sha(JSON.stringify(await installedAssemblySourceSnapshot(sourceRoot),null,2)+'\n'),expectedSourceFreezeSha256,'Current retained runtime source differs');const ready=await readOwnedPrivateFile(join(root,'runtime-continuation','retained-runtime-ready.json'),131072),c=JSON.parse(ready.bytes.toString('utf8'));assert.equal(c.version,1);assert.equal(c.purpose,'retained-private-installed-runtime');assert.equal(c.sourceFreezeSha256,expectedSourceFreezeSha256);assert.equal(c.offlineOwnerRequiredForRuntime,false);assert.equal(c.releaseAccepted,false);
 const generations=await readInstalledAssemblyGenerations(c.files),quoteWeb=await readQuoteExecutionGeneration(c.quotePublications.webExecutionFile),quoteWorker=await readQuoteWorkerExecution(c.quotePublications.workerExecutionFile),background=await readQuoteBackgroundGeneration(c.quotePublications.backgroundFile),scheduler=await readWorkloadInstallation(c.quoteFiles.schedulerFile);
 assert.equal(quoteWeb.metadata.version,2);if(quoteWeb.metadata.version!==2)throw Error('Installed TLS quote generation required');const qw=quoteWorker.metadata;
 for(const epoch of [generations.web.config.web[0].epoch,generations.worker.config.entries[0].epoch,generations.scheduler.config.entries[0].epoch,quoteWeb.metadata.recoveryEpoch,qw.recoveryEpoch,background.recoveryEpoch,scheduler.config.entries[0].epoch])assert.equal(epoch,c.epoch);
 for(const generation of [quoteWorker.installation,scheduler.config]){assert.equal(generation.schema,c.schema);assert.equal(generation.installation,generations.web.config.installation);assert.deepEqual(generation.transport,generations.web.config.transport);assert.equal(generation.entries.length,1);}
 assert.equal(quoteWorker.workload.purpose,'worker');assert.equal(scheduler.config.entries[0].purpose,'scheduler');assert.notEqual(quoteWorker.workload.role,scheduler.config.entries[0].role);
 assert.equal(quoteWeb.metadata.webGenerationFile,c.files.webFile);assert.equal(quoteWeb.metadata.scopeId,qw.scopeId);assert.equal(background.scopeId,qw.scopeId);assert.equal(background.workspaceId,qw.workspaceId);assert.equal(quoteWeb.metadata.workspaceId,qw.workspaceId);assert.equal(background.databaseOid,qw.databaseOid);assert.equal(background.pin.workerRoleOid,qw.roleOid);assert.equal(background.pin.buildId,qw.buildId);assert.equal(c.roles[quoteWorker.workload.role],qw.roleOid);assert.equal(c.roles[scheduler.config.entries[0].role],background.pin.schedulerRoleOid);assert.equal(c.roles[generations.web.config.web[0].role],quoteWeb.metadata.roleOid);
 assert.deepEqual(c.memberEmails.length,2);assert.notEqual(c.memberEmails[0],c.memberEmails[1]);assert.equal(quoteWeb.metadata.requester,c.memberEmails[0]);
 const pools=[] as Awaited<ReturnType<typeof createWorkloadPool>>[];let loaded:Awaited<ReturnType<typeof bootstrapTenantContext>>|undefined,primary: {error:unknown}|undefined;
 try{
  for(const [publication,file]of [[generations.worker.config,c.files.workerFile],[generations.scheduler.config,c.files.schedulerFile],[quoteWorker.installation,c.quoteFiles.workerFile],[scheduler.config,c.quoteFiles.schedulerFile]] as const){const e=publication.entries[0];const pool=await createWorkloadPool({LOOPLABS_WORKLOAD_INSTALLATION_FILE:file,LOOPLABS_DATABASE_URL:e.url,LOOPLABS_WORKSPACE_ID:e.org,LOOPLABS_RECOVERY_EPOCH:e.epoch,LOOPLABS_TENANT_DATABASE_ROLE:e.role,LOOPLABS_TENANT_DATABASE_SCHEMA:publication.schema},e.purpose as 'worker'|'scheduler');pools.push(pool);const binding=await assertTenantPool(pool,e.org);assert.equal(binding.roleOid,c.roles[e.role]);assert.equal(binding.databaseOid,background.databaseOid);}
  loaded=await bootstrapTenantContext(c.files.webFile,false,false,undefined,{kind:'installed-runtime'},async(web)=>{const db=web.get(qw.workspaceId);assert(db);await quoteWeb.assertWebPool(db);const members=(await db.query('SELECT email,name,active FROM ll_members WHERE org_id=$1 AND email=ANY($2::text[]) ORDER BY email',[qw.workspaceId,c.memberEmails])).rows;assert.equal(members.length,2);assert.deepEqual(members.map(m=>m.email),[...c.memberEmails].sort());assert(members.every(m=>m.active===true&&typeof m.name==='string'&&m.name.length>0));});
  assert.equal(generations.web.config.schema,c.schema);for(const read of [ready,generations.web,generations.worker,generations.scheduler,quoteWeb,quoteWorker,background,scheduler])await read.assertStable();
  assert.equal(sha(JSON.stringify(await installedAssemblySourceSnapshot(sourceRoot),null,2)+'\n'),expectedSourceFreezeSha256);return {scope:'read-only retained five-process/quote/named-member continuation',sourceFreezeSha256:expectedSourceFreezeSha256,schema:c.schema,epoch:c.epoch,ownerConnectionOpened:false,credentialsRotated:false,releaseAccepted:false};
 }catch(error){primary={error};throw error;}finally{await finishPersistentScopedCleanup([...pools.map(pool=>()=>pool.end()),...(loaded?[()=>loaded!.close()]:[])],primary);}
}
/** Explicit retained construction only; default disposable constructor unchanged.
 * Offline owner has a disabled profile and may not be started by runtime up. */
export async function persistentInstalledRuntimeCompose(input:Parameters<typeof attachInstalledOwnerPublications>[0],expectedSourceFreezeSha256:string,continuation:object){
 const {consumePersistentContinuation}=await import('./persistent-installed-continuation-observer.mjs');
 consumePersistentContinuation(continuation,{root:input.root,sourceFreezeSha256:expectedSourceFreezeSha256});
 const retained=await readOwnedPrivateFile(join(input.root,'runtime-continuation','retained-runtime-ready.json'),131072);assert.deepEqual(input.ready,JSON.parse(retained.bytes.toString('utf8')));const result=await attachInstalledOwnerPublications({...input,databaseLifecycle:'persistent'}),services=result.topology.services;
 services['offline-installer'].profiles=['offline-installation-only'];services['offline-installer'].restart='no';services['offline-installer'].entrypoint=['node','--import','tsx','scripts/persistent-installed-owner-process.mjs'];
 for(const [name,service] of Object.entries(services))if(name!=='offline-installer')(service as Record<string,unknown>).restart='unless-stopped';
 await writeFile(result.file,JSON.stringify(result.topology),{mode:0o600});return result;
}
