// Independent offline installed quote archive and named HTTP containment observer.
// It never approves, publishes execution metadata, dispatches or resets providers.
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {writeFile} from 'node:fs/promises';
import pg from 'pg';
import {scopedPoolOptions} from '../lib/durable/pg-transport.ts';
import {readOwnedPrivateFile} from '../lib/workspace/owned-private-file.ts';
import {assertQuoteRestoreSnapshot} from './staging-quote-restore-assertions.mjs';
import {quotePrivateCause} from './typed-quote-browser-proof.mjs';
const phase=process.argv[2];assert(['restored','after'].includes(phase));
const root=process.env.LOOPLABS_INSTALLED_ASSEMBLY_DIRECTORY;
assert(root?.startsWith('/')&&process.env.LOOPLABS_STAGING_PLATFORM_PROOF==='isolated');
let checkpoint='inputs';const secrets=[];
const read=async(path,max=1048576)=>{const f=await readOwnedPrivateFile(path,max);const value=JSON.parse(f.bytes.toString('utf8'));await f.assertStable();return value;};
const collect=value=>{if(typeof value==='string'&&value.length>8)secrets.push(value);else if(value&&typeof value==='object')for(const v of Object.values(value))collect(v);};
async function main(){
 assert(process.env.LOOPLABS_STAGING_CONTROLLER_OWNER_FILE,'Exact offline installed restore owner file required');
 const target=await read(process.env.LOOPLABS_STAGING_CONTROLLER_OWNER_FILE,16384),reference=await read(join(root,'quote-approved-reference.json')),sessions=await read('/run/trial/quote-browser-private-session-reference.json',16384),accounts=(await read('/run/trial/accounts.json',16384)).accounts;collect(target);collect(sessions);collect(accounts);
 assert.deepEqual(Object.keys(target).sort(),['url','schema','transport'].sort());const u=new URL(target.url);assert(u.hostname==='trial-db'&&u.port==='5432'&&u.pathname==='/trial'&&u.username==='trial'&&!u.search&&!u.hash);assert(/^gateway_[a-f0-9]{16}$/.test(target.schema)&&target.transport.mode==='verified-tls');
 const db=new pg.Pool(await scopedPoolOptions({...target,purpose:'installer'}));
 try{
  checkpoint='immutable-plan';const plans=(await db.query("SELECT * FROM ll_quote_plans WHERE org_id='local-proof' AND id=$1",[reference.planId])).rows;assert.equal(plans.length,1);const plan=plans[0];
  const readActions=async()=> (await db.query("SELECT id,payload_hash,state,approved_by,approval_until,lease_token FROM ll_connector_actions WHERE org_id='local-proof' AND id=ANY($1::uuid[]) ORDER BY id",[reference.actions.map(a=>a.id)])).rows;const actions=await readActions();
  checkpoint='exact-source-approval-and-reservations';assertQuoteRestoreSnapshot({plan,actions,reservations:(await db.query("SELECT id,reserved FROM ll_agents WHERE org_id='local-proof' ORDER BY id")).rows,epoch:(await db.query("SELECT epoch FROM ll_workspace_recovery WHERE org_id='local-proof'")).rows[0].epoch},reference,phase);
  if(phase==='restored'){
   checkpoint='exact-approved-archive';assert.deepEqual(JSON.parse(JSON.stringify(actions)),reference.actions);assert.equal(plan.recovery_epoch,reference.plan.recovery_epoch);assert.equal((await db.query("SELECT epoch FROM ll_workspace_recovery WHERE org_id='local-proof'")).rows[0].epoch,reference.plan.recovery_epoch);assert((await db.query('SELECT count(*)::int n FROM ll_sessions')).rows[0].n>=2);
  }else{
   checkpoint='stale-approval-quarantined';assert(actions.every(a=>a.state==='uncertain'&&a.approved_by===null&&a.approval_until===null&&a.lease_token===null));assert.equal((await db.query('SELECT count(*)::int n FROM ll_workspace_recovery_events')).rows[0].n,1);assert.notEqual((await db.query("SELECT epoch FROM ll_workspace_recovery WHERE org_id='local-proof'")).rows[0].epoch,reference.plan.recovery_epoch);
   for(const table of ['ll_tokens','ll_members','ll_connector_scopes','ll_connector_scope_grants'])assert.equal((await db.query('SELECT count(*)::int n FROM '+table+' WHERE active')).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int n FROM ll_sessions')).rows[0].n,0);
   checkpoint='named-http-refusal';const origin=process.env.LOOPLABS_TRIAL_ORIGIN;assert(['https://looplabs-staging.example.test','https://looplabs-staging.example.test:3443'].includes(origin));const request=async(cookie,path,body)=>{const res=await fetch('http://web:3000'+path,{headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});assert.equal(res.status,401);await res.arrayBuffer();};
   for(const cookie of [sessions.owner,sessions.reviewer]){assert(/^looplabs_workspace_session=[^;\s]+$/.test(cookie));await request(cookie,'/api/workspace/session');await request(cookie,'/api/workspace/quotes?scope='+reference.plan.plan.authority.scopeId,{operation:'advance',id:reference.planId,planHash:reference.planHash,step:'update'});await request(cookie,'/api/workspace/quotes?scope='+reference.plan.plan.authority.scopeId,{operation:'review',id:reference.planId,planHash:reference.planHash,step:'update',payloadHash:reference.actions.find(a=>a.id===reference.plan.quote_action_id).payload_hash,approve:true});}
   for(const account of accounts)await request('', '/api/workspace/session',{email:account.email,password:account.password});
   checkpoint='refused-requests-no-state-change';assert.deepEqual(await readActions(),actions);
  }
  console.log(JSON.stringify({passed:true,phase,exactArchivedSourceVersion:'v3',automaticAuthorityRevival:false,staleIndependentApprovalRejected:true,scope:'actual restored immutable quote and named HTTP authority containment only'}));
 }finally{await db.end();}
}
main().catch(async error=>{await writeFile(join(root,'quote-restore-private-failure.json'),JSON.stringify({phase,checkpoint,cause:quotePrivateCause(error,secrets)}),{mode:0o600}).catch(()=>{});console.error('Installed quote restore containment refused; inspect private sanitized diagnostics.');process.exitCode=1;});
