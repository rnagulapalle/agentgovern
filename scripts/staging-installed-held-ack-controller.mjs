// Native restricted named-member API/SQL observer for the additional held ACK.
// No owner credentials, approvals, provider writes or user-selected URL.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
import {readPendingPackageState} from './staging-package-pending.mjs';
export async function installedHeldAckController2(mode){
 assert(['prepare','compare'].includes(mode));const dir='/run/trial',base='http://web:3000',origin=process.env.LOOPLABS_TRIAL_ORIGIN;assert(['https://looplabs-staging.example.test','https://looplabs-staging.example.test:3443'].includes(origin));
 const {bootstrapTenantContext}=await import('../lib/workspace/tenant-bootstrap.ts');const installed=await bootstrapTenantContext(process.env.LOOPLABS_TENANT_WEB_CONFIG,false);try{
 const accounts=JSON.parse(await readFile(dir+'/accounts.json','utf8')).accounts;assert(accounts.length===2&&accounts[0].email!==accounts[1].email);const env=parseEnv(await readFile(dir+'/worker.env','utf8'));
 const request=async(cookie,path,data,expected=200)=>{const r=await fetch(base+path,{headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{method:'POST',body:JSON.stringify(data)}:{})});assert.equal(r.status,expected,'Held ACK HTTP boundary refused');return r;};
 const json=async(cookie,path,data,expected)=>(await request(cookie,path,data,expected)).json();let reference;
 if(mode==='prepare'){
 const login=await request('','/api/workspace/session',{email:accounts[0].email,password:accounts[0].password});const cookies=login.headers.getSetCookie();assert(cookies.some(c=>c.includes('Secure')&&c.includes('HttpOnly')&&c.includes('SameSite=strict')));const owner=cookies.map(c=>c.split(';')[0]).join('; ');const scope=randomUUID(),suffix=randomUUID();const candidates=(await json(owner,'/api/workspace/records')).candidates;assert.equal(candidates.length,1);
 await json(owner,'/api/workspace/records',{operation:'enroll',id:scope,recordKey:candidates[0].key});const agents={crm:'package-crm-'+suffix,email:'package-email-'+suffix};for(const [connector,id]of Object.entries(agents)){await json(owner,'/api/workspace/agents',{id,name:id,owner:accounts[0].email,role:connector+'_agent',connector:connector+'_twin',actionLimit:4});await json(owner,'/api/workspace/records',{operation:'grant',scopeId:scope,agentId:id});}
 const id=randomUUID(),path='/api/workspace/enquiries?scope='+scope;const plan=(await json(owner,path,{operation:'prepare',id,fixtureId:'service'})).saved;assert.equal(plan.id,id);assert.equal((await json(owner,path,{operation:'submit',id,planHash:plan.plan_hash,crmAgent:agents.crm,emailAgent:agents.email})).runId,id);
 const run=await json(owner,'/api/durable/workflows?run='+id);assert.equal(run.steps.length,2);assert(run.steps.every(step=>step.state==='held'));await json(owner,'/api/durable/connectors',{operation:'approve',actionId:run.steps[0].action_id,payloadHash:run.steps[0].payload_hash},403);
 reference={owner,id,steps:run.steps.map(step=>({action_id:step.action_id,payload_hash:step.payload_hash}))};await writeFile(dir+'/package-held-ack-reference.json',JSON.stringify(reference),{mode:0o600,flag:'wx'});
 }else reference=JSON.parse(await readFile(dir+'/package-held-ack-reference.json','utf8'));
 const session=reference.owner.split('; ').filter(c=>c.startsWith('looplabs_workspace_session='));assert.equal(session.length,1);const member=await installed.context.member(session[0].slice('looplabs_workspace_session='.length));assert.equal(member.actor.subject,accounts[0].email);await json(reference.owner,'/api/workspace/session');
 // Actual scheduler has to establish the pinned workflow before the snapshot.
 let snapshot;const deadline=Date.now()+120000;for(;;){try{snapshot=await readPendingPackageState(member.db,reference,env.LOOPLABS_TEMPORAL_RECORD_BUILD_ID);break;}catch(error){if(mode==='compare'||Date.now()>=deadline)throw error;await new Promise(r=>setTimeout(r,250));}}
 if(mode==='prepare')await writeFile(dir+'/package-held-ack-baseline.json',JSON.stringify(snapshot),{mode:0o600,flag:'wx'});else assert.deepEqual(snapshot,JSON.parse(await readFile(dir+'/package-held-ack-baseline.json','utf8')),'Held ACK authority changed across package replacement');
 return {contract:'native-held-ack-observation-2',planId:reference.id,actions:reference.steps,pendingSnapshot:snapshot,namedSessionValid:true,approvalIssued:false,fullInstalledAcceptance:false,productionChanged:false};
 }finally{await installed.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))try{assert.equal(process.argv.length,3);console.log(JSON.stringify(await installedHeldAckController2(process.argv[2])));}catch{console.error('Additional held ACK preparation or authority comparison refused; no credentials or payloads printed.');process.exitCode=1;}
