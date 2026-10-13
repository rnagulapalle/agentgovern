import {encodeRecoveryCapture,readRecoveryCapture,type RoleIdentity,type Capability,type SupplementalQuote,type RecoveryIdentity} from './recovery-capture';
import {parseTransport,scopedPoolOptions,type ExecutionContext,type PostgreSQLTransport} from '../durable/pg-transport';
import {grantQuoteWorkloadCapabilities,grantQuoteAdmissionCapabilities} from './quote-workload-installation';
import { webReadTables,sensitiveReadColumns } from './tenant-read-inventory';
import { constants } from 'node:fs';
// Private owner-only preparation library. Existing migration runners remain
// authoritative; a trusted verifier must establish reviewed source/ledger facts.
// This module never grants release eligibility, activates Next or enrolls tokens.
import { Pool,type PoolClient } from 'pg';
import { randomBytes,createHash } from 'node:crypto';
import { mkdir,lstat,realpath,writeFile,rm,open,unlink } from 'node:fs/promises';
import { resolve,dirname,join } from 'node:path';
import { bootstrapTenantContext,readTenantInstallation,parseTenantInstallation,parseWorkloadInstallation,readWorkloadInstallation,readOwnerWorkloadInventory } from './tenant-bootstrap';
import { registerTenantPool } from '../durable/tenant-pool';
import {readOwnedPrivateFile} from './owned-private-file';
const ident=/^[a-z][a-z0-9_]{0,40}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const helperNames=['ll_bound_workspace','ll_credential_workspace','ll_global_admit','ll_login_workspace','ll_named_subject_exists','ll_runtime_classification'];
const brokerFunctions=['ll_login_workspace(text)','ll_credential_workspace(text)','ll_global_admit(text,text)'];
type Target={transport?:PostgreSQLTransport;installation:string;schema:string;database:string;ownerRole:string;tenants:{org:string;epoch:string}[];salesOrg:string};
type Verify=(owner:Pool,target:Readonly<Target>)=>Promise<void>;
function shape(t:Target){if(!t||!ident.test(t.installation)||t.installation.length>20||!ident.test(t.schema)||!ident.test(t.database)||!ident.test(t.ownerRole)||!Array.isArray(t.tenants)||!t.tenants.length||t.tenants.length>20||new Set(t.tenants.map(x=>x.org)).size!==t.tenants.length||t.tenants.some(x=>!/^[-_a-zA-Z0-9]{1,64}$/.test(x.org)||!uuid.test(x.epoch))||!t.tenants.some(x=>x.org===t.salesOrg))throw Error('target');}
async function privateDirectory(dir:string){if(await realpath(dir)!==dir)throw Error('path');const s=await lstat(dir);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid!()||(s.mode&0o777)!==0o700)throw Error('path');return s;}
async function privateJson(file:string){if(await realpath(file)!==file)throw Error('private file');await privateDirectory(dirname(file));const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{const st=await handle.stat();if(!st.isFile()||st.nlink!==1||st.uid!==process.getuid!()||(st.mode&0o777)!==0o600||st.size>131072)throw Error('private file');return JSON.parse(await handle.readFile('utf8'));}finally{await handle.close();}}
async function facts(owner:Pool,t:Target){const f=(await owner.query('SELECT current_user role,current_database() database,(SELECT oid::text FROM pg_database WHERE datname=current_database()) database_oid,(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) super')).rows[0];if(!f||f.role!==t.ownerRole||f.database!==t.database||!f.super)throw Error('explicit owner target');for(const v of t.tenants){const x=(await owner.query(`SELECT r.epoch::text FROM ${t.schema}.ll_orgs o JOIN ${t.schema}.ll_workspace_recovery r ON r.org_id=o.id WHERE o.id=$1`,[v.org])).rows[0];if(!x||x.epoch!==v.epoch.toLowerCase())throw Error('epoch');}return f;}
async function grant(owner:Pick<Pool,'query'>,schema:string,role:string,purpose:'web'|'worker'|'scheduler'){
 await owner.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
 // Explicit current table discovery is validated by the trusted source/inventory
 // verifier. Protected maps, global budgets and private presence have no grants.
 const reads:Record<'worker'|'scheduler',string[]>={
  worker:['ll_orgs','ll_agents','ll_tokens','ll_workspace_recovery','ll_connector_actions','ll_connector_events','ll_connector_policies','ll_connector_scopes','ll_connector_scope_grants','ll_agent_profiles','ll_workflow_agents','ll_workflow_runs','ll_workflow_steps','ll_workflow_events','ll_enquiry_plans','ll_enquiry_dispatch','ll_enquiry_worker_status','ll_temporal_dispatch','ll_temporal_record_routes','ll_temporal_worker_builds','ll_quote_member_generations','ll_migrations'],
  scheduler:['ll_orgs','ll_tokens','ll_workspace_recovery','ll_enquiry_plans','ll_enquiry_dispatch','ll_temporal_dispatch','ll_temporal_record_routes','ll_temporal_worker_builds','ll_migrations']
 };
 const tables=(purpose==='web'?webReadTables:reads[purpose]).map(tablename=>({tablename}));
 for(const {tablename}of tables){if(!ident.test(tablename))throw Error('inventory');if(purpose==='web'&&Object.hasOwn(sensitiveReadColumns,tablename))continue;await owner.query(`GRANT SELECT ON ${schema}.${tablename} TO ${role}`);}
 // UPDATE(id) permits the existing per-workspace row lock; FORCE RLS prevents
 // replacing the bound org identity. Pollers cannot alter policy/pause fields.
 await owner.query(`GRANT UPDATE(id) ON ${schema}.ll_orgs TO ${role}`);
 if(purpose==='web'){
  // Existing append-only triggers require row locks; actual updates still fail.
  await owner.query(`GRANT UPDATE(id) ON ${schema}.ll_cloud_connections TO ${role}`);
  await owner.query(`GRANT UPDATE(id) ON ${schema}.ll_cloud_project_connections TO ${role}`);
  await owner.query(`GRANT INSERT(org_id,id,account_id,region,created_by) ON ${schema}.ll_cloud_connections TO ${role}`);
  await owner.query(`GRANT INSERT(org_id,connection_id,id,observed_at,completeness,failures,canonical_sha256) ON ${schema}.ll_cloud_scans TO ${role}`);
  await owner.query(`GRANT INSERT(org_id,connection_id,scan_id,resource_id,resource_arn,version,role_reference,workload_identity_reference) ON ${schema}.ll_cloud_runtime_observations TO ${role}`);
  await owner.query(`GRANT INSERT(org_id,id,provider,directory_id,endpoint,project_id,project_number,location,created_by) ON ${schema}.ll_cloud_project_connections TO ${role}`);
  await owner.query(`GRANT INSERT(org_id,connection_id,id,observed_at,completeness,failures,canonical_sha256) ON ${schema}.ll_cloud_project_scans TO ${role}`);
  await owner.query(`GRANT INSERT(org_id,connection_id,scan_id,resource,provider_version,identity_kind,identity_reference) ON ${schema}.ll_cloud_project_observations TO ${role}`);
  await owner.query(`GRANT INSERT(org_id,id,provider,connection_id,scan_id,scan_sha256,resource,provider_version,owner_email,reviewed_by) ON ${schema}.ll_cloud_owner_reviews TO ${role}`);
  // Existing scoped operator discount/refund consumers only. Pollers unchanged.
  await owner.query(`GRANT UPDATE(discount,version) ON ${schema}.ll_records TO ${role}`);
  await owner.query(`GRANT INSERT(org_id,action_id,before_discount,after_discount,after_version),UPDATE(recovered) ON ${schema}.ll_effects TO ${role}`);
  await owner.query(`GRANT UPDATE(active) ON ${schema}.ll_agents TO ${role}`);
  await owner.query(`GRANT UPDATE(auto_limit,policy_version) ON ${schema}.ll_orgs TO ${role}`);
  await owner.query(`GRANT INSERT(org_id,id,agent_id,payment_id,amount,currency,policy_version,payload_hash,state,reason) ON ${schema}.ll_refund_actions TO ${role}`);
  await owner.query(`GRANT UPDATE(state,reason,lease_token,lease_until,approved_by,approval_until,provider_id,provider_status) ON ${schema}.ll_refund_actions TO ${role}`);
  await owner.query(`GRANT UPDATE(reserved,auto_limit,version) ON ${schema}.ll_refund_policies TO ${role}`);
  await owner.query(`GRANT INSERT(org_id,action_id,kind,subject) ON ${schema}.ll_refund_events TO ${role}`);
  // Reviewed product-consumer writes only; neither poller receives these grants.
  await owner.query(`GRANT INSERT(org_id,id,contact_id,recipient,binding_id,contract_version,created_by) ON ${schema}.ll_connector_scopes TO ${role}`);
  // Proposal/enrollment only: quote execution and worker access stay ungranted.
  await owner.query(`GRANT INSERT(quote_id,distributor_id,email_binding_id,sender) ON ${schema}.ll_connector_scopes TO ${role}`);
  await owner.query(`GRANT INSERT(org_id,scope_id,member,policy_version,capability,created_by),UPDATE(active,version) ON ${schema}.ll_quote_manager_grants TO ${role}`);
  await owner.query(`GRANT INSERT(org_id,id,created_by,recovery_epoch,proposal,proposal_hash,plan,plan_hash,quote_action_id,message_action_id) ON ${schema}.ll_quote_plans TO ${role}`);
  await owner.query(`GRANT INSERT(org_id,scope_id,agent_id,created_by) ON ${schema}.ll_connector_scope_grants TO ${role}`);
  await owner.query(`GRANT INSERT(org_id,scope_id,agent_id,kind,subject) ON ${schema}.ll_connector_scope_events TO ${role}`);
  await owner.query(`GRANT UPDATE(active,version) ON ${schema}.ll_connector_policies TO ${role}`);
  await owner.query(`GRANT UPDATE(active,version) ON ${schema}.ll_connector_scopes,${schema}.ll_connector_scope_grants TO ${role}`);
  await owner.query(`GRANT INSERT(org_id,id,email,name,company,company_size,role,workflow) ON ${schema}.ll_sales_requests TO ${role}`);
  await owner.query(`GRANT INSERT(org_id,parent_id,successor_id,parent_hash,intent_hash,change_hash,lifecycle) ON ${schema}.ll_enquiry_revisions TO ${role}`);
  for(const [table,columns]of Object.entries(sensitiveReadColumns))await owner.query(`GRANT SELECT(${columns.join(',')}) ON ${schema}.${table} TO ${role}`);await owner.query(`GRANT INSERT,DELETE ON ${schema}.ll_sessions TO ${role}`);await owner.query(`GRANT SELECT,INSERT,UPDATE ON ${schema}.ll_tenant_access_attempts TO ${role}`);
  await owner.query(`GRANT INSERT,UPDATE,DELETE ON ${schema}.ll_actions TO ${role}`);
  await owner.query(`GRANT INSERT ON ${schema}.ll_tokens,${schema}.ll_connector_actions,${schema}.ll_agents,${schema}.ll_agent_profiles,${schema}.ll_enquiry_plans,${schema}.ll_enquiry_dispatch,${schema}.ll_workflow_agents,${schema}.ll_workflow_runs,${schema}.ll_workflow_steps,${schema}.ll_events,${schema}.ll_connector_events,${schema}.ll_workflow_events,${schema}.ll_temporal_dispatch,${schema}.ll_temporal_record_routes TO ${role}`);
  await owner.query(`GRANT UPDATE(reserved) ON ${schema}.ll_agents TO ${role}`);
  await owner.query(`GRANT UPDATE(run_id) ON ${schema}.ll_enquiry_plans TO ${role}`);
  await owner.query(`GRANT UPDATE(state) ON ${schema}.ll_workflow_runs TO ${role}`);
  await owner.query(`GRANT UPDATE(state,reason,lease_token,lease_until,evidence,approved_by,approval_until) ON ${schema}.ll_connector_actions TO ${role}`);
  await owner.query(`GRANT UPDATE(name) ON ${schema}.ll_members TO ${role}`);
 }else{
  await owner.query(`GRANT SELECT(email,org_id,name,active),UPDATE(name) ON ${schema}.ll_members TO ${role}`);
  if(purpose==='scheduler'){
   await owner.query(`GRANT UPDATE(lease_token,lease_until,attempts,next_attempt,state,started_at) ON ${schema}.ll_temporal_dispatch TO ${role}`);
  }else{
   await owner.query(`GRANT UPDATE(state,reason,lease_token,lease_until,evidence) ON ${schema}.ll_connector_actions TO ${role}`);
   await owner.query(`GRANT INSERT ON ${schema}.ll_connector_events,${schema}.ll_workflow_events TO ${role}`);
   await owner.query(`GRANT UPDATE(state) ON ${schema}.ll_workflow_runs TO ${role}`);
   await owner.query(`GRANT INSERT,UPDATE ON ${schema}.ll_enquiry_worker_status TO ${role}`);
  }
 }
 await owner.query(`GRANT EXECUTE ON FUNCTION ${schema}.ll_bound_workspace(),${schema}.ll_named_subject_exists(text),${schema}.ll_runtime_classification() TO ${role}`);
}
/** No CLI: verifier is mandatory trusted code, never an uploaded eligible JSON.
 * Passwords are generated, private, and absent from the returned evidence. */
