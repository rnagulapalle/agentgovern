// Source-owned diagnostic journey on the retained assembly; no new state engine.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {request} from 'node:https';
import {installedQuoteBrowserController} from './staging-installed-host-coordinator.mjs';
import {typedQuoteBrowserProof,assertQuoteProviderObservation} from './typed-quote-browser-proof.mjs';
import {browserTLSBridge,browserOrigin} from './staging-browser-tls.mjs';
import {readOwnedPrivateFile} from '../lib/workspace/owned-private-file.ts';

// This read-only reference is for the existing native GET readiness probe. It is
// never passed to an approval/dispatch API or treated as execution authority.
export function persistentApprovedQuoteReference(observation,run,ready){
 const saved=run.saved;assert(saved&&saved.id===run.planId&&saved.planHash===run.planHash);
 assert.equal(observation.quoteEffects.length,0);assert.equal(Object.keys(observation.mailEffects).length,0);
 const plans=observation.workspaceEvidence.quotePlans.filter(p=>p.id===saved.id);assert.equal(plans.length,1);const plan=plans[0];
 assert.equal(plan.plan_hash,saved.planHash);assert.deepEqual(plan.plan,saved.plan);assert.equal(plan.recovery_epoch,ready.epoch);
 assert.equal(plan.quote_action_id,saved.plan.update.actionId);assert.equal(plan.message_action_id,saved.plan.message.actionId);
 const actions=observation.workspaceEvidence.quoteActions.filter(a=>[plan.quote_action_id,plan.message_action_id].includes(a.id));assert.equal(actions.length,2);
 const quote=actions.find(a=>a.id===plan.quote_action_id),mail=actions.find(a=>a.id===plan.message_action_id);
 assert.equal(quote.state,'ready');assert.equal(quote.approved_by,ready.memberEmails[1]);assert(quote.approval_until&&Date.parse(quote.approval_until)>Date.now());assert.equal(quote.lease_token,null);
 assert.equal(mail.state,'held');assert.equal(mail.approved_by,null);assert.equal(mail.approval_until,null);assert.equal(mail.lease_token,null);
 return {planId:saved.id,planHash:saved.planHash,plan,actions};
}

export async function persistentTypedQuoteJourney(ctx){
 const {root,evidence,ready,project,images,database,uid,gid,docker,compose,container,sourceFreezeSha256}=ctx;
 assert(/^ll-platform-[a-f0-9]{12}$/.test(project));assert.equal(ready.sourceFreezeSha256,sourceFreezeSha256);assert.equal(ready.offlineOwnerRequiredForRuntime,false);
 assert.deepEqual(ready.memberEmails,['requester@synthetic.example','reviewer@synthetic.example']);
 const trial=join(evidence,'typed-quote');await mkdir(trial,{mode:0o700});
 await writeFile(join(trial,'accounts.json'),JSON.stringify({accounts:[{email:ready.memberEmails[0],password:'synthetic-local-password-one'},{email:ready.memberEmails[1],password:'synthetic-local-password-two'}]}),{mode:0o600,flag:'wx'});
 await writeFile(join(trial,'quote-publications.json'),JSON.stringify(ready.quotePublications),{mode:0o600,flag:'wx'});
 const runController=(suffix,args)=>docker('run','--rm','--name',project+'-'+suffix,'--label','looplabs.assembly.owner='+project,'--network',project+'_application','--user',uid+':'+gid,'--memory','512m','--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges','--mount','type=bind,src='+root+',dst='+root,'--mount','type=bind,src='+dirname(database.caFile)+',dst='+dirname(database.caFile)+',readonly','--env','LOOPLABS_STAGING_PLATFORM_PROOF=isolated','--env','LOOPLABS_RETAINED_INSTALLATION=explicit-offline','--env','LOOPLABS_EXPECTED_SOURCE_FREEZE_SHA256='+sourceFreezeSha256,'--env','LOOPLABS_INSTALLED_ASSEMBLY_DIRECTORY='+root,'--entrypoint','node',images.provisioner,'--import','tsx',...args);
 const runObserver=()=>runController('quote-observe',['scripts/staging-installed-observer.mjs']);
 const runNativePolicyReady=()=>runController('quote-policy-ready',['scripts/staging-native-policy-ready.mjs',ready.quotePublications.webExecutionFile,join(root,'quote-approved-reference.json')]);
 const baseControl=installedQuoteBrowserController({root,trial,ready,compose,runObserver,runNativePolicyReady,docker,container});
 const controller=async(operation,detail)=>{
  const result=await baseControl(operation,detail);
  if(operation==='observe'&&detail.phase==='approved'){
   const observation=JSON.parse(await readFile(join(root,'quote-provider-observation.json'),'utf8')),run=JSON.parse(await readFile(join(trial,'quote-browser-run.json'),'utf8'));
   await writeFile(join(root,'quote-approved-reference.json'),JSON.stringify(persistentApprovedQuoteReference(observation,run,ready)),{mode:0o600,flag:'wx'});
  }
  return result;
 };
 const observed=await typedQuoteBrowserProof(trial,{controller});
 return {trial,observed,controller};
}

