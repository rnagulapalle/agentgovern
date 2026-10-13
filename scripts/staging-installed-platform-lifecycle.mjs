// Offline retained owner controller for the existing isolated assembled producer.
// No uploaded receipt or JSON eligibility substitutes for inspected image bytes.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile,access} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {readOwnedPrivateFile} from '../lib/workspace/owned-private-file.ts';
import {bootstrapInstalledAssemblyDatabase} from './staging-installed-database-bootstrap.ts';
import {attachInstalledRuntime} from './staging-installed-runtime-attachment.ts';
import {captureInstalledAssemblyRecovery,recoverInstalledAssemblyRuntime} from './staging-installed-recovery-lifecycle.ts';
import {enrollExtractedWorker} from './worker-artifact-enrollment.mjs';
import {installAssembledQuoteRoles} from './staging-installed-quote-roles.ts';
import {prepareNativeQuoteProviderFixture} from './staging-native-quote-provider.ts';
import {publishAssembledQuoteExecution} from './staging-installed-quote-publication.ts';
import {Pool} from 'pg';
import {scopedPoolOptions} from '../lib/durable/pg-transport.ts';
import {onboardInstalledQuoteSuccessor} from './staging-installed-successor-onboarding.ts';
import {tokenHash} from '../lib/durable/service.ts';
import {quotePrivateCause} from './typed-quote-browser-proof.mjs';
const root=process.env.LOOPLABS_INSTALLED_ASSEMBLY_DIRECTORY;
assert(root&&root.startsWith('/')&&process.env.LOOPLABS_STAGING_PLATFORM_PROOF==='isolated');
const inputRead=await readOwnedPrivateFile(join(root,'owner-input.json'),65536),input=JSON.parse(inputRead.bytes.toString('utf8'));
assert.deepEqual(Object.keys(input).sort(),['database','settings','artifacts'].sort());
assert(Array.isArray(input.artifacts)&&input.artifacts.length===2);
assert.deepEqual(input.artifacts.map(a=>a.profile).sort(),['ack','quote']);
const waitEither=async names=>{const until=Date.now()+300000;for(;;){for(const name of names){try{await access(join(root,name));return name;}catch{}}assert(Date.now()<until,'Installed lifecycle checkpoints missing');await new Promise(r=>setTimeout(r,250));}};
const waitFor=async name=>{const until=Date.now()+300000;for(;;){try{await access(join(root,name));return;}catch{assert(Date.now()<until,'Installed lifecycle checkpoint missing');await new Promise(r=>setTimeout(r,250));}}};
let installed,quoteRoles,quoteProvider,capture,quoteCapture,target;let stage='install';
try{
 const directory=join(root,'installation');await mkdir(directory,{mode:0o700});
 installed=await bootstrapInstalledAssemblyDatabase({...input.database,directory,endpoint:{kind:'owned-disposable-docker',hostname:'trial-db'}});
 await inputRead.assertStable();
 const enrolled=[];for(const artifact of input.artifacts){assert.deepEqual(Object.keys(artifact).sort(),['profile','imageId','directory'].sort());assert(/^sha256:[a-f0-9]{64}$/.test(artifact.imageId));process.env.LOOPLABS_STAGING_DRAIN_PROOF='isolated';enrolled.push(await enrollExtractedWorker(installed.owner,artifact.imageId,artifact.directory,artifact.profile));}delete process.env.LOOPLABS_STAGING_DRAIN_PROOF;
 const ack=enrolled.find(a=>a.buildId.startsWith('ack-'));assert(ack);assert.equal(input.settings.buildId,ack.buildId);
 const workloadToken=randomBytes(32).toString('base64url');await installed.owner.query("INSERT INTO ll_tokens(hash,org_id,subject,role)VALUES($1,'local-proof','enquiry-temporal','worker')",[tokenHash(workloadToken)]);
 const settings={...input.settings,workloadToken};
 const webDirectory=join(root,'sealed-web');await mkdir(webDirectory,{mode:0o700});for(const f of ['web.json','ready.json'])await copyFile(join(dirname(installed.webFile),f),join(webDirectory,f));
 const files={webFile:join(webDirectory,'web.json'),workerFile:installed.workerFile,schedulerFile:installed.schedulerFile};
 await attachInstalledRuntime(files,settings,join(root,'attached'));
 // Source-owned additive grants and two independently sealed quote SQL roles.
 // The separate provider/web/worker publications are required before execution.
 quoteRoles=await installAssembledQuoteRoles(installed.owner,files,join(root,'quote-roles'));
 quoteProvider=await prepareNativeQuoteProviderFixture({kind:'owned-disposable-docker',databaseUrl:input.database.url,transport:input.database.transport,directory:join(root,'quote-provider')});
 const quote=enrolled.find(a=>a.buildId.startsWith('quote-'));assert(quote);
 const quotePublications=await publishAssembledQuoteExecution({owner:installed.owner,webFile:files.webFile,quoteFiles:quoteRoles.files,named:installed.named,provider:quoteProvider,buildId:quote.buildId,temporal:settings.temporal,taskQueue:settings.taskQueue+'-quote'},join(root,'quote-publications'));
 await writeFile(join(root,'accounts.json'),JSON.stringify({accounts:installed.accounts}),{mode:0o600,flag:'wx'});
 await writeFile(join(root,'installation-ready.json'),JSON.stringify({files,quoteFiles:quoteRoles.files,quotePublications,quoteProvider:{listenerFile:quoteProvider.listenerFile,emailProcess:quoteProvider.emailProcess,providerSchema:quoteProvider.schema,providerSchemaOid:quoteProvider.schemaOid,providerRoles:Object.fromEntries(quoteProvider.roleOids)},roles:{...installed.roles,...quoteRoles.roles},enrolled,epoch:installed.epoch,schema:installed.schema,currentImageExecution:false}),{mode:0o600,flag:'wx'});
 stage='prearchive';await waitFor('capture.request');await installed.stopRuntimePools();
 target={transport:input.database.transport,installation:installed.installation,schema:installed.schema,database:installed.database,ownerRole:'trial',tenants:[{org:installed.org,epoch:installed.epoch}],salesOrg:installed.org};
 capture=await captureInstalledAssemblyRecovery({ownerUrl:input.database.url,target,generation:installed.generation,captureFile:join(root,'capture.json'),quoteWorkloads:Object.values(quoteRoles.files)});
 await writeFile(join(root,'capture-ready.json'),JSON.stringify({sha256:capture.sha256}),{mode:0o600,flag:'wx'});
 stage='optional-quote-approved-capture';const nextCheckpoint=await waitEither(['quote-capture.request','restore.request']);
 if(nextCheckpoint==='quote-capture.request'){
  const request=JSON.parse(await readFile(join(root,'quote-capture.request'),'utf8'));assert.deepEqual(Object.keys(request).sort(),['planId','planHash','updateActionId','messageActionId'].sort());for(const key of ['planId','updateActionId','messageActionId'])assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(request[key]));assert(/^[a-f0-9]{64}$/.test(request.planHash));assert(new Set([request.planId,request.updateActionId,request.messageActionId]).size===3);
  const saved=(await installed.owner.query("SELECT * FROM ll_quote_plans WHERE org_id='local-proof' AND id=$1",[request.planId])).rows;assert.equal(saved.length,1);const plan=saved[0];assert.equal(plan.plan_hash,request.planHash);assert.equal(plan.quote_action_id,request.updateActionId);assert.equal(plan.message_action_id,request.messageActionId);assert.equal(plan.recovery_epoch,installed.epoch);assert.equal(plan.plan.quote.sourceVersion,'v3');assert.equal(plan.plan.discountBps,1400);assert.equal(plan.plan.approver,installed.accounts[1].email);
  const actions=(await installed.owner.query("SELECT id,payload_hash,state,approved_by,approval_until,lease_token FROM ll_connector_actions WHERE org_id='local-proof' AND id=ANY($1::uuid[]) ORDER BY id",[[request.updateActionId,request.messageActionId]])).rows;assert.equal(actions.length,2);const quote=actions.find(a=>a.id===request.updateActionId),mail=actions.find(a=>a.id===request.messageActionId);assert(quote.state==='ready'&&quote.approved_by===installed.accounts[1].email&&quote.approval_until&&quote.lease_token===null);assert(mail.state==='held'&&mail.approved_by===null&&mail.approval_until===null&&mail.lease_token===null);
  quoteCapture=await captureInstalledAssemblyRecovery({ownerUrl:input.database.url,target,generation:installed.generation,captureFile:join(root,'quote-capture.json'),quoteWorkloads:Object.values(quoteRoles.files)});
  await writeFile(join(root,'quote-approved-reference.json'),JSON.stringify({planId:request.planId,planHash:request.planHash,plan,actions,reservations:(await installed.owner.query("SELECT id,reserved FROM ll_agents WHERE org_id='local-proof' ORDER BY id")).rows}),{mode:0o600,flag:'wx'});
  await writeFile(join(root,'quote-capture-ready.json'),JSON.stringify({sha256:quoteCapture.sha256}),{mode:0o600,flag:'wx'});
 }
 stage='restore';await waitFor('restore.request');const restore=JSON.parse(await readFile(join(root,'restore.request'),'utf8'));assert.deepEqual(Object.keys(restore).sort(),['restoredSchemaOid','nextEpoch'].sort());assert(/^[0-9a-f-]{36}$/.test(restore.nextEpoch));assert.notEqual(restore.nextEpoch,installed.epoch);
 const repaired=await recoverInstalledAssemblyRuntime({owner:installed.owner,ownerUrl:input.database.url,target:{...target,tenants:[{org:installed.org,epoch:restore.nextEpoch}]},originalDirectory:installed.generation,identityFile:join(root,'capture.json'),identitySha256:capture.sha256,archiveFile:join(root,'approved.archive'),restoredSchemaOid:restore.restoredSchemaOid,ownerOutput:join(root,'recovered-owner'),runtimeOutput:join(root,'recovered-runtime'),settings});
 await writeFile(join(root,'recovery-ready.json'),JSON.stringify({...repaired,previousEpoch:installed.epoch,newEpoch:restore.nextEpoch,revivedAuthority:false}),{mode:0o600,flag:'wx'});
 stage='optional-quote-approved-restore';const endCheckpoint=await waitEither(['quote-restore.request','retire.request']);
 if(endCheckpoint==='quote-restore.request'){
  assert(quoteCapture,'Second restore requires separately captured exact quote approval');const second=JSON.parse(await readFile(join(root,'quote-restore.request'),'utf8'));assert.deepEqual(Object.keys(second).sort(),['restoredSchemaOid','nextEpoch'].sort());assert(/^[0-9a-f-]{36}$/.test(second.nextEpoch));assert(second.nextEpoch!==installed.epoch&&second.nextEpoch!==restore.nextEpoch);assert(second.restoredSchemaOid!==restore.restoredSchemaOid);
  const repairedQuote=await recoverInstalledAssemblyRuntime({owner:installed.owner,ownerUrl:input.database.url,target:{...target,tenants:[{org:installed.org,epoch:second.nextEpoch}]},originalDirectory:installed.generation,identityFile:join(root,'quote-capture.json'),identitySha256:quoteCapture.sha256,archiveFile:join(root,'quote-approved.archive'),restoredSchemaOid:second.restoredSchemaOid,ownerOutput:join(root,'quote-recovered-owner'),runtimeOutput:join(root,'quote-recovered-runtime'),settings});
  await writeFile(join(root,'quote-recovery-ready.json'),JSON.stringify({...repairedQuote,previousEpoch:restore.nextEpoch,newEpoch:second.nextEpoch,revivedAuthority:false,fullInstalledAcceptance:false}),{mode:0o600,flag:'wx'});
  stage='explicit-successor-administrator-checkpoint';const next=await waitEither(['quote-successor-onboard.request','retire.request']);
  if(next==='quote-successor-onboard.request'){
   const request=JSON.parse(await readFile(join(root,'quote-successor-onboard.request'),'utf8'));assert.equal(request.recoveryEpoch,second.nextEpoch);assert.equal(request.archiveSha256,repairedQuote.archiveSha256);assert(repairedQuote.quoteFiles.workerFile&&repairedQuote.quoteFiles.schedulerFile);
   const providerOwner=new Pool(await scopedPoolOptions({url:input.database.url,schema:quoteProvider.schema,purpose:'installer',transport:input.database.transport}));try{assert.equal((await providerOwner.query('SELECT oid::text oid FROM pg_namespace WHERE nspname=$1',[quoteProvider.schema])).rows[0].oid,quoteProvider.schemaOid);
    const successor=await onboardInstalledQuoteSuccessor({owner:installed.owner,providerOwner,request,publication:{owner:installed.owner,webFile:repairedQuote.files.webFile,quoteFiles:{workerFile:repairedQuote.quoteFiles.workerFile,schedulerFile:repairedQuote.quoteFiles.schedulerFile},provider:quoteProvider,buildId:quote.buildId,temporal:settings.temporal,taskQueue:settings.taskQueue+'-quote-successor'},output:join(root,'quote-successor')});
    await writeFile(join(root,'quote-successor-ready.json'),JSON.stringify({...successor,recoveredFiles:repairedQuote.files,recoveredQuoteFiles:repairedQuote.quoteFiles,administrativeFixtureOnboarding:true,selfServiceOnboardingProved:false}),{mode:0o600,flag:'wx'});
   }finally{await providerOwner.end();}
  }

 }
 stage='retire';await waitFor('retire.request');
 // Role/schema cleanup must be owned by the producer's independent pre/post
 // inventory observer after restore; original installer correctly rejects new OID.
 await quoteProvider.close();quoteProvider=undefined;await installed.owner.end();installed=undefined;quoteRoles=undefined;
 await writeFile(join(root,'owner-stopped.json'),JSON.stringify({ownerStopped:true,releaseAccepted:false}),{mode:0o600,flag:'wx'});
}catch(error){
 const privateSecrets=[];const collect=value=>{if(typeof value==='string'&&value.length>8)privateSecrets.push(value);else if(value&&typeof value==='object')for(const v of Object.values(value))collect(v);};collect(input);collect(installed?.accounts);
 await writeFile(join(root,'lifecycle-private-failure.json'),JSON.stringify({stage,cause:quotePrivateCause(error,privateSecrets),releaseAccepted:false}),{mode:0o600}).catch(()=>{});
 await writeFile(join(root,'lifecycle-failure.json'),JSON.stringify({stage,releaseAccepted:false}),{mode:0o600}).catch(()=>{});
 throw Error('Installed assembled lifecycle refused; inspect sanitized stage only.');
}finally{const failures=[];for(const [purpose,close]of [['provider',()=>quoteProvider?.close()],['quote-roles',()=>quoteRoles?.close()],['installed-owner',()=>installed?.close()]]){try{await close();}catch(error){failures.push({purpose,cause:quotePrivateCause(error)});}}if(failures.length){await writeFile(join(root,'lifecycle-private-cleanup-failure.json'),JSON.stringify({stage,failures,releaseAccepted:false}),{mode:0o600}).catch(()=>{});throw Error('Installed lifecycle cleanup incomplete; inspect private sanitized diagnostics.');}}