export async function installTenantRoles(ownerUrl:string,target:Target,output:string,verify:Verify,publicationProbe?:()=>Promise<void>,execution:ExecutionContext={kind:'installed-runtime'}){
 let db:Pool|undefined,created=false,committed=false,uncertain=false;const roleNames:string[]=[];const priorOwners:Record<string,{owner:string;oid:string}>={};let ownedIdentity:{ino:number;dev:number}|undefined;let expectedOids:Record<string,string>={};
 try{
  shape(target);const transport=parseTransport(target.transport);if(typeof verify!=='function')throw Error('trusted verifier');const url=new URL(ownerUrl);if(!['postgres:','postgresql:'].includes(url.protocol)||!url.password||url.search||url.hash||decodeURIComponent(url.username)!==target.ownerRole||decodeURIComponent(url.pathname.slice(1))!==target.database)throw Error('owner');
  output=resolve(output);await privateDirectory(dirname(output));db=new Pool(await scopedPoolOptions({url:ownerUrl,schema:target.schema,purpose:'installer',transport},execution));const ownerFacts=await facts(db,target);await verify(db,Object.freeze({...target,tenants:target.tenants.map(x=>Object.freeze({...x}))}));
  try{await lstat(output);const c=await readTenantInstallation(join(output,'web.json'));if(JSON.stringify(c.transport)!==JSON.stringify(transport)||c.installation!==target.installation||c.schema!==target.schema||c.database!==target.database||c.salesOrg!==target.salesOrg||JSON.stringify(c.web.map(x=>({org:x.org,epoch:x.epoch})))!==JSON.stringify(target.tenants))throw Error('prior mismatch');const ready=await privateJson(join(output,'ready.json'));if(ready.installation!==target.installation||ready.databaseOid!==ownerFacts.database_oid)throw Error('prior identity');const running=await bootstrapTenantContext(join(output,'web.json'),false,false,undefined,execution);await running.close();const workloadRead=await readOwnerWorkloadInventory(join(output,'workloads.json'));const workloads=workloadRead.config;if(workloads.installation!==c.installation||workloads.schema!==c.schema||workloads.database!==c.database||JSON.stringify(workloads.transport)!==JSON.stringify(c.transport))throw Error('workload shape');parseTenantInstallation({...c,workloads:workloads.entries});await workloadRead.assertStable();const expectedRoles=[`llti_${target.installation}_broker`,`llti_${target.installation}_definer`,...target.tenants.flatMap((_,i)=>['web','worker','scheduler'].map(p=>`llti_${target.installation}_${p}_${i}`))].sort();if(!ready.roles||Object.keys(ready.roles).sort().join()!==expectedRoles.join())throw Error('role inventory');for(const role of expectedRoles){const r=(await db.query('SELECT oid::text FROM pg_roles WHERE rolname=$1',[role])).rows[0];if(!r||r.oid!==ready.roles[role])throw Error('role identity');}for(const entry of workloads.entries){const single=await readWorkloadInstallation(join(output,'runtime',entry.role,'workloads.json'));if(JSON.stringify(single.config)!==JSON.stringify({...workloads,entries:[entry]}))throw Error('Workload process generation mismatch');await single.assertStable();const pool=new Pool(await scopedPoolOptions({url:entry.url,schema:target.schema,purpose:entry.purpose,transport},execution));try{await registerTenantPool(pool,{...entry,schema:target.schema});}finally{await pool.end();}}return{scope:'private tenant role preparation only',reused:true,roles:ready.roles,activated:false};}catch(e){if((e as {code?:string}).code!=='ENOENT')throw e;}
  await mkdir(output,{mode:0o700});created=true;const d=await privateDirectory(output);ownedIdentity={ino:d.ino,dev:d.dev};
  await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='2s'");await db.query("SET LOCAL statement_timeout='10s'");await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`tenant-install:${target.schema}`]);
  const old=(await db.query(`SELECT p.proname,p.oid::text oid,r.rolname owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname=$1 AND p.proname=ANY($2::text[])`,[target.schema,brokerFunctions.map(x=>x.split('(')[0])])).rows;if(old.length!==3)throw Error('helper inventory');if(old.some(f=>/^llti_.*_definer$/.test(f.owner))||(await db.query(`SELECT 1 FROM ${target.schema}.ll_runtime_workspace_bindings WHERE login_name LIKE 'llti_%' LIMIT 1`)).rows.length)throw Error('Competing installation refused');for(const f of old)priorOwners[f.proname]={owner:f.owner,oid:f.oid};
  const base=`llti_${target.installation}`,broker=`${base}_broker`,definer=`${base}_definer`,brokerPassword=randomBytes(32).toString('base64url');
  roleNames.push(broker,definer,...target.tenants.flatMap((_,i)=>['web','worker','scheduler'].map(p=>`${base}_${p}_${i}`)));
  if((await db.query('SELECT 1 FROM pg_roles WHERE rolname=ANY($1::text[])',[roleNames])).rows.length)throw Error('existing roles not adopted');
  await db.query(`CREATE ROLE ${broker} LOGIN PASSWORD '${brokerPassword}' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await db.query(`CREATE ROLE ${definer} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS`);
  await grantBrokerSecurity(db,target.schema,broker,definer);
  const connection=(role:string,password:string)=>{const u=new URL(ownerUrl);u.username=role;u.password=password;return u.href;};const entries=[];
  for(const [i,v]of target.tenants.entries())for(const purpose of ['web','worker','scheduler']as const){const role=`${base}_${purpose}_${i}`,password=randomBytes(32).toString('base64url');await db.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);await grant(db,target.schema,role,purpose);await db.query(`INSERT INTO ${target.schema}.ll_runtime_workspace_bindings(login_oid,login_name,database_oid,database_name,org_id,purpose) SELECT oid,rolname,$2::oid,$3,$4,$5 FROM pg_roles WHERE rolname=$1`,[role,ownerFacts.database_oid,target.database,v.org,purpose]);entries.push({url:connection(role,password),role,org:v.org,epoch:v.epoch.toLowerCase(),purpose});}
  const helpers:Record<string,string>={};for(const f of (await db.query('SELECT p.proname,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.proname=ANY($2::text[])',[target.schema,helperNames])).rows)helpers[f.proname]=createHash('sha256').update(f.definition).digest('hex');
  expectedOids=Object.fromEntries((await db.query('SELECT rolname,oid::text FROM pg_roles WHERE rolname=ANY($1::text[])',[roleNames])).rows.map(x=>[x.rolname,x.oid]));
  const workloadConfig=parseWorkloadInstallation({version:1,installation:target.installation,schema:target.schema,database:target.database,transport,entries:entries.filter(x=>x.purpose!=='web')});const config={version:1,transport,installation:target.installation,schema:target.schema,database:target.database,broker:{url:connection(broker,brokerPassword),role:broker},definer,helpers,web:entries.filter(x=>x.purpose==='web'),workloads:[],salesOrg:target.salesOrg};
  await writeFile(join(output,'web.pending.json'),JSON.stringify(config),{mode:0o600,flag:'wx'});await writeFile(join(output,'workloads.pending.json'),JSON.stringify(workloadConfig),{mode:0o600,flag:'wx'});
  try{await db.query('COMMIT');committed=true;}catch{uncertain=true;throw Error('commit uncertain');}
  // Validate independently after commit, before publishing any ready generation.
  const running=await bootstrapTenantContext(join(output,'web.pending.json'),false,true,undefined,execution);await running.close();for(const e of entries.filter(x=>x.purpose!=='web')){const pool=new Pool(await scopedPoolOptions({url:e.url,schema:target.schema,purpose:e.purpose,transport},execution));try{await registerTenantPool(pool,{...e,schema:target.schema});}finally{await pool.end();}}
  await publicationProbe?.();await mkdir(join(output,'runtime'),{mode:0o700});for(const entry of workloadConfig.entries){const dir=join(output,'runtime',entry.role);await mkdir(dir,{mode:0o700});const bytes=JSON.stringify({...workloadConfig,entries:[entry]});await writeFile(join(dir,'workloads.json'),bytes,{mode:0o600,flag:'wx'});await writeFile(join(dir,'ready.json'),JSON.stringify({installation:target.installation,workloadsSha256:createHash('sha256').update(bytes).digest('hex')}),{mode:0o600,flag:'wx'});}await writeFile(join(output,'web.json'),JSON.stringify(config),{mode:0o600,flag:'wx'});await writeFile(join(output,'workloads.json'),JSON.stringify(workloadConfig),{mode:0o600,flag:'wx'});await writeFile(join(output,'ready.json'),JSON.stringify({installation:target.installation,databaseOid:ownerFacts.database_oid,roles:expectedOids,workloadsSha256:createHash('sha256').update(JSON.stringify(workloadConfig)).digest('hex'),webSha256:createHash('sha256').update(JSON.stringify(config)).digest('hex'),activated:false}),{mode:0o600,flag:'wx'});
  return{scope:'private tenant role preparation only',reused:false,roles:expectedOids,activated:false};
 }catch{
  let cleanupVerified=!uncertain;try{if(db&&!uncertain){if(committed){await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='2s'");await db.query("SET LOCAL statement_timeout='10s'");await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`tenant-install:${target.schema}`]);
   for(const fn of brokerFunctions){const prior=priorOwners[fn.split('(')[0]],current=(await db.query('SELECT p.oid::text oid,p.proowner::text owner_oid FROM pg_proc p WHERE p.oid=to_regprocedure($1)',[`${target.schema}.${fn}`])).rows[0];if(!prior||!/^[_a-zA-Z][_a-zA-Z0-9]{0,62}$/.test(prior.owner)||!current||current.oid!==prior.oid||current.owner_oid!==expectedOids[`llti_${target.installation}_definer`])throw Error('Owner cleanup refused');}
   for(const fn of brokerFunctions)await db.query(`ALTER FUNCTION ${target.schema}.${fn} OWNER TO ${priorOwners[fn.split('(')[0]].owner}`);for(const role of roleNames){const row=(await db.query('SELECT oid::text FROM pg_roles WHERE rolname=$1',[role])).rows[0];if(row&&row.oid!==expectedOids[role])throw Error('Role cleanup identity changed');await db.query(`DELETE FROM ${target.schema}.ll_runtime_workspace_bindings WHERE login_name=$1`,[role]);await db.query(`DROP OWNED BY ${role}`);await db.query(`DROP ROLE ${role}`);}await db.query('COMMIT');}else await db.query('ROLLBACK');}}catch{cleanupVerified=false;await db?.query('ROLLBACK').catch(()=>undefined);}
  if(created&&cleanupVerified&&ownedIdentity){const current=await lstat(output).catch(()=>undefined);if(current?.ino===ownedIdentity.ino&&current.dev===ownedIdentity.dev&&!current.isSymbolicLink())await rm(output,{recursive:true,force:true});}
  throw Error(!cleanupVerified?'Tenant installation or cleanup unverified; retain private pending generation for owner review.':'Tenant installation refused; no runtime activated.');
 }finally{await db?.end();}
}


/** Same reviewed ACL operation used by fresh install and offline repair. */
async function grantBrokerSecurity(db:Pick<Pool,'query'>,schema:string,broker:string,definer:string){
 await db.query(`GRANT USAGE,CREATE ON SCHEMA ${schema} TO ${definer}`);
 await db.query(`GRANT SELECT ON ${schema}.ll_members,${schema}.ll_sessions,${schema}.ll_tokens,${schema}.ll_named_subject_presence TO ${definer}`);
 await db.query(`GRANT SELECT,INSERT,UPDATE ON ${schema}.ll_access_attempts TO ${definer}`);
 for(const fn of brokerFunctions)await db.query(`ALTER FUNCTION ${schema}.${fn} OWNER TO ${definer}`);
 await db.query(`REVOKE CREATE ON SCHEMA ${schema} FROM ${definer}`);
 await db.query(`GRANT USAGE ON SCHEMA ${schema} TO ${broker}`);
 for(const fn of brokerFunctions)await db.query(`GRANT EXECUTE ON FUNCTION ${schema}.${fn} TO ${broker}`);
}
type RecoveryInput={originalDirectory:string;identityFile:string;identitySha256:string;restoredSchemaOid:string;archiveSha256:string;acknowledgement:'WRITERS_STOPPED_AND_EPOCH_ROTATED'};
type RecoveryProbe=(phase:'fenced'|'repaired'|'login-enabled'|'validated'|'ready-staged',identity:Readonly<{backendPid:number}>)=>Promise<void>;
type RecoveryVerifier=(owner:Pick<Pool,'query'>,target:Readonly<Target>)=>Promise<void>;
const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const decimal=/^[1-9][0-9]{0,9}$/;
const capabilityOrder=(a:Capability,b:Capability)=>JSON.stringify(a).localeCompare(JSON.stringify(b));
function same(a:unknown,b:unknown){return JSON.stringify(a)===JSON.stringify(b);}
async function recoveryOriginal(directory:string){
 directory=resolve(directory);await privateDirectory(directory);
 const web=await readOwnedPrivateFile(join(directory,'web.json'),131072),work=await readOwnedPrivateFile(join(directory,'workloads.json'),131072),ready=await readOwnedPrivateFile(join(directory,'ready.json'),16384);
 const config=parseTenantInstallation(JSON.parse(web.bytes.toString('utf8'))),workloads=parseWorkloadInstallation(JSON.parse(work.bytes.toString('utf8'))),meta=JSON.parse(ready.bytes.toString('utf8'));
 if(config.workloads.length||meta.installation!==config.installation||meta.webSha256!==sha(web.bytes)||meta.workloadsSha256!==sha(work.bytes)||!decimal.test(meta.databaseOid)||!meta.roles||typeof meta.roles!=='object'||Array.isArray(meta.roles))throw Error('Original generation identity');
 if(config.installation!==workloads.installation||config.schema!==workloads.schema||config.database!==workloads.database||!same(config.transport,workloads.transport))throw Error('Original generation mismatch');
 parseTenantInstallation({...config,workloads:workloads.entries});
 let supplement:Awaited<ReturnType<typeof readOwnedPrivateFile>>|undefined;const supplementalReads:(()=>Promise<void>)[]=[];
 if(Object.hasOwn(meta,'version')){
  if(meta.version!==2||typeof meta.supplementalSha256!=='string'||! /^[a-f0-9]{64}$/.test(meta.supplementalSha256))throw Error('Recovery supplemental readiness');
  supplement=await readOwnedPrivateFile(join(directory,'quote-recovery-inventory.json'),131072);if(sha(supplement.bytes)!==meta.supplementalSha256)throw Error('Recovery supplemental digest');
  const inventory=JSON.parse(supplement.bytes.toString('utf8'));if(!inventory||Object.keys(inventory).sort().join()!=='entries,installation,version'||inventory.version!==2||inventory.installation!==config.installation||!Array.isArray(inventory.entries)||!inventory.entries.length||inventory.entries.length>40)throw Error('Recovery supplemental inventory');
  const roles=new Set<string>(),purposes=new Set<string>();
  for(const e of inventory.entries){if(!e||Object.keys(e).sort().join()!=='epoch,file,oid,org,purpose,readySha256,role,sha256'||typeof e.role!=='string'||!/^llqt_[a-z0-9_]{1,54}$/.test(e.role)||e.file!==join(directory,'runtime',e.role,'workloads.json')||meta.roles[e.role]!==e.oid||roles.has(e.role)||purposes.has(e.org+':'+e.purpose))throw Error('Recovery supplemental process inventory');roles.add(e.role);purposes.add(e.org+':'+e.purpose);
   const loaded=await readWorkloadInstallation(e.file),bytes=await readOwnedPrivateFile(e.file,131072),ready=await readOwnedPrivateFile(join(dirname(e.file),'ready.json'),16384),c=loaded.config,entry=c.entries[0];if(sha(bytes.bytes)!==e.sha256||sha(ready.bytes)!==e.readySha256||c.installation!==config.installation||c.schema!==config.schema||c.database!==config.database||!same(c.transport,workloads.transport)||entry.role!==e.role||entry.org!==e.org||entry.purpose!==e.purpose||entry.epoch!==e.epoch||e.epoch!==config.web.find(t=>t.org===e.org)?.epoch)throw Error('Recovery supplemental generation mismatch');supplementalReads.push(async()=>{await loaded.assertStable();await bytes.assertStable();await ready.assertStable();});
  }
 }
 const assertStable=async()=>{await web.assertStable();await work.assertStable();await ready.assertStable();await supplement?.assertStable();for(const check of supplementalReads)await check();};await assertStable();
 return{config,workloads,meta,webSha256:sha(web.bytes),workloadsSha256:sha(work.bytes),assertStable};
}
async function exactRuntimeBindings(db:Pick<Pool,'query'>,target:Target,original:Awaited<ReturnType<typeof recoveryOriginal>>,extra:SupplementalQuote[]=[]){
 const entries=[...original.config.web,...original.workloads.entries,...extra];
 const wanted=entries.map(x=>({login_name:x.role,login_oid:'oid'in x?x.oid:original.meta.roles[x.role],database_oid:original.meta.databaseOid,database_name:target.database,org_id:x.org,purpose:x.purpose})).sort((a,b)=>a.login_name.localeCompare(b.login_name));
 const bound=(await db.query(`SELECT login_name,login_oid::text,database_oid::text,database_name,org_id,purpose FROM ${target.schema}.ll_runtime_workspace_bindings ORDER BY login_name`)).rows;
 if(!same(bound,wanted))throw Error('Competing or changed installation binding');
 const exists=(await db.query('SELECT to_regclass($1) present',[`${target.schema}.ll_quote_workload_roles`])).rows[0]?.present;
 const quote=exists?(await db.query(`SELECT org_id,role_oid::text oid,purpose FROM ${target.schema}.ll_quote_workload_roles ORDER BY role_oid::text`)).rows:[];
 const expected=extra.map(x=>({org_id:x.org,oid:x.oid,purpose:x.purpose})).sort((a,b)=>a.oid.localeCompare(b.oid));
 if(!same(quote,expected))throw Error('Unknown or orphan quote installation');
}
function supplementalDescriptor(e:SupplementalQuote){return{file:e.file,sha256:e.sha256,readySha256:e.readySha256,role:e.role,org:e.org,purpose:e.purpose,epoch:e.epoch};}
async function supplementalQuoteGenerations(files:readonly string[],original:Awaited<ReturnType<typeof recoveryOriginal>>,target:Target){
 const entries:Omit<SupplementalQuote,'oid'>[]=[],configs:ReturnType<typeof parseWorkloadInstallation>[]=[],stable:(()=>Promise<void>)[]=[];
 if(!Array.isArray(files)||files.length>40||new Set(files).size!==files.length)throw Error('Bounded quote generation inventory');
 for(const file of files){
  if(typeof file!=='string'||resolve(file)!==file)throw Error('Canonical quote generation required');
  const loaded=await readWorkloadInstallation(file),bytes=await readOwnedPrivateFile(file,131072),ready=await readOwnedPrivateFile(join(dirname(file),'ready.json'),16384),c=loaded.config,e=c.entries[0];
  if(c.installation!==target.installation||c.schema!==target.schema||c.database!==target.database||!same(c.transport,original.workloads.transport)||!['worker','scheduler'].includes(e.purpose)||!/^llqt_[a-z0-9_]{1,54}$/.test(e.role)||e.epoch!==original.config.web.find(t=>t.org===e.org)?.epoch.toLowerCase()||entries.some(x=>x.role===e.role||x.org===e.org&&x.purpose===e.purpose))throw Error('Exact supplemental quote generation');
  const endpoint=new URL(e.url),base=new URL(original.config.broker.url);if(['protocol','hostname','port','pathname'].some(k=>endpoint[k as keyof URL]!==base[k as keyof URL]))throw Error('Quote database endpoint differs');
  const assertStable=async()=>{await loaded.assertStable();await bytes.assertStable();await ready.assertStable();};await assertStable();stable.push(assertStable);configs.push(c);
  entries.push({file,sha256:sha(bytes.bytes),readySha256:sha(ready.bytes),role:e.role,org:e.org,purpose:e.purpose as 'worker'|'scheduler',epoch:e.epoch});
 }
 const assertStable=async()=>{for(const check of stable)await check();};await assertStable();return{entries,configs,assertStable};
}
async function recoveryRoles(db:Pick<Pool,'query'>,target:Target,expected:Record<string,string>,login:boolean,extra:SupplementalQuote[]=[]){
 const names=[`llti_${target.installation}_broker`,`llti_${target.installation}_definer`,...target.tenants.flatMap((_,i)=>['web','worker','scheduler'].map(p=>`llti_${target.installation}_${p}_${i}`)),...extra.map(e=>e.role)].sort();
 if(Object.keys(expected).sort().join()!==names.join()||Object.values(expected).some(x=>!decimal.test(x)))throw Error('Original role inventory');
 const rows=(await db.query(`SELECT rolname name,oid::text oid,rolcanlogin login,rolbypassrls bypass,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolreplication,rolvaliduntil,rolconfig,EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid) grouped FROM pg_roles r WHERE rolname=ANY($1::text[]) ORDER BY rolname`,[names])).rows;
 if(rows.length!==names.length)throw Error('Original role missing');
 for(const row of rows){const definer=row.name===`llti_${target.installation}_definer`;if(row.oid!==expected[row.name]||row.login!==(definer?false:login)||row.bypass!==definer||row.rolsuper||row.rolinherit||row.rolcreaterole||row.rolcreatedb||row.rolreplication||row.grouped||row.rolconfig!==null||row.rolvaliduntil!==null)throw Error('Original role changed');}
 if((await db.query(`SELECT 1 FROM pg_class WHERE relowner=ANY($1::oid[]) LIMIT 1`,[Object.values(expected)])).rows.length)throw Error('Runtime role owns relation');
 return rows.map(({name,oid,login,bypass})=>({name,oid,login,bypass})) as RoleIdentity[];
}
async function recoveryCatalog(db:Pick<Pool,'query'>,target:Target){
 const f=(await db.query(`SELECT current_user owner,current_database() database,(SELECT oid::text FROM pg_database WHERE datname=current_database()) database_oid,(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) super,(SELECT oid::text FROM pg_namespace WHERE nspname=$1) schema_oid,(SELECT r.rolname FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname=$1) schema_owner`,[target.schema])).rows[0];
 if(!f||f.owner!==target.ownerRole||f.database!==target.database||!f.super||f.schema_owner!==target.ownerRole||!decimal.test(f.schema_oid))throw Error('Explicit recovery owner');
 const functions=(await db.query(`SELECT p.oid::regprocedure::text name,pg_get_functiondef(p.oid) definition,r.rolname owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname=$1 ORDER BY p.oid::regprocedure::text`,[target.schema])).rows.map(row=>({name:row.name,definition:sha(row.definition),owner:row.owner}));
 return{...f,functions};
}
async function recoveryCapabilities(db:Pick<Pool,'query'>,schema:string,roles:string[]){
 const rows=(await db.query(`
 SELECT 'schema' kind,n.nspname name,'' "column",coalesce(r.rolname,'PUBLIC') grantee,a.privilege_type privilege,a.is_grantable grantable FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE n.nspname=$1 AND (a.grantee=0 OR r.rolname=ANY($2::text[]))
 UNION ALL SELECT 'table',c.relname,'',coalesce(r.rolname,'PUBLIC'),a.privilege_type,a.is_grantable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner))) a LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE n.nspname=$1 AND c.relkind IN ('r','p','S','v','m') AND (a.grantee=0 OR r.rolname=ANY($2::text[]))
 UNION ALL SELECT 'column',c.relname,t.attname,coalesce(r.rolname,'PUBLIC'),a.privilege_type,a.is_grantable FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute t ON t.attrelid=c.oid AND t.attnum>0 AND NOT t.attisdropped CROSS JOIN LATERAL aclexplode(t.attacl) a LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE n.nspname=$1 AND (a.grantee=0 OR r.rolname=ANY($2::text[]))
 UNION ALL SELECT 'function',p.oid::regprocedure::text,'',coalesce(r.rolname,'PUBLIC'),a.privilege_type,a.is_grantable FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE n.nspname=$1 AND (a.grantee=0 OR r.rolname=ANY($2::text[]))`,[schema,roles])).rows as Capability[];
 return rows.sort(capabilityOrder);
}
async function sharedRecoveryGrants(db:Pick<Pool,'query'>,target:Target,extra:SupplementalQuote[]=[]){
 await grantBrokerSecurity(db,target.schema,`llti_${target.installation}_broker`,`llti_${target.installation}_definer`);
 for(const [i]of target.tenants.entries())for(const purpose of ['web','worker','scheduler']as const)await grant(db,target.schema,`llti_${target.installation}_${purpose}_${i}`,purpose);
 for(const e of extra)await grantQuoteWorkloadCapabilities(db,target.schema,e.role,e.purpose);
 for(const org of new Set(extra.map(e=>e.org))){const i=target.tenants.findIndex(t=>t.org===org);if(i<0)throw Error('Quote workspace differs');await grantQuoteAdmissionCapabilities(db,target.schema,`llti_${target.installation}_web_${i}`);}
}
/** Rollback-only derivation prevents an already excessive installed ACL from
 * being blessed as recovery authority. This uses the actual shared grant logic. */
async function assertReviewedCapabilities(db:Pick<Pool,'query'>,target:Target,actual:Capability[],roles:string[],extra:SupplementalQuote[]=[]){
 await db.query('SAVEPOINT recovery_capability_model');
 try{
  await db.query(`REVOKE ALL ON SCHEMA ${target.schema} FROM ${roles.join(',')}`);
  const objects=(await db.query(`SELECT c.relname,c.relkind,ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum) columns FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','p','v','m','S')`,[target.schema])).rows;
  for(const object of objects){if(!ident.test(object.relname)||object.columns.some((c:string)=>!ident.test(c)))throw Error('Capability inventory');await db.query(`REVOKE ALL ON ${object.relkind==='S'?'SEQUENCE':'TABLE'} ${target.schema}.${object.relname} FROM ${roles.join(',')}`);if(object.relkind!=='S'&&object.columns.length)for(const role of roles)await db.query(`REVOKE ALL(${object.columns.join(',')}) ON ${target.schema}.${object.relname} FROM ${role}`);}
  const functions=(await db.query(`SELECT p.oid::regprocedure::text name,r.rolname owner FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1`,[target.schema])).rows;
  for(const fn of functions){if(!/^[a-zA-Z0-9_ .,"()[\]]+$/.test(fn.name))throw Error('Function inventory');const grantees=roles.filter(role=>role!==fn.owner);if(grantees.length)await db.query(`REVOKE ALL ON FUNCTION ${fn.name} FROM ${grantees.join(',')}`);}
  await sharedRecoveryGrants(db,target,extra);
  const expected=await recoveryCapabilities(db,target.schema,roles);
  if(!same(actual,expected))throw Error('Installed grants exceed or differ from reviewed source');
 }finally{await db.query('ROLLBACK TO SAVEPOINT recovery_capability_model');await db.query('RELEASE SAVEPOINT recovery_capability_model');}
}
function recoveryTarget(original:Awaited<ReturnType<typeof recoveryOriginal>>,target:Target){
 const c=original.config;if(c.installation!==target.installation||c.schema!==target.schema||c.database!==target.database||c.salesOrg!==target.salesOrg||!same(c.transport,parseTransport(target.transport))||!same(c.web.map(x=>x.org),target.tenants.map(x=>x.org)))throw Error('Recovery target differs');
 const base=`llti_${target.installation}`;if(c.broker.role!==base+'_broker'||c.definer!==base+'_definer'||!same(c.web.map(x=>[x.role,x.org,x.purpose]),target.tenants.map((x,i)=>[`${base}_web_${i}`,x.org,'web']))||!same(original.workloads.entries.map(x=>[x.role,x.org,x.purpose]),target.tenants.flatMap((x,i)=>['worker','scheduler'].map(p=>[`${base}_${p}_${i}`,x.org,p]))))throw Error('Original purpose inventory');
}
function recoveryOwnerEndpoint(ownerUrl:string,original:Awaited<ReturnType<typeof recoveryOriginal>>,target:Target){const owner=new URL(ownerUrl),broker=new URL(original.config.broker.url);if(!['postgres:','postgresql:'].includes(owner.protocol)||!owner.password||owner.search||owner.hash||decodeURIComponent(owner.username)!==target.ownerRole||decodeURIComponent(owner.pathname.slice(1))!==target.database||['protocol','hostname','port','pathname'].some(k=>owner[k as keyof URL]!==broker[k as keyof URL]))throw Error('Original owner endpoint');}
/** Offline pre-archive capture only. A private snapshot is not release evidence.
 * Missing historical capture is unsupported; recovery never guesses role OIDs. */
export async function captureExistingRecoveryIdentity(ownerUrl:string,target:Target,originalDirectory:string,identityFile:string,verify:Verify,execution:ExecutionContext={kind:'installed-runtime'},quoteWorkloads:readonly string[]=[]){
 shape(target);target=Object.freeze({...target,transport:parseTransport(target.transport),tenants:Object.freeze(target.tenants.map(x=>Object.freeze({...x}))) as unknown as Target['tenants']});if(typeof verify!=='function')throw Error('Trusted verifier');const original=await recoveryOriginal(originalDirectory);recoveryTarget(original,target);recoveryOwnerEndpoint(ownerUrl,original,target);
 const running=await bootstrapTenantContext(join(resolve(originalDirectory),'web.json'),false,false,undefined,execution);await running.close();await original.assertStable();
 const db=new Pool({...await scopedPoolOptions({url:ownerUrl,schema:target.schema,purpose:'installer',transport:parseTransport(target.transport)},execution),max:1});
 try{
  await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='10s'");await db.query("SET LOCAL lock_timeout='2s'");
  await facts(db,target);await verify(db,target);const catalog=await recoveryCatalog(db,target);if(catalog.database_oid!==original.meta.databaseOid)throw Error('Original database changed');
  const supplemental=await supplementalQuoteGenerations(quoteWorkloads,original,target),extra:SupplementalQuote[]=[];
  for(const e of supplemental.entries){const oid=(await db.query('SELECT oid::text FROM pg_roles WHERE rolname=$1',[e.role])).rows[0]?.oid;if(!decimal.test(oid))throw Error('Quote role missing');
   const entry=supplemental.configs.find(c=>c.entries[0].role===e.role)!.entries[0];const check=new Pool(await scopedPoolOptions({url:entry.url,schema:target.schema,purpose:entry.purpose,transport:original.workloads.transport},execution));try{await registerTenantPool(check,{...entry,schema:target.schema});}finally{await check.end();}extra.push({...e,oid});}
  const stable=[supplemental.assertStable];
  const roleMap={...original.meta.roles,...Object.fromEntries(extra.map(e=>[e.role,e.oid]))};
  await exactRuntimeBindings(db,target,original,extra);const roles=await recoveryRoles(db,target,roleMap,true,extra),caps=await recoveryCapabilities(db,target.schema,roles.map(x=>x.name));await assertReviewedCapabilities(db,target,caps,roles.map(x=>x.name),extra);
  const identity:RecoveryIdentity={version:3,contract:'tenant-recovery-capture-3',tenants:original.config.web.map(e=>({org:e.org,epoch:e.epoch})),...(extra.length?{supplemental:extra}:{}),installation:target.installation,schema:target.schema,database:target.database,databaseOid:catalog.database_oid,schemaOid:catalog.schema_oid,owner:target.ownerRole,webSha256:original.webSha256,workloadsSha256:original.workloadsSha256,roles,functions:catalog.functions,capabilities:caps};
  for(const check of stable)await check();await original.assertStable();await db.query('ROLLBACK');await recoveryRoles(db,target,roleMap,true,extra);await exactRuntimeBindings(db,target,original,extra);for(const check of stable)await check();const current=await recoveryCatalog(db,target);if(!same(current.functions,catalog.functions)||current.schema_oid!==catalog.schema_oid||current.database_oid!==catalog.database_oid||!same(await recoveryCapabilities(db,target.schema,roles.map(x=>x.name)),caps))throw Error('Capture changed during validation');await original.assertStable();identityFile=resolve(identityFile);await privateDirectory(dirname(identityFile));const bytes=encodeRecoveryCapture(identity);await writeFile(identityFile,bytes,{mode:0o600,flag:'wx'});return{scope:'offline pre-archive recovery identity only',sha256:sha(bytes),roles:Object.fromEntries(roles.map(x=>[x.name,x.oid])),activated:false};
 }finally{await db.query('ROLLBACK').catch(()=>undefined);await db.end();}
}
/** Existing-installation repair only. Callers are source-owned offline code;
 * no web/worker route is registered and no runtime authority is created. */
export async function recoverExistingTenantInstallation(ownerUrl:string,target:Target,input:RecoveryInput,output:string,verify:RecoveryVerifier,probe?:RecoveryProbe,execution:ExecutionContext={kind:'installed-runtime'}){
 let pool:Pool|undefined,db:PoolClient|undefined,connectionLost=false;let recoveryBackendPid:number|undefined,lockHeld=false;let outputIdentity:{ino:number;dev:number}|undefined;const readiness:{path:string;directory:{ino:number;dev:number};file:{ino:number;dev:number}}[]=[];let fenced=false,fenceAttempted=false,enableAttempted=false,success=false;let original:Awaited<ReturnType<typeof recoveryOriginal>>|undefined;let identityRead:Awaited<ReturnType<typeof readOwnedPrivateFile>>|undefined;let expected:RecoveryIdentity|undefined;let extra:SupplementalQuote[]=[];let roleMap:Record<string,string>={};let supplemental:Awaited<ReturnType<typeof supplementalQuoteGenerations>>|undefined;const secretEntries:{url:string;role:string;org:string;epoch:string;purpose:'web'|'worker'|'scheduler'}[]=[];
 const fence=async()=>{
  if(!db||!original||!expected)throw Error('Recovery identity absent');fenceAttempted=true;await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='10s'");await db.query("SET LOCAL lock_timeout='2s'");
  await db.query('SELECT oid FROM pg_authid WHERE rolname=ANY($1::text[]) ORDER BY oid FOR UPDATE',[expected.roles.filter(x=>x.login).map(x=>x.name)]);
  for(const role of expected.roles.filter(x=>x.login)){const now=(await db.query('SELECT oid::text oid FROM pg_roles WHERE rolname=$1',[role.name])).rows[0];if(now?.oid!==role.oid)throw Error('Fence role changed');await db.query(`ALTER ROLE ${role.name} NOLOGIN`);}
  await db.query('COMMIT');await recoveryRoles(db,target,roleMap,false,extra);fenced=true;
 };
 try{
  shape(target);target=Object.freeze({...target,transport:parseTransport(target.transport),tenants:Object.freeze(target.tenants.map(x=>Object.freeze({...x}))) as unknown as Target['tenants']});input=Object.freeze({...input});if(input.acknowledgement!=='WRITERS_STOPPED_AND_EPOCH_ROTATED'||!decimal.test(input.restoredSchemaOid)||! /^[a-f0-9]{64}$/.test(input.archiveSha256)||! /^[a-f0-9]{64}$/.test(input.identitySha256)||typeof verify!=='function')throw Error('Offline recovery prerequisites');
  original=await recoveryOriginal(input.originalDirectory);recoveryTarget(original,target);recoveryOwnerEndpoint(ownerUrl,original,target);const captured=await readRecoveryCapture(resolve(input.identityFile));identityRead=captured;if(sha(identityRead.bytes)!==input.identitySha256)throw Error('Pinned recovery capture changed');expected=captured.identity;
  if(!expected||![1,2,3].includes(expected.version)||expected.installation!==target.installation||expected.schema!==target.schema||expected.database!==target.database||expected.owner!==target.ownerRole||expected.webSha256!==original.webSha256||expected.workloadsSha256!==original.workloadsSha256||expected.databaseOid!==original.meta.databaseOid||!Array.isArray(expected.roles)||!Array.isArray(expected.functions)||!Array.isArray(expected.capabilities))throw Error('Recovery capture mismatch');
  if(expected.version===3&&!same(expected.tenants,original.config.web.map(e=>({org:e.org,epoch:e.epoch}))))throw Error('Captured tenant inventory changed');
  if(expected.version===1||expected.version===3&&!expected.supplemental){if(Object.hasOwn(expected,'supplemental'))throw Error('Legacy recovery cannot admit supplemental roles');}
  else{
   if(!Array.isArray(expected.supplemental)||!expected.supplemental.length||expected.supplemental.length>40)throw Error('Supplemental recovery capture required');
   for(const e of expected.supplemental){if(!e||typeof e!=='object'||Object.keys(e).sort().join()!=='epoch,file,oid,org,purpose,readySha256,role,sha256'||typeof e.role!=='string'||!/^llqt_[a-z0-9_]{1,54}$/.test(e.role)||!decimal.test(e.oid)||typeof e.sha256!=='string'||! /^[a-f0-9]{64}$/.test(e.sha256)||typeof e.readySha256!=='string'||! /^[a-f0-9]{64}$/.test(e.readySha256))throw Error('Exact supplemental capture required');}
   extra=expected.supplemental;
   supplemental=await supplementalQuoteGenerations(extra.map(e=>e.file),original,target);
   if(!same(supplemental.entries,extra.map(supplementalDescriptor)))throw Error('Sealed supplemental recovery identity changed');
  }
  roleMap={...original.meta.roles,...Object.fromEntries(extra.map(e=>[e.role,e.oid]))};
  if(!same(expected.roles.map(x=>[x.name,x.oid]).sort(),Object.entries(roleMap).sort()))throw Error('Recovery role capture mismatch');
  if(expected.roles.some(e=>!e||Object.keys(e).sort().join()!=='bypass,login,name,oid'||typeof e.name!=='string'||e.login!==(e.name!==original!.config.definer)||e.bypass!==(e.name===original!.config.definer)))throw Error('Recovery captured role attributes differ');
  for(const [i,t]of target.tenants.entries())if(t.epoch===original.config.web[i].epoch)throw Error('Fresh external epoch required');
  output=resolve(output);await privateDirectory(dirname(output));try{await lstat(output);throw Error('New exclusive recovery output required');}catch(error){if((error as{code?:string}).code!=='ENOENT')throw error;}
  const u=new URL(ownerUrl);if(!['postgres:','postgresql:'].includes(u.protocol)||!u.password||u.search||u.hash||decodeURIComponent(u.username)!==target.ownerRole||decodeURIComponent(u.pathname.slice(1))!==target.database)throw Error('Explicit owner URL');
  pool=new Pool({...await scopedPoolOptions({url:ownerUrl,schema:target.schema,purpose:'installer',transport:parseTransport(target.transport)},execution),max:1});db=await pool.connect();db.on('error',()=>{connectionLost=true;});
  const isRestoredPublicDefault=(x:Capability)=>x.kind==='function'&&x.grantee==='PUBLIC'&&x.privilege==='EXECUTE'&&!x.grantable&&x.column===''&&expected!.functions.some(f=>f.name===x.name)&&!expected!.capabilities.some(y=>y.kind==='function'&&y.name===x.name&&y.grantee==='PUBLIC');
  await db.query("SET statement_timeout='10s'");await db.query("SET lock_timeout='2s'");
  const admitted=await recoveryCatalog(db,target);if(admitted.database_oid!==expected.databaseOid||admitted.schema_oid!==input.restoredSchemaOid)throw Error('Recovery lock target changed');
  await db.query('SELECT pg_advisory_lock(hashtext($1))',[`tenant-install:${target.schema}`]);lockHeld=true;const backendPid:number=(await db.query('SELECT pg_backend_pid() pid')).rows[0].pid;if(!Number.isSafeInteger(backendPid)||backendPid<=0)throw Error('Recovery backend identity');recoveryBackendPid=backendPid;
  const validate=async(login:boolean,allowRestoreDefaults=false)=>{
   if(connectionLost||(await db!.query('SELECT pg_backend_pid() pid')).rows[0].pid!==recoveryBackendPid)throw Error('Recovery connection lost');
   await supplemental?.assertStable();await original!.assertStable();await identityRead!.assertStable();const c=await recoveryCatalog(db!,target);if(c.database_oid!==expected!.databaseOid||c.schema_oid!==input.restoredSchemaOid)throw Error('Restored target changed');await recoveryRoles(db!,target,roleMap,login,extra);
   const current=c.functions.map((x:{name:string;definition:string;owner:string})=>({...x,owner:x.owner===target.ownerRole&&expected!.functions.find(f=>f.name===x.name)?.owner===original!.config.definer?original!.config.definer:x.owner}));if(!same(current,expected!.functions))throw Error('Restored function source changed');
   await verify(db!,target);await supplemental?.assertStable();await original!.assertStable();await identityRead!.assertStable();
   await exactRuntimeBindings(db!,target,original!,extra);
   const caps=await recoveryCapabilities(db!,target.schema,expected!.roles.map(x=>x.name));if(caps.some(x=>!expected!.capabilities.some(y=>same(x,y))&&!(allowRestoreDefaults&&isRestoredPublicDefault(x))))throw Error('Restored grants exceed capture');
   await recoveryRoles(db!,target,roleMap,login,extra);const after=await recoveryCatalog(db!,target);if(after.database_oid!==c.database_oid||after.schema_oid!==c.schema_oid||!same(after.functions,c.functions))throw Error('Recovery target changed during validation');await supplemental?.assertStable();await original!.assertStable();await identityRead!.assertStable();
  };
  await validate(true,true);await fence();await probe?.('fenced',Object.freeze({backendPid}));await validate(false,true);
  if((await db.query('SELECT 1 FROM pg_stat_activity WHERE usesysid=ANY($1::oid[]) AND pid<>pg_backend_pid() UNION ALL SELECT 1 FROM pg_prepared_xacts WHERE owner=ANY($2::text[])',[expected.roles.filter(x=>x.login).map(x=>x.oid),expected.roles.filter(x=>x.login).map(x=>x.name)])).rows.length)throw Error('Selected runtime sessions remain; admission stays fenced');
  for(const t of target.tenants){const row=(await db.query(`SELECT r.epoch::text,e.backup_hash FROM ${target.schema}.ll_workspace_recovery r JOIN ${target.schema}.ll_workspace_recovery_events e ON e.org_id=r.org_id AND e.epoch=r.epoch WHERE r.org_id=$1`,[t.org])).rows[0];if(row?.epoch!==t.epoch.toLowerCase()||row?.backup_hash!==input.archiveSha256)throw Error('Recorded quarantine differs');}
  await mkdir(output,{mode:0o700});outputIdentity=await privateDirectory(output);const stableOutput=async()=>{const current=await privateDirectory(output);if(current.ino!==outputIdentity!.ino||current.dev!==outputIdentity!.dev)throw Error('Recovery publication directory changed');};
  const writeReady=async(path:string,bytes:string)=>{await stableOutput();const directory=await privateDirectory(dirname(path));const handle=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);try{const file=await handle.stat();readiness.push({path,directory:{ino:directory.ino,dev:directory.dev},file:{ino:file.ino,dev:file.dev}});await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}};
  await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='10s'");await db.query("SET LOCAL lock_timeout='2s'");await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`tenant-install:${target.schema}`]);await validate(false,true);
  // --no-acl recreates reviewed functions with default PUBLIC EXECUTE. Only
  // these exact same-source captured identities may be restored to revoked.
  for(const cap of (await recoveryCapabilities(db,target.schema,expected.roles.map(x=>x.name))).filter(isRestoredPublicDefault)){const fn=(await db.query(`SELECT pg_get_functiondef(p.oid) definition,r.rolname owner,format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC',p.oid::regprocedure) revoke FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=to_regprocedure($1)`,[cap.name])).rows[0];const old=expected.functions.find(x=>x.name===cap.name)!;if(!fn||sha(fn.definition)!==old.definition||![old.owner,target.ownerRole].includes(fn.owner))throw Error('Restore default identity changed');await db.query(fn.revoke);}
  await sharedRecoveryGrants(db,target,extra);
  const connect=(role:string,password:string)=>{const url=new URL(ownerUrl);url.username=role;url.password=password;return url.href;};const brokerPassword=randomBytes(32).toString('base64url');await db.query(`ALTER ROLE ${original.config.broker.role} PASSWORD '${brokerPassword}'`);
  for(const entry of [...original.config.web,...original.workloads.entries,...(supplemental?.configs.flatMap(c=>c.entries)??[])]){const password=randomBytes(32).toString('base64url');await db.query(`ALTER ROLE ${entry.role} PASSWORD '${password}'`);secretEntries.push({...entry,url:connect(entry.role,password),epoch:target.tenants.find(x=>x.org===entry.org)!.epoch.toLowerCase()});}
  const full=await recoveryCapabilities(db,target.schema,expected.roles.map(x=>x.name));if(!same(full,expected.capabilities))throw Error('Recovered grants differ from reviewed capture');
  await supplemental?.assertStable();await original.assertStable();await identityRead.assertStable();await db.query('COMMIT');await recoveryRoles(db,target,roleMap,false,extra);await probe?.('repaired',Object.freeze({backendPid}));
  const config={...original.config,broker:{...original.config.broker,url:connect(original.config.broker.role,brokerPassword)},web:secretEntries.filter(x=>x.purpose==='web')},workloads={...original.workloads,entries:secretEntries.filter(x=>original!.workloads.entries.some(e=>e.role===x.role))};parseTenantInstallation(config);parseWorkloadInstallation(workloads);
  const quoteWorkloads=extra.length?{...original.workloads,entries:secretEntries.filter(x=>extra.some(e=>e.role===x.role))}:undefined;if(quoteWorkloads)parseWorkloadInstallation(quoteWorkloads);
  await stableOutput();await writeFile(join(output,'web.pending.json'),JSON.stringify(config),{mode:0o600,flag:'wx'});await writeFile(join(output,'workloads.pending.json'),JSON.stringify(workloads),{mode:0o600,flag:'wx'});
  const pending=await readOwnedPrivateFile(join(output,'web.pending.json'),131072),pendingWork=await readOwnedPrivateFile(join(output,'workloads.pending.json'),131072);
  let pendingQuote:Awaited<ReturnType<typeof readOwnedPrivateFile>>|undefined;if(quoteWorkloads){await writeFile(join(output,'quote-workloads.pending.json'),JSON.stringify(quoteWorkloads),{mode:0o600,flag:'wx'});pendingQuote=await readOwnedPrivateFile(join(output,'quote-workloads.pending.json'),131072);}
  await validate(false);await pending.assertStable();await pendingWork.assertStable();await pendingQuote?.assertStable();enableAttempted=true;
  await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='10s'");await db.query("SET LOCAL lock_timeout='2s'");await db.query('SELECT oid FROM pg_authid WHERE rolname=ANY($1::text[]) ORDER BY oid FOR UPDATE',[expected.roles.filter(x=>x.login).map(x=>x.name)]);for(const role of expected.roles.filter(x=>x.login)){const row=(await db.query('SELECT oid::text oid FROM pg_roles WHERE rolname=$1',[role.name])).rows[0];if(row?.oid!==role.oid)throw Error('Enable role changed');await db.query(`ALTER ROLE ${role.name} LOGIN`);}await db.query('COMMIT');await probe?.('login-enabled',Object.freeze({backendPid}));await recoveryRoles(db,target,roleMap,true,extra);
  const loaded=await bootstrapTenantContext(join(output,'web.pending.json'),false,true,undefined,execution);try{for(const entry of [...workloads.entries,...(quoteWorkloads?.entries??[])]){const pool=new Pool(await scopedPoolOptions({url:entry.url,schema:target.schema,purpose:entry.purpose,transport:workloads.transport},execution));try{await registerTenantPool(pool,{...entry,schema:target.schema});}finally{await pool.end();}}}finally{await loaded.close();}
  await probe?.('validated',Object.freeze({backendPid}));await validate(true);await pending.assertStable();await pendingWork.assertStable();await pendingQuote?.assertStable();
  const publishedSupplemental:SupplementalQuote[]=[];await stableOutput();await mkdir(join(output,'runtime'),{mode:0o700});for(const entry of [...workloads.entries,...(quoteWorkloads?.entries??[])]){const dir=join(output,'runtime',entry.role);await mkdir(dir,{mode:0o700});const bytes=JSON.stringify({...workloads,entries:[entry]});await writeFile(join(dir,'workloads.json'),bytes,{mode:0o600,flag:'wx'});const readyBytes=JSON.stringify({installation:target.installation,workloadsSha256:sha(bytes)});await writeReady(join(dir,'ready.json'),readyBytes);if(extra.some(e=>e.role===entry.role))publishedSupplemental.push({file:join(dir,'workloads.json'),sha256:sha(bytes),readySha256:sha(readyBytes),role:entry.role,oid:roleMap[entry.role],org:entry.org,purpose:entry.purpose as 'worker'|'scheduler',epoch:entry.epoch});}
  let supplementalSha256:string|undefined;if(publishedSupplemental.length){const bytes=JSON.stringify({version:2,installation:target.installation,entries:publishedSupplemental});await writeFile(join(output,'quote-recovery-inventory.json'),bytes,{mode:0o600,flag:'wx'});supplementalSha256=sha(bytes);}
  await writeFile(join(output,'web.json'),JSON.stringify(config),{mode:0o600,flag:'wx'});await writeFile(join(output,'workloads.json'),JSON.stringify(workloads),{mode:0o600,flag:'wx'});await writeReady(join(output,'ready.json'),JSON.stringify({installation:target.installation,databaseOid:expected.databaseOid,roles:roleMap,...(supplementalSha256?{version:2,supplementalSha256}:{}),webSha256:sha(JSON.stringify(config)),workloadsSha256:sha(JSON.stringify(workloads)),activated:false}));await probe?.('ready-staged',Object.freeze({backendPid}));
  const final=await recoveryOriginal(output);await final.assertStable();if(publishedSupplemental.length){const published=await supplementalQuoteGenerations(publishedSupplemental.map(e=>e.file),final,target);if(!same(published.entries,publishedSupplemental.map(supplementalDescriptor)))throw Error('Published supplemental identity changed');await published.assertStable();}await stableOutput();await supplemental?.assertStable();await original.assertStable();await identityRead.assertStable();await recoveryRoles(db,target,roleMap,true,extra);if(connectionLost||(await db.query('SELECT pg_backend_pid() pid')).rows[0].pid!==recoveryBackendPid)throw Error('Recovery connection lost');const unlocked=(await db.query('SELECT pg_advisory_unlock(hashtext($1)) unlocked',[`tenant-install:${target.schema}`])).rows[0].unlocked;if(unlocked!==true)throw Error('Recovery lifecycle lock release unverified');lockHeld=false;success=true;
  return{scope:'offline existing tenant security repair only',roles:roleMap,supplementalRoles:extra.map(e=>({role:e.role,oid:e.oid,org:e.org,purpose:e.purpose})),originalSchemaOid:expected.schemaOid,restoredSchemaOid:input.restoredSchemaOid,archiveSha256:input.archiveSha256,activated:false};
 }catch{
  let readyRemoved=true;for(const marker of [...readiness].reverse()){try{const root=await privateDirectory(output),directory=await privateDirectory(dirname(marker.path)),ready=await lstat(marker.path);if(root.ino!==outputIdentity!.ino||root.dev!==outputIdentity!.dev||directory.ino!==marker.directory.ino||directory.dev!==marker.directory.dev||ready.ino!==marker.file.ino||ready.dev!==marker.file.dev||!ready.isFile()||ready.isSymbolicLink()||ready.uid!==process.getuid!()||(ready.mode&0o777)!==0o600)throw Error('Readiness cleanup identity changed');await unlink(marker.path);}catch(error){if((error as{code?:string}).code!=='ENOENT')readyRemoved=false;}}
  let confirmed=!fenceAttempted&&!enableAttempted;try{if(db){if(connectionLost)throw Error('Recovery connection lost');await db.query('ROLLBACK');if(fenceAttempted||enableAttempted){await fence();confirmed=true;}}}catch{confirmed=false;}
  throw Error(confirmed&&readyRemoved?'Existing installation recovery refused; runtime admission stopped or unchanged; private pending retained.':'Existing installation recovery or admission fence unverified; offline operator action required.');
 }finally{if(!success&&fenced&&db){/* Never reconnect to mutate roles after retained-client loss. */}if(db){if(lockHeld&&!connectionLost){try{const released=(await db.query('SELECT pg_advisory_unlock(hashtext($1)) unlocked',[`tenant-install:${target.schema}`])).rows[0].unlocked;if(released!==true)throw Error('Recovery lock release unverified');}catch{connectionLost=true;}}db.release(connectionLost?new Error('Recovery retained connection unavailable'):undefined);}await pool?.end();}
}