export async function persistentTypedQuoteReadback(journey){
 const {trial,observed,controller}=journey,privateSessions=await readOwnedPrivateFile(join(trial,'quote-browser-private-session-reference.json'),65536),sessions=JSON.parse(privateSessions.bytes.toString('utf8'));
 const tlsDir=join(trial,'quote-browser-tls'),credentials={key:await readFile(join(tlsDir,'server.key')),cert:await readFile(join(tlsDir,'server.pem')),ca:await readFile(join(tlsDir,'ca.pem'))},bridge=browserTLSBridge(credentials);
 await new Promise((resolve,reject)=>{bridge.once('error',reject);bridge.listen(3443,'127.0.0.1',resolve);});
 try{
  const path='/api/workspace/quotes/verification?'+new URLSearchParams({scope:observed.scopeId,id:observed.planId,planHash:observed.planHash});
  const current=await new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port:3443,servername:'looplabs-staging.example.test',ca:credentials.ca,rejectUnauthorized:true,method:'GET',path,headers:{Host:new URL(browserOrigin).host,Cookie:sessions.owner},timeout:15000},res=>{let size=0;const parts=[];res.on('data',b=>{size+=b.length;if(size>1048576)req.destroy(Error('Bounded verification response exceeded'));else parts.push(b);});res.on('end',()=>{try{assert.equal(res.statusCode,200);resolve(JSON.parse(Buffer.concat(parts).toString('utf8')));}catch(e){reject(e);}});res.on('error',reject);});req.on('timeout',()=>req.destroy(Error('Verified readback timed out')));req.on('error',reject);req.end();});
  assert.equal(current.current.outcome,'verified');assert.deepEqual(current.historical,observed.verificationReceipt);await privateSessions.assertStable();
  await controller('observe',{phase:'reloaded',planId:observed.planId,planHash:observed.planHash,updateActionId:observed.updateActionId,messageActionId:observed.messageActionId,scopeId:observed.scopeId});
  const run=JSON.parse(await readFile(join(trial,'quote-browser-run.json'),'utf8')),provider=JSON.parse(await readFile(join(trial,'quote-provider-observation.json'),'utf8'));assertQuoteProviderObservation(provider,run.saved,'reloaded');
  const result={scope:'same retained typed quote readback after all twelve runtimes restarted',planId:observed.planId,sameHistoricalReceipt:true,currentVerified:true,quoteEffectCount:provider.quoteEffects.length,emailEffectCount:Object.keys(provider.mailEffects).length,verifiedTls:true,releaseAccepted:false,production:false};
  await writeFile(join(trial,'post-runtime-restart.json'),JSON.stringify(result),{mode:0o600,flag:'wx'});return result;
 }finally{bridge.closeAllConnections();await new Promise(resolve=>bridge.close(resolve));}
}
export async function cleanupPersistentTypedQuoteInputs(evidence){assert.equal(resolve(evidence),evidence);const trial=join(evidence,'typed-quote');for(const file of ['accounts.json','quote-browser-private-session-reference.json','quote-browser-tls/ca.key','quote-browser-tls/server.key'])await rm(join(trial,file),{force:true});}
