/** Explicit offline administrator operation after containment. Creates fresh
 * identities/grants/publications, never reactivates restored named authority.
 * Uses existing installed context, invited-member provisioning SQL, login,
 * QuoteAuthorityControl and execution publication APIs. No plan or approval. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {join} from 'node:path';
import {lstat,realpath,writeFile,mkdir} from 'node:fs/promises';
import type {Pool} from 'pg';
import {passwordHash} from '../lib/workspace/auth';
import {bootstrapTenantContext} from '../lib/workspace/tenant-bootstrap';
import {quotePrivateCause} from './typed-quote-browser-proof.mjs';
import {publishAssembledQuoteExecution} from './staging-installed-quote-publication';
type Publish=Parameters<typeof publishAssembledQuoteExecution>[0];
export function successorAdministrationRequest(value:unknown){
 assert(value&&typeof value==='object'&&!Array.isArray(value));const v=value as Record<string,unknown>;
 assert.deepEqual(Object.keys(v).sort(),['acknowledgement','archiveSha256','recoveryEpoch'].sort());assert.equal(v.acknowledgement,'INVITE_NEW_MEMBERS_AND_REVIEW_NEW_SCOPE_AFTER_CONTAINMENT');assert(typeof v.archiveSha256==='string'&&/^[a-f0-9]{64}$/.test(v.archiveSha256));assert(typeof v.recoveryEpoch==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v.recoveryEpoch));return v as {acknowledgement:string;archiveSha256:string;recoveryEpoch:string};
}
export async function onboardInstalledQuoteSuccessor(input:{owner:Pool;providerOwner:Pool;request:unknown;publication:Omit<Publish,'named'|'review'>;output:string}){
 const request=successorAdministrationRequest(input.request);assert.equal(input.publication.owner,input.owner);assert(input.output.startsWith('/')&&!input.output.includes('..'));const parent=input.output.slice(0,input.output.lastIndexOf('/'));const parentStat=await lstat(parent);assert(parentStat.isDirectory()&&!parentStat.isSymbolicLink()&&parentStat.uid===process.getuid!()&&(parentStat.mode&0o7777)===0o700&&await realpath(parent)===parent,'Owned private operation parent required');
 // Existing operation paths are never adopted or silently retried. A partial
 // operation retains a precise administrator-owned record for explicit repair;
 // no provider rollback/downgrade or old identity activation is attempted.
 await mkdir(input.output,{mode:0o700});const operationFile=join(input.output,'operation.json');let stage='preconditions';const operation={contract:'installed-successor-administration-1',request,status:'in-progress',administrativeFixtureOnboarding:true,selfServiceOnboardingProved:false};await writeFile(operationFile,JSON.stringify({...operation,stage}),{mode:0o600,flag:'wx'});
 try{
 const recorded=(await input.owner.query("SELECT r.epoch,e.backup_hash FROM ll_workspace_recovery r JOIN ll_workspace_recovery_events e ON e.org_id=r.org_id AND e.epoch=r.epoch WHERE r.org_id='local-proof'")).rows;assert.deepEqual(recorded,[{epoch:request.recoveryEpoch,backup_hash:request.archiveSha256}]);
 for(const table of ['ll_members','ll_tokens','ll_agents','ll_connector_scopes','ll_connector_scope_grants'])assert.equal((await input.owner.query('SELECT count(*)::int n FROM '+table+' WHERE active')).rows[0].n,0,'Existing authority must remain contained before new onboarding');
 assert.equal((await input.owner.query('SELECT count(*)::int n FROM ll_sessions')).rows[0].n,0);
 // A destination has one stable scope ID by the existing UNIQUE(org,binding)
 // contract. Explicit current-version review creates a successor scope version;
 // it never re-enrolls another ID for the same binding or revives old grants.
 const destinations=(await input.owner.query("SELECT id,version,active FROM ll_connector_scopes WHERE org_id='local-proof' AND binding_id=$1 AND email_binding_id=$2",[input.publication.provider.scope.quoteBinding,input.publication.provider.scope.emailBinding])).rows;assert.equal(destinations.length,1);assert.equal(destinations[0].active,false);assert(Number.isInteger(destinations[0].version)&&destinations[0].version>1);const destinationReview={scopeId:destinations[0].id,expectedVersion:destinations[0].version};
 const policies=(await input.owner.query("SELECT connector,version,active FROM ll_connector_policies WHERE org_id='local-proof' AND connector=ANY($1::text[]) ORDER BY connector",[['quote','email']])).rows;assert.deepEqual(policies,[{connector:'email',version:4,active:false},{connector:'quote',version:4,active:false}]);
 const providerBefore=(await input.providerOwner.query("SELECT version::text,result FROM native_quotes WHERE workspace_id='local-proof' AND quote_id='quote-42'")).rows;assert.equal(providerBefore.length,1);assert.equal(providerBefore[0].version,'4');
 const providerPolicy=(await input.providerOwner.query("SELECT policy FROM native_quote_policies WHERE workspace_id='local-proof' AND quote_id='quote-42'")).rows;assert.equal(providerPolicy.length,1);assert.deepEqual(providerPolicy[0].policy,{version:3,delegatedBps:1000,hardCapBps:2000,active:true});
 // Deliberate current-policy review advances version; provider effects/result
 // are preserved. This is an owner operation, never an automatic restore step.
 stage='native-policy-review';const updated=await input.providerOwner.query("UPDATE native_quote_policies SET policy=$1 WHERE workspace_id='local-proof' AND quote_id='quote-42' AND policy=$2::jsonb",[{...providerPolicy[0].policy,version:4},providerPolicy[0].policy]);assert.equal(updated.rowCount,1);
 const accounts=[{email:'successor-requester@example.test',name:'Successor requester',password:randomBytes(32).toString('base64url')},{email:'successor-reviewer@example.test',name:'Successor reviewer',password:randomBytes(32).toString('base64url')}];
 stage='new-invitations-and-current-policy';const c=await input.owner.connect();try{await c.query('BEGIN');for(const a of accounts)await c.query("INSERT INTO ll_members(email,org_id,name,password_hash)VALUES($1,'local-proof',$2,$3)",[a.email,a.name,passwordHash(a.password)]);const reviewed=await c.query("UPDATE ll_connector_policies SET active=true WHERE org_id='local-proof' AND connector=ANY($1::text[]) AND version=4 AND active=false",[['quote','email']]);assert.equal(reviewed.rowCount,2);await c.query('COMMIT');}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
 // Authenticate via the current recovered broker/web generation. No fabricated
 // actor/session or old credential reactivation is accepted for enrollment.
 stage='current-generation-login-and-publication';const loaded=await bootstrapTenantContext(input.publication.webFile,false);try{
  const requesterToken=await loaded.context.login({email:accounts[0].email,password:accounts[0].password}),reviewerToken=await loaded.context.login({email:accounts[1].email,password:accounts[1].password});assert.notEqual(requesterToken,reviewerToken);
  await writeFile(join(input.output,'accounts.json'),JSON.stringify({accounts}),{mode:0o600,flag:'wx'});
  const publication=await publishAssembledQuoteExecution({...input.publication,named:{requester:accounts[0].email,reviewer:accounts[1].email,requesterToken,reviewerToken},review:{policyVersion:4,agentIds:{quote:'successor-quote-agent',email:'successor-quote-message-agent'},destinationReview}},join(input.output,'publications'));
  assert.deepEqual((await input.providerOwner.query("SELECT version::text,result FROM native_quotes WHERE workspace_id='local-proof' AND quote_id='quote-42'")).rows,providerBefore);
  await writeFile(operationFile,JSON.stringify({...operation,status:'complete',stage:'new-scope-published',scopeId:publication.scopeId,approvalIssued:false,oldAuthorityReactivated:false}),{mode:0o600});
  return {publication,accountsFile:join(input.output,'accounts.json'),scope:'explicit administrator new scope and identities only',oldAuthorityReactivated:false as const,destinationScopeIdReused:true as const,newDestinationScopeVersionReviewed:true as const,oldMembersAndApprovalsReactivated:false as const,planCreated:false as const,approvalIssued:false as const,fullInstalledAcceptance:false as const};
 }finally{await loaded.close();}
 }catch(error){await writeFile(operationFile,JSON.stringify({...operation,status:'partial',stage,cause:quotePrivateCause(error),approvalIssued:false,oldAuthorityReactivated:false,repairRequired:true}),{mode:0o600});throw Error('Explicit successor administration incomplete; inspect owned partial operation record before repair.');}
}
