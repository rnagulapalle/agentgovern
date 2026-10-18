import { ScopeControl } from '../connectors/scopes';
import { registerAgent } from '../workspace/agents';
import { submitSales } from '../workspace/sales';
import { verifyTenantInventory } from '../workspace/tenant-read-inventory';
import { ConnectorControl } from '../connectors/service';
import { WorkflowControl } from '../workflows/service';
import { EnquiryControl } from '../enquiries/service';
import { EnquiryRunner } from '../enquiries/runner';
import { installTenantRoles } from '../workspace/tenant-installer';
import { scopedMigrations } from '../../runtime/temporal/staging-preflight';
import { bootstrapTenantContext,readTenantInstallation } from '../workspace/tenant-bootstrap';
import { writeFile,symlink,mkdir,realpath,unlink,link } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const repositoryRoot=fileURLToPath(new URL('../../',import.meta.url));
import { mkdtemp,chmod,rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { registerTenantPool } from './tenant-pool';
import { createWorkloadPool } from './workload-pool';
import { TenantContext,configureTenantContext,tenantContext } from '../workspace/tenant-context';
import { NextRequest } from 'next/server';
import { POST as routeSignIn,GET as routeSession,DELETE as routeSignOut } from '../../app/api/workspace/session/route';
import { GET as routeAgents } from '../../app/api/workspace/agents/route';
import { signIn, throttle, passwordHash } from '../workspace/auth';
import { memberSession, digest } from '../workspace/identity';
import { recoveryFence, quarantineRestore } from './recovery';
import { TemporalOutbox } from '../../runtime/temporal/outbox';
import { namedActorCurrent, connectorMembershipCurrent } from '../workspace/membership-authority';
import {beforeAll,afterAll,expect,it,vi} from 'vitest';
import {Pool} from 'pg';
import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
const suffix=randomBytes(8).toString('hex'),schema=`ll_rls_proto_${suffix}`;
const names={workerB:`ll_rls_wb_${suffix}`,worker:`ll_rls_w_${suffix}`,a:`ll_rls_a_${suffix}`,b:`ll_rls_b_${suffix}`,unmapped:`ll_rls_u_${suffix}`};
const passwords={workerB:randomBytes(32).toString('base64url'),worker:randomBytes(32).toString('base64url'),a:randomBytes(32).toString('base64url'),b:randomBytes(32).toString('base64url'),unmapped:randomBytes(32).toString('base64url')};
let broker:Pool,context:TenantContext,admin:Pool,a:Pool,b:Pool,worker:Pool,workerB:Pool,unmapped:Pool,adminName:string,testUrl:string;
const rolesCreated=new Set<string>();const brokerName=`ll_rls_broker_${suffix}`,definerName=`ll_rls_definer_${suffix}`,brokerPassword=randomBytes(32).toString('base64url');
const baseA=randomUUID(),baseB=randomUUID(),plans:Record<string,string>={},scopes:Record<string,string>={},epochs={a:randomUUID(),b:randomUUID()},sessionTokens:Record<string,string>={},legacyAction=randomUUID(),build='ack-'+'a'.repeat(64);
function connection(key:keyof typeof names){const u=new URL(testUrl);u.username=names[key];u.password=passwords[key];return new Pool({connectionString:u.href,options:`-c search_path=${schema}`,max:1,connectionTimeoutMillis:5000});}
async function createRole(key:keyof typeof names){await admin.query(`CREATE ROLE ${names[key]} LOGIN PASSWORD '${passwords[key]}' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);rolesCreated.add(names[key]);}
async function grant(key:keyof typeof names){
 await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${names[key]}`);
 const tables=(await admin.query("SELECT tablename FROM pg_tables WHERE schemaname=$1 AND tablename NOT IN ('ll_runtime_workspace_bindings','ll_named_subject_presence','ll_access_attempts','ll_enquiry_revisions') AND NOT ($2::boolean AND tablename IN ('ll_sessions','ll_tenant_access_attempts','ll_members'))",[schema,key.startsWith('worker')])).rows;
 for(const {tablename}of tables)await admin.query(`GRANT SELECT ON ${schema}.${tablename} TO ${names[key]}`);
 await admin.query(`GRANT UPDATE ON ${schema}.ll_orgs,${schema}.ll_agents TO ${names[key]}`);
 if(!key.startsWith('worker')) {await admin.query(`GRANT SELECT(org_id,parent_id,successor_id,parent_hash,intent_hash,change_hash,lifecycle),INSERT(org_id,parent_id,successor_id,parent_hash,intent_hash,change_hash,lifecycle) ON ${schema}.ll_enquiry_revisions TO ${names[key]}`);await admin.query(`GRANT UPDATE(run_id) ON ${schema}.ll_enquiry_plans TO ${names[key]}`);await admin.query(`GRANT SELECT,INSERT,DELETE ON ${schema}.ll_sessions TO ${names[key]}`);await admin.query(`GRANT SELECT,INSERT,UPDATE ON ${schema}.ll_tenant_access_attempts TO ${names[key]}`);await admin.query(`GRANT INSERT,UPDATE,DELETE ON ${schema}.ll_actions TO ${names[key]}`);await admin.query(`GRANT INSERT ON ${schema}.ll_tokens,${schema}.ll_connector_actions TO ${names[key]}`);await admin.query(`GRANT UPDATE(email) ON ${schema}.ll_members TO ${names[key]}`);}
 else {await admin.query(`GRANT SELECT(email,org_id,name,active),UPDATE(name) ON ${schema}.ll_members TO ${names[key]}`);await admin.query(`GRANT UPDATE ON ${schema}.ll_temporal_dispatch TO ${names[key]}`);await admin.query(`GRANT INSERT ON ${schema}.ll_temporal_record_routes TO ${names[key]}`);await admin.query(`GRANT INSERT,UPDATE ON ${schema}.ll_enquiry_worker_status TO ${names[key]}`);}
 await admin.query(`GRANT EXECUTE ON FUNCTION ${schema}.ll_bound_workspace(),${schema}.ll_named_subject_exists(text),${schema}.ll_runtime_classification() TO ${names[key]}`);
}
async function denied(pool:Pool,sql:string,values:unknown[]=[]){await expect(pool.query(sql,values)).rejects.toMatchObject({code:'42501'});}
beforeAll(async()=>{
 testUrl=process.env.LOOPLABS_TEST_DATABASE_URL||'';expect(testUrl,'Dedicated LOOPLABS_TEST_DATABASE_URL required').not.toBe('');
 const target=new URL(testUrl);expect(['127.0.0.1','localhost']).toContain(target.hostname);expect(target.pathname.length).toBeGreaterThan(1);
 admin=new Pool({connectionString:testUrl,options:`-c search_path=${schema}`,max:1,connectionTimeoutMillis:5000});adminName=(await admin.query('SELECT current_user name')).rows[0].name;
 await admin.query(`CREATE SCHEMA ${schema}`);
 await admin.query(`SET search_path=${schema}`);
 await admin.query('CREATE TABLE ll_migrations(version integer PRIMARY KEY,digest text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
 const files=JSON.parse(await readFile(new URL('../../install-order.json',import.meta.url),'utf8')) as string[];
 for(const file of files)await admin.query(await readFile(new URL('../../'+file,import.meta.url),'utf8'));
 await admin.query(`INSERT INTO ${schema}.ll_orgs(id) VALUES('a'),('b')`);
 await admin.query(`INSERT INTO ${schema}.ll_agents(org_id,id) VALUES('a','agent'),('b','agent')`);
 for(const [org,id]of [['a',baseA],['b',baseB]])await admin.query(`INSERT INTO ${schema}.ll_actions(org_id,id,agent_id,discount,expected_version,policy_version,payload_hash,state,reason) VALUES($1,$2,'agent',1,1,1,'fixture','held','fixture')`,[org,id]);

 for(const org of ['a','b']) {
  await admin.query(`INSERT INTO ${schema}.ll_members(email,org_id,name,password_hash) VALUES($1,$2,'Fixture','fixture')`,[`${org}@tenant.test`,org]);
  await admin.query(`INSERT INTO ${schema}.ll_workspace_recovery(org_id,epoch) VALUES($1,$2)`,[org,epochs[org as 'a'|'b']]);
  await admin.query(`INSERT INTO ${schema}.ll_tokens(hash,org_id,subject,role) VALUES($1,$2,'enquiry-temporal','worker')`,[`worker-${org}`,org]);
  await admin.query(`INSERT INTO ${schema}.ll_tokens(hash,org_id,subject,role) VALUES($1,$2,$3,'operator')`,[`${org}-legacy-foreign`,org,org==='a'?'b@tenant.test':'a@tenant.test']);
  const id=randomUUID(),scope=randomUUID();plans[org]=id;scopes[org]=scope;
  await admin.query(`INSERT INTO ${schema}.ll_workflow_runs(org_id,id,created_by) VALUES($1,$2,$3)`,[org,id,`${org}@tenant.test`]);
  await admin.query(`INSERT INTO ${schema}.ll_enquiry_plans(org_id,id,fixture_id,source_version,policy_versions,plan,plan_hash,created_by,run_id) VALUES($1,$2,'fixture','v1','{}','{}','hash',$3,$2)`,[org,id,`${org}@tenant.test`]);
  await admin.query(`INSERT INTO ${schema}.ll_enquiry_dispatch(org_id,plan_id,created_by) VALUES($1,$2,$3)`,[org,id,`${org}@tenant.test`]);
  await admin.query(`INSERT INTO ${schema}.ll_temporal_dispatch(org_id,plan_id,workflow_id,plan_hash,plan_version,connector_version) VALUES($1,$2,$3,'hash','acknowledgement-1','private-record-twin-2')`,[org,id,`workflow-${org}-${suffix}`]);
  await admin.query(`INSERT INTO ${schema}.ll_connector_scopes(org_id,id,contact_id,recipient,binding_id,contract_version,created_by) VALUES($1,$2,'1002','customer@example.test',$3,'private-record-twin-2',$4)`,[org,scope,(org==='a'?'a':'b').repeat(64),`${org}@tenant.test`]);
 }
 await admin.query(`INSERT INTO ${schema}.ll_connector_policies(org_id,connector) VALUES('a','crm'),('b','crm')`);
 await admin.query(`INSERT INTO ${schema}.ll_tokens(hash,org_id,subject,role) VALUES('future-legacy','a','future@tenant.test','operator')`);
 await admin.query(`INSERT INTO ${schema}.ll_connector_actions(org_id,id,agent_id,connector,payload,payload_hash,policy_version,state,reason,proposed_by) VALUES('a',$1,'agent','crm','{}','hash',1,'held','fixture','future@tenant.test')`,[legacyAction]);
 await admin.query(`INSERT INTO ${schema}.ll_temporal_worker_builds(worker_build_id,image_id,workflow_sha256,service_sha256,lock_sha256) VALUES($1,$2,$3,$3,$3)`,[build,'sha256:'+'a'.repeat(64),'a'.repeat(64)]);
 await admin.query((await readFile(new URL('./tenant-boundary-prototype-schema.sql',import.meta.url),'utf8')).replaceAll('__SCHEMA__',schema));
 for(const key of ['a','b','worker','workerB','unmapped'] as const){await createRole(key);await grant(key);}
 for(const key of ['a','b','worker','workerB'] as const)await admin.query(`INSERT INTO ${schema}.ll_runtime_workspace_bindings(login_oid,login_name,database_oid,database_name,org_id,purpose) SELECT r.oid,r.rolname,d.oid,d.datname,$2,$3 FROM pg_roles r CROSS JOIN pg_database d WHERE r.rolname=$1 AND d.datname=current_database()`,[names[key],key==='worker'?'a':key==='workerB'?'b':key,key.startsWith('worker')?'worker':'web']);
 a=connection('a');b=connection('b');worker=connection('worker');workerB=connection('workerB');unmapped=connection('unmapped');
 // Test-only owner-definer probe to ensure token checks use authenticated session
 // identity even when current_user changes. Not a production enrollment API.
 await admin.query(`CREATE FUNCTION ${schema}.ll_test_definer_token_insert(workspace text,kind text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN INSERT INTO ${schema}.ll_tokens(hash,org_id,subject,role) VALUES(gen_random_uuid()::text,workspace,'probe',kind); END $$`);
 await admin.query(`REVOKE ALL ON FUNCTION ${schema}.ll_test_definer_token_insert(text,text) FROM PUBLIC`);
 await admin.query(`GRANT EXECUTE ON FUNCTION ${schema}.ll_test_definer_token_insert(text,text) TO ${names.a},${names.worker}`);
 await admin.query(`CREATE ROLE ${definerName} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS`);rolesCreated.add(definerName);
 await admin.query(`CREATE ROLE ${brokerName} LOGIN PASSWORD '${brokerPassword}' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);rolesCreated.add(brokerName);
 await admin.query(`GRANT USAGE,CREATE ON SCHEMA ${schema} TO ${definerName}`);await admin.query(`GRANT SELECT ON ${schema}.ll_members,${schema}.ll_sessions,${schema}.ll_tokens,${schema}.ll_named_subject_presence TO ${definerName}`);await admin.query(`GRANT SELECT,INSERT,UPDATE ON ${schema}.ll_access_attempts TO ${definerName}`);
 for(const fn of ['ll_login_workspace(text)','ll_credential_workspace(text)','ll_global_admit(text,text)'])await admin.query(`ALTER FUNCTION ${schema}.${fn} OWNER TO ${definerName}`);
 await admin.query(`REVOKE CREATE ON SCHEMA ${schema} FROM ${definerName}`);await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${brokerName}`);
 await admin.query(`GRANT EXECUTE ON FUNCTION ${schema}.ll_login_workspace(text),${schema}.ll_credential_workspace(text),${schema}.ll_global_admit(text,text) TO ${brokerName}`);
 const u=new URL(testUrl);u.username=brokerName;u.password=brokerPassword;broker=new Pool({connectionString:u.href,max:1,options:`-c search_path=${schema}`});
 for(const [pool,org,key,purpose]of [[a,'a','a','web'],[b,'b','b','web'],[worker,'a','worker','worker'],[workerB,'b','workerB','worker']]as const)await registerTenantPool(pool,{org,epoch:epochs[org],role:names[key],schema,purpose});
 context=await TenantContext.create(broker,new Map([['a',a],['b',b]]),schema,brokerName);configureTenantContext(context);


},20000);
afterAll(async()=>{
 await Promise.all([a,b,worker,workerB,unmapped,broker].filter(Boolean).map(p=>p.end()));
 if(admin){await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);for(const role of rolesCreated){await admin.query(`DROP OWNED BY ${role}`);await admin.query(`DROP ROLE ${role}`);}await admin.end();}
},20000);
it('uses actual nonprivileged LOGIN identity and exposes only its workspace without a supplied org filter',async()=>{
 for(const [pool,key]of [[a,'a'],[b,'b']] as const){expect((await pool.query('SELECT session_user name')).rows[0].name).toBe(names[key]);expect((await pool.query(`SELECT ${schema}.ll_bound_workspace() org`)).rows[0].org).toBe(key);expect((await pool.query(`SELECT id FROM ${schema}.ll_orgs`)).rows).toEqual([{id:key}]);expect((await pool.query(`SELECT org_id FROM ${schema}.ll_actions`)).rows).toEqual([{org_id:key}]);}
 const facts=(await a.query('SELECT rolsuper,rolcreaterole,rolcreatedb,rolbypassrls,rolreplication FROM pg_roles WHERE rolname=session_user')).rows[0];expect(Object.values(facts).every(v=>v===false)).toBe(true);
});
it('cannot use GUCs, search_path, temporary shadow tables or role/session spoofing to change workspace',async()=>{
 await a.query("SET app.org_id='b'");await a.query("SET looplabs.workspace='b'");await a.query('SET search_path=pg_temp,public');
 await a.query('CREATE TEMP TABLE ll_runtime_workspace_bindings(login_name text,org_id text)');await a.query("INSERT INTO ll_runtime_workspace_bindings VALUES(session_user,'b')");
 expect((await a.query(`SELECT ${schema}.ll_bound_workspace() org`)).rows[0].org).toBe('a');expect((await a.query(`SELECT org_id FROM ${schema}.ll_actions`)).rows.every(r=>r.org_id==='a')).toBe(true);
 await denied(a,`SET ROLE ${names.b}`);await denied(a,`SET ROLE ${adminName}`);await denied(a,`SET SESSION AUTHORIZATION ${names.b}`);
 await a.query('SET row_security=off');await denied(a,`SELECT * FROM ${schema}.ll_actions`);await a.query('RESET row_security');
});
it('rejects foreign inserts/org reassignment and leaves foreign update/delete bytes unchanged',async()=>{
 const before=(await b.query(`SELECT * FROM ${schema}.ll_actions WHERE id=$1`,[baseB])).rows;
 expect((await a.query(`UPDATE ${schema}.ll_actions SET reason='spoof' WHERE org_id='b'`)).rowCount).toBe(0);expect((await a.query(`DELETE FROM ${schema}.ll_actions WHERE org_id='b'`)).rowCount).toBe(0);
 await expect(a.query(`UPDATE ${schema}.ll_actions SET org_id='b' WHERE id=$1`,[baseA])).rejects.toMatchObject({code:'23514'});
 await denied(a,`UPDATE ${schema}.ll_agents SET org_id='b' WHERE id='agent'`);
 await denied(a,`INSERT INTO ${schema}.ll_actions(org_id,id,agent_id,discount,expected_version,policy_version,payload_hash,state,reason) VALUES('b',$1,'agent',1,1,1,'fixture','held','foreign')`,[randomUUID()]);
 expect((await b.query(`SELECT * FROM ${schema}.ll_actions WHERE id=$1`,[baseB])).rows).toEqual(before);
});
it('protects role mapping/resolver/policies and denies privilege escalation',async()=>{
 await denied(a,`SELECT * FROM ${schema}.ll_runtime_workspace_bindings`);await denied(a,`UPDATE ${schema}.ll_runtime_workspace_bindings SET org_id='b'`);
 await denied(a,`CREATE FUNCTION ${schema}.spoof() RETURNS text LANGUAGE sql AS $$ SELECT 'b' $$`);await denied(a,`ALTER TABLE ${schema}.ll_actions DISABLE ROW LEVEL SECURITY`);
 const probe=`ll_rls_probe_${suffix}`;let roleError:unknown;try{await a.query(`CREATE ROLE ${probe}`);rolesCreated.add(probe);}catch(error){roleError=error;}expect(roleError).toMatchObject({code:'42501'});await expect(a.query(`INSERT INTO ${schema}.ll_tokens(hash,org_id,subject,role) VALUES('never','a','spoof','operator')`)).rejects.toMatchObject({code:'23514'});
 const functionRow=(await admin.query('SELECT p.proconfig,p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.proname=$2',[schema,'ll_bound_workspace'])).rows[0];expect(functionRow).toEqual({proconfig:['search_path=pg_catalog'],prosecdef:true});
});
it('fails closed for an unmapped login with otherwise equal representative grants',async()=>{
 expect((await unmapped.query(`SELECT ${schema}.ll_bound_workspace() org`)).rows[0].org).toBeNull();expect((await unmapped.query(`SELECT * FROM ${schema}.ll_orgs`)).rows).toEqual([]);expect((await unmapped.query(`SELECT * FROM ${schema}.ll_actions`)).rows).toEqual([]);await denied(unmapped,`INSERT INTO ${schema}.ll_orgs(id) VALUES('unmapped')`);
});
it('retains legitimate own-tenant action reads/writes and FORCE policies for both representative tables',async()=>{
 const id=randomUUID();await a.query(`INSERT INTO ${schema}.ll_actions(org_id,id,agent_id,discount,expected_version,policy_version,payload_hash,state,reason) VALUES('a',$1,'agent',1,1,1,'fixture','held','new')`,[id]);expect((await a.query(`UPDATE ${schema}.ll_actions SET reason='own' WHERE id=$1 RETURNING reason`,[id])).rows).toEqual([{reason:'own'}]);expect((await b.query(`SELECT * FROM ${schema}.ll_actions WHERE id=$1`,[id])).rows).toEqual([]);await expect(a.query(`DELETE FROM ${schema}.ll_actions WHERE id=$1`,[id])).rejects.toMatchObject({code:'23514'});
 expect((await admin.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname IN ($2,$3)',[schema,'ll_orgs','ll_actions'])).rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity)).toBe(true);
});
it('installs the exact current 45-table inventory with every org-bearing table FORCE scoped, special cases explicit',async()=>{
 const inventory=JSON.parse(await readFile(new URL('./test-fixtures/tenant-base-table-inventory.json',import.meta.url),'utf8'));
 const catalog=(await admin.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind='r'",[schema])).rows;
 expect(inventory.tables).toHaveLength(45);for(const table of inventory.tables){const row=catalog.find(r=>r.relname===table.table);expect(row).toBeTruthy();if(['org-id','direct-org','member-join'].includes(table.prototypePolicy))expect(row).toMatchObject({relrowsecurity:true,relforcerowsecurity:true});}
 await denied(a,`SELECT * FROM ${schema}.ll_access_attempts`);await denied(worker,`SELECT * FROM ${schema}.ll_access_attempts`);
});
it('foreign named membership remains visible only as a refusal bit, never a legacy identity or private attributes',async()=>{
 expect((await a.query(`SELECT email FROM ${schema}.ll_members WHERE email='b@tenant.test'`)).rows).toEqual([]);
 expect((await a.query(`SELECT ${schema}.ll_named_subject_exists('b@tenant.test') present`)).rows[0].present).toBe(true);
 await expect(a.query(`SELECT ${schema}.ll_member_snapshot23('a','b@tenant.test','operator')`)).rejects.toMatchObject({code:'23514'});
 const c=await a.connect();try{expect(await namedActorCurrent(c,{orgId:'a',subject:'b@tenant.test',role:'agent',tokenHash:'a-legacy-foreign'})).toBe(false);}finally{c.release();}
 await denied(a,`SELECT * FROM ${schema}.ll_named_subject_presence`);await denied(a,`DELETE FROM ${schema}.ll_named_subject_presence`);await denied(unmapped,`SELECT ${schema}.ll_named_subject_exists('b@tenant.test')`);
 await expect(a.query(`SELECT ${schema}.ll_named_subject_exists(repeat('x',255))`)).rejects.toMatchObject({code:'42501'});
 expect((await a.query(`SELECT ${schema}.ll_member_snapshot23('a','a@tenant.test',NULL) snapshot`)).rows[0].snapshot).toMatchObject({kind:'member',subject:'a@tenant.test',generation:'1'});
});
it('global membership presence is authoritative for actual connector insert and an earlier legacy proposal',async()=>{
 const insert=`INSERT INTO ${schema}.ll_connector_actions(org_id,id,agent_id,connector,payload,payload_hash,policy_version,state,reason,proposed_by) VALUES('a',$1,'agent','crm','{}','hash',1,'held','fixture',$2)`;
 await expect(a.query(insert,[randomUUID(),'b@tenant.test'])).rejects.toMatchObject({code:'23514'});
 const id=randomUUID();await a.query(insert,[id,'a@tenant.test']);expect((await a.query(`SELECT membership_proposal->'requester' requester FROM ${schema}.ll_connector_actions WHERE id=$1`,[id])).rows[0].requester).toMatchObject({kind:'member',subject:'a@tenant.test',generation:'1'});
 await admin.query(`INSERT INTO ${schema}.ll_members(email,org_id,name,password_hash) VALUES('future@tenant.test','b','Foreign','secret-unexposed')`);
 const c=await a.connect();try{const action=(await c.query(`SELECT * FROM ${schema}.ll_connector_actions WHERE id=$1`,[legacyAction])).rows[0];expect(await connectorMembershipCurrent(c,'a',action,false)).toBe(false);}finally{c.release();}
 expect((await a.query(`SELECT email FROM ${schema}.ll_members WHERE email='future@tenant.test'`)).rows).toEqual([]);
});
it('presence lock contention refuses instead of silently treating the subject as absent',async()=>{
 const hold=await admin.connect();try{await hold.query('BEGIN');await hold.query(`SELECT subject FROM ${schema}.ll_named_subject_presence WHERE subject='b@tenant.test' FOR UPDATE`);await expect(a.query(`SELECT ${schema}.ll_named_subject_exists('b@tenant.test')`)).rejects.toMatchObject({code:'55P03'});}finally{await hold.query('ROLLBACK');hold.release();}
});
it('same-tenant runtime may enroll only agent tokens; renamed scoped roles cannot mint operator or worker authority',async()=>{
 await a.query(`INSERT INTO ${schema}.ll_tokens(hash,org_id,subject,role) VALUES($1,'a','new-agent','agent')`,[randomUUID()]);
 for(const role of ['operator','worker'])await expect(a.query(`INSERT INTO ${schema}.ll_tokens(hash,org_id,subject,role) VALUES($1,'a','spoof',$2)`,[randomUUID(),role])).rejects.toMatchObject({code:'23514'});
 await expect(a.query(`INSERT INTO ${schema}.ll_tokens(hash,org_id,subject,role) VALUES($1,'b','foreign','agent')`,[randomUUID()])).rejects.toMatchObject({code:'23514'});
 await denied(worker,`INSERT INTO ${schema}.ll_tokens(hash,org_id,subject,role) VALUES($1,'a','spoof','operator')`,[randomUUID()]);
});
it('actual worker route admission reads owner-only active build, preserves tenant scope and forbids enrollment/drain authority',async()=>{
 const insert=`INSERT INTO ${schema}.ll_temporal_record_routes(org_id,plan_id,scope_id,worker_build_id,scope_version,binding_id) VALUES($1,$2,$3,$4,1,$5)`;
 await worker.query(insert,['a',plans.a,scopes.a,build,'a'.repeat(64)]);
 expect((await worker.query(`SELECT org_id FROM ${schema}.ll_temporal_record_routes`)).rows).toEqual([{org_id:'a'}]);
 await workerB.query(insert,['b',plans.b,scopes.b,build,'b'.repeat(64)]);expect((await workerB.query(`SELECT org_id FROM ${schema}.ll_temporal_record_routes`)).rows).toEqual([{org_id:'b'}]);
 await denied(worker,insert,['b',plans.b,scopes.b,build,'b'.repeat(64)]);
 await denied(worker,`UPDATE ${schema}.ll_temporal_worker_builds SET state='draining',draining_at=now()`);
 await denied(worker,`INSERT INTO ${schema}.ll_temporal_worker_builds(worker_build_id,image_id,workflow_sha256,service_sha256,lock_sha256) VALUES($1,$2,$3,$3,$3)`,['ack-'+'b'.repeat(64),'sha256:'+'b'.repeat(64),'b'.repeat(64)]);
 await worker.query(`INSERT INTO ${schema}.ll_enquiry_worker_status(org_id,last_tick) VALUES('a',now())`);
 await denied(worker,`INSERT INTO ${schema}.ll_enquiry_worker_status(org_id,last_tick) VALUES('b',now())`);
 const next=randomUUID();await admin.query(`INSERT INTO ${schema}.ll_workflow_runs(org_id,id,created_by) VALUES('a',$1,'a@tenant.test')`,[next]);
 await admin.query(`INSERT INTO ${schema}.ll_enquiry_plans(org_id,id,fixture_id,source_version,policy_versions,plan,plan_hash,created_by,run_id) VALUES('a',$1,'fixture','v1','{}','{}','hash','a@tenant.test',$1)`,[next]);
 await admin.query(`INSERT INTO ${schema}.ll_enquiry_dispatch(org_id,plan_id,created_by) VALUES('a',$1,'a@tenant.test')`,[next]);
 await admin.query(`INSERT INTO ${schema}.ll_temporal_dispatch(org_id,plan_id,workflow_id,plan_hash,plan_version,connector_version) VALUES('a',$1,$2,'hash','acknowledgement-1','private-record-twin-2')`,[next,`next-${suffix}`]);
 await admin.query(`UPDATE ${schema}.ll_temporal_worker_builds SET state='draining',draining_at=now() WHERE worker_build_id=$1`,[build]);
 await expect(worker.query(insert,['a',next,scopes.a,build,'a'.repeat(64)])).rejects.toMatchObject({code:'23514'});
 expect((await worker.query(`SELECT * FROM ${schema}.ll_temporal_record_routes WHERE plan_id=$1`,[next])).rows).toEqual([]);
});
it('non-bypass table owner is denied by FORCE RLS; explicit separate admin maintenance succeeds without lending role membership',async()=>{
 const ownerName=`ll_rls_owner_${suffix}`,password=randomBytes(32).toString('base64url');
 await admin.query(`CREATE ROLE ${ownerName} LOGIN PASSWORD '${password}' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);rolesCreated.add(ownerName);
 await admin.query(`GRANT USAGE,CREATE ON SCHEMA ${schema} TO ${ownerName}`);await admin.query(`GRANT EXECUTE ON FUNCTION ${schema}.ll_bound_workspace() TO ${ownerName}`);
 await admin.query(`ALTER TABLE ${schema}.ll_actions OWNER TO ${ownerName}`);await admin.query(`REVOKE CREATE ON SCHEMA ${schema} FROM ${ownerName}`);
 const u=new URL(testUrl);u.username=ownerName;u.password=password;const maint=new Pool({connectionString:u.href,max:1,options:`-c search_path=${schema}`});
 try {
  expect((await maint.query(`SELECT * FROM ${schema}.ll_actions`)).rows).toEqual([]);
  await maint.query('SET row_security=off');await denied(maint,`SELECT * FROM ${schema}.ll_actions`);
  expect((await admin.query(`SELECT count(DISTINCT org_id)::int n FROM ${schema}.ll_actions`)).rows[0].n).toBe(2);
  // Explicit offline maintenance authority, never mapped or reachable from runtime.
  await admin.query(`ALTER ROLE ${ownerName} BYPASSRLS`);
  expect((await maint.query(`SELECT count(DISTINCT org_id)::int n FROM ${schema}.ll_actions`)).rows[0].n).toBe(2);
  await denied(a,`SET ROLE ${ownerName}`);await denied(worker,`SET ROLE ${ownerName}`);
  for(const role of [names.a,names.b,names.worker,names.workerB])expect((await admin.query('SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=$1)',[role])).rows).toEqual([]);
 }finally{await maint.end();await admin.query(`ALTER TABLE ${schema}.ll_actions OWNER TO ${adminName}`);}
});
it('reuses actual sign-in and session services with tenant-bound throttle state and foreign session refusal',async()=>{
 const pwd='private-fixture-password';await admin.query(`UPDATE ${schema}.ll_members SET password_hash=$1`,[passwordHash(pwd)]);
 sessionTokens.a=await signIn(a,{email:'a@tenant.test',password:pwd});sessionTokens.b=await signIn(b,{email:'b@tenant.test',password:pwd});
 vi.stubEnv('LOOPLABS_RECOVERY_EPOCH',epochs.a);try{expect(await memberSession(a,sessionTokens.a)).toMatchObject({orgId:'a',subject:'a@tenant.test',role:'operator'});expect(await memberSession(a,sessionTokens.b)).toBeNull();}finally{vi.unstubAllEnvs();}
 await expect(signIn(a,{email:'b@tenant.test',password:pwd})).rejects.toMatchObject({status:401});
 await denied(a,`INSERT INTO ${schema}.ll_sessions(hash,email,expires_at) VALUES($1,'b@tenant.test',now()+interval '1 hour')`,[randomUUID()]);
 const c=await a.connect(),other=await b.connect();try{expect(await throttle(c,'same-business-key',1,60)).toBe(true);expect(await throttle(c,'same-business-key',1,60)).toBe(false);expect(await throttle(other,'same-business-key',1,60)).toBe(true);}finally{c.release();other.release();}
 expect((await a.query(`SELECT org_id,count FROM ${schema}.ll_tenant_access_attempts WHERE key='same-business-key'`)).rows).toEqual([{org_id:'a',count:2}]);
 await denied(a,`INSERT INTO ${schema}.ll_tenant_access_attempts(org_id,key,count) VALUES('b','foreign-spoof',1)`);await denied(worker,`SELECT * FROM ${schema}.ll_sessions`);await denied(worker,`INSERT INTO ${schema}.ll_tenant_access_attempts(key) VALUES('worker-spoof')`);
});
it('token enrollment classification survives SECURITY DEFINER current_user changes and rejects foreign/scoped worker authority',async()=>{
 expect((await a.query(`SELECT ${schema}.ll_runtime_classification() classification`)).rows[0].classification).toBe('web');
 await a.query(`SELECT ${schema}.ll_test_definer_token_insert('a','agent')`);
 for(const [pool,org,kind]of [[a,'a','operator'],[a,'a','worker'],[a,'b','agent'],[worker,'a','agent']]as const)await expect(pool.query(`SELECT ${schema}.ll_test_definer_token_insert($1,$2)`,[org,kind])).rejects.toMatchObject({code:'23514'});
});
it('existing scheduler outbox leases/updates only its tenant with real SQL; simulated Temporal call carries actual pinned routing',async()=>{
 await admin.query(`UPDATE ${schema}.ll_temporal_dispatch SET next_attempt=now()+interval '1 day' WHERE plan_id<>$1`,[plans.a]);
 const calls:unknown[]=[];const client={workflow:{start:async(name:string,options:unknown)=>{calls.push({name,options});}}};
 const before=(await admin.query(`SELECT * FROM ${schema}.ll_temporal_dispatch WHERE org_id='b'`)).rows;
 vi.stubEnv('LOOPLABS_RECOVERY_EPOCH',epochs.a);try{
  const outbox=new TemporalOutbox(worker,build);expect(await outbox.tick({orgId:'a',subject:'enquiry-temporal',role:'worker',tokenHash:'worker-a'},client as never,'tenant-a')).toBe(1);
  await expect(outbox.tick({orgId:'b',subject:'enquiry-temporal',role:'worker',tokenHash:'worker-b'},client as never,'tenant-b')).rejects.toMatchObject({status:403});
 }finally{vi.unstubAllEnvs();}
 expect(calls).toHaveLength(1);expect(calls[0]).toMatchObject({name:'pinnedAcknowledgement',options:{workflowId:`workflow-a-${suffix}`,taskQueue:'tenant-a',versioningOverride:{pinnedTo:{buildId:build}}}});
 expect((await admin.query(`SELECT state,attempts,lease_token FROM ${schema}.ll_temporal_dispatch WHERE org_id='a' AND plan_id=$1`,[plans.a])).rows[0]).toMatchObject({state:'started',attempts:1,lease_token:null});
 expect((await admin.query(`SELECT * FROM ${schema}.ll_temporal_dispatch WHERE org_id='b'`)).rows).toEqual(before);
});
it('actual Next session and agent route handlers select only independently authenticated server-owned pools',async()=>{
 const request=(path:string,method='GET',value?:unknown,token?:string,extra:Record<string,string>={})=>new NextRequest(`https://looplabs.run${path}`,{method,headers:{...(method==='POST'||method==='DELETE'?{'origin':'https://looplabs.run'}:{}),...(value?{'content-type':'application/json'}:{}),...(token?{'cookie':`looplabs_workspace_session=${token}`} :{}),...extra},...(value?{body:JSON.stringify(value)}:{})});
 const resp=await routeSignIn(request('/api/workspace/session','POST',{email:'a@tenant.test',password:'private-fixture-password'},undefined,{'x-workspace-id':'b','x-tenant-id':'b'}));expect(resp.status).toBe(200);expect(resp.headers.get('cache-control')).toBe('no-store');expect(resp.headers.get('set-cookie')).toContain('HttpOnly');expect(resp.headers.get('set-cookie')).toContain('SameSite=strict');
 const cookie=resp.headers.get('set-cookie');expect(cookie).toMatch(/(?:^|[,;]\s*)looplabs_workspace_session=[a-zA-Z0-9_-]{32,256}(?:;|$)/);const token=/(?:^|[,;]\s*)looplabs_workspace_session=([a-zA-Z0-9_-]{32,256})(?:;|$)/.exec(cookie!)![1];
 const own=await routeSession(request('/api/workspace/session','GET',undefined,token,{'x-workspace-id':'b'}));expect(own.status).toBe(200);expect(await own.json()).toMatchObject({email:'a@tenant.test'});
 const agents=await routeAgents(request('/api/workspace/agents?org=b','GET',undefined,token,{'x-workspace-id':'b'}));expect(agents.status).toBe(200);expect(agents.headers.get('cache-control')).toBe('no-store');expect((await agents.json()).owners.every((owner:{email:string})=>owner.email==='a@tenant.test')).toBe(true);
 await expect(context.member(sessionTokens.b)).resolves.toMatchObject({actor:{orgId:'b',subject:'b@tenant.test'}});
 expect((await routeSignIn(request('/api/workspace/session','POST',{email:'a@tenant.test',password:'private-fixture-password',orgId:'b'}))).status).toBe(400);
 expect((await routeSignIn(request('/api/workspace/session','POST',{email:'a@tenant.test',password:'private-fixture-password'},undefined,{'origin':'https://foreign.test'}))).status).toBe(403);
 const legacy=randomBytes(32).toString('base64url');await admin.query(`INSERT INTO ${schema}.ll_tokens(hash,org_id,subject,role) VALUES($1,'a','b@tenant.test','operator')`,[digest(legacy)]);
 expect((await routeAgents(request('/api/workspace/agents','GET',undefined,legacy))).status).toBe(401);
 expect((await routeSession(request('/api/workspace/session','GET',undefined,'malformed'))).status).toBe(401);
 expect((await routeSignOut(request('/api/workspace/session','DELETE',undefined,token))).status).toBe(200);expect((await routeSession(request('/api/workspace/session','GET',undefined,token))).status).toBe(401);
});
it('pool registration rejects wrong org, alternate login/purpose, stale epoch and live owner binding drift',async()=>{
 for(const expected of [{org:'b',role:names.a,purpose:'web' as const,epoch:epochs.b},{org:'a',role:names.b,purpose:'web' as const,epoch:epochs.a},{org:'a',role:names.a,purpose:'worker' as const,epoch:epochs.a},{org:'a',role:names.a,purpose:'web' as const,epoch:randomUUID()}]){const pool=connection('a');try{await expect(registerTenantPool(pool,{...expected,schema})).rejects.toMatchObject({status:503});await expect(recoveryFence(pool,'a',epochs.a)).rejects.toMatchObject({status:503});}finally{await pool.end();}}
 await expect(TenantContext.create(a,new Map([['a',a]]),schema,names.a)).rejects.toMatchObject({status:503});
 await admin.query(`GRANT ${definerName} TO ${names.a}`);try{await expect(context.member(sessionTokens.a)).rejects.toMatchObject({status:503});}finally{await admin.query(`REVOKE ${definerName} FROM ${names.a}`);}
 await admin.query(`GRANT CREATE ON SCHEMA ${schema} TO ${names.a}`);try{await expect(recoveryFence(a,'a')).rejects.toMatchObject({status:503});}finally{await admin.query(`REVOKE CREATE ON SCHEMA ${schema} FROM ${names.a}`);}
 await admin.query(`GRANT CREATE ON SCHEMA ${schema} TO ${names.a}`);await admin.query(`ALTER TABLE ${schema}.ll_actions OWNER TO ${names.a}`);await admin.query(`REVOKE CREATE ON SCHEMA ${schema} FROM ${names.a}`);try{await expect(context.member(sessionTokens.a)).rejects.toMatchObject({status:503});}finally{await admin.query(`ALTER TABLE ${schema}.ll_actions OWNER TO ${adminName}`);await grant('a');}
 await admin.query(`UPDATE ${schema}.ll_runtime_workspace_bindings SET org_id='b' WHERE login_name=$1`,[names.a]);try{await expect(context.member(sessionTokens.a)).rejects.toMatchObject({status:503});await expect(recoveryFence(a,'a')).rejects.toMatchObject({status:503});}finally{await admin.query(`UPDATE ${schema}.ll_runtime_workspace_bindings SET org_id='a' WHERE login_name=$1`,[names.a]);}
});
it('fixed global login and planner budgets span tenants, cannot be widened and remain protected from scoped roles',async()=>{
 await admin.query(`DELETE FROM ${schema}.ll_access_attempts`);
 for(let i=0;i<8;i++)expect((await broker.query(`SELECT ${schema}.ll_global_admit('login',$1) allowed`,['a'.repeat(64)])).rows[0].allowed).toBe(true);
 expect((await broker.query(`SELECT ${schema}.ll_global_admit('login',$1) allowed`,['a'.repeat(64)])).rows[0].allowed).toBe(false);
 await admin.query(`DELETE FROM ${schema}.ll_access_attempts`);
 for(let i=0;i<121;i++)expect((await broker.query(`SELECT ${schema}.ll_global_admit('login',$1) allowed`,[digest(`login-user-${i}`)])).rows[0].allowed).toBe(i<120);
 await admin.query(`DELETE FROM ${schema}.ll_access_attempts`);
 await context.admitPlanner(sessionTokens.a);await context.admitPlanner(sessionTokens.b);
 expect((await admin.query(`SELECT count FROM ${schema}.ll_access_attempts WHERE key='chat-global'`)).rows[0].count).toBe(2);
 for(let i=0;i<29;i++)await context.admitPlanner(sessionTokens.a);await expect(context.admitPlanner(sessionTokens.a)).rejects.toMatchObject({status:429});
 await admin.query(`DELETE FROM ${schema}.ll_access_attempts`);
 for(let i=0;i<151;i++)expect((await broker.query(`SELECT ${schema}.ll_global_admit('chat',$1) allowed`,[digest(`chat-user-${i}`)])).rows[0].allowed).toBe(i<150);
 for(const sql of [`SELECT ${schema}.ll_global_admit('unknown',$1)`,`SELECT ${schema}.ll_global_admit('chat','bad')`])await denied(broker,sql,sql.includes('$1')?['b'.repeat(64)]:[]);
 await denied(a,`SELECT ${schema}.ll_global_admit('chat',$1)`,['b'.repeat(64)]);await denied(worker,`SELECT ${schema}.ll_credential_workspace($1)`,['b'.repeat(64)]);await denied(broker,`SELECT password_hash FROM ${schema}.ll_members`);await denied(broker,`UPDATE ${schema}.ll_access_attempts SET count=0`);await denied(broker,`SET ROLE ${definerName}`);
});
it('isolated Node HTTP process runs actual Next routes with two web pools and a distinct worker without env/header tenant switching',async()=>{
 const url=(key:keyof typeof names)=>{const u=new URL(testUrl);u.username=names[key];u.password=passwords[key];return u.href;};const bu=new URL(testUrl);bu.username=brokerName;bu.password=brokerPassword;
 const child=spawn(process.execPath,['--import','tsx',fileURLToPath(new URL('../../scripts/tenant-route-process.ts',import.meta.url))],{cwd:repositoryRoot,env:{PATH:process.env.PATH||'',HOME:process.env.HOME||'',NODE_ENV:'test',LOOPLABS_DURABLE_ORIGIN:'https://looplabs.run'},stdio:['pipe','pipe','pipe']});
 let diagnostic='';child.stderr.on('data',chunk=>{diagnostic+=String(chunk);});const exited=new Promise<number|null>(resolve=>child.once('exit',resolve));
 try{
  const ready=new Promise<number>((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Private process startup timeout')),10000);child.once('exit',()=>{clearTimeout(timer);reject(Error('Private process startup refused'));});child.stdout.on('data',chunk=>{output+=String(chunk);if(output.includes('\n')){clearTimeout(timer);try{resolve(JSON.parse(output.split('\n')[0]).port);}catch{reject(Error('Private readiness malformed'));}}});});
  child.stdin.end(JSON.stringify({a:url('a'),b:url('b'),worker:url('worker'),workerB:url('workerB'),broker:bu.href,roles:names,brokerRole:brokerName,epochs,schema}));
  const port=await ready;const origin=`http://127.0.0.1:${port}`;const login=async(email:string)=>{const r=await fetch(origin+'/api/workspace/session',{method:'POST',headers:{origin:'https://looplabs.run','content-type':'application/json','x-workspace-id':email.startsWith('a')?'b':'a'},body:JSON.stringify({email,password:'private-fixture-password'})});expect(r.status,diagnostic?'Sanitized child diagnostic available':'HTTP login').toBe(200);const cookie=r.headers.get('set-cookie')!.split(';')[0];await r.text();return cookie;};
  const ca=await login('a@tenant.test'),cb=await login('b@tenant.test');for(const [cookie,email]of [[ca,'a@tenant.test'],[cb,'b@tenant.test']]){const r=await fetch(origin+'/api/workspace/session',{headers:{cookie,'x-workspace-id':email.startsWith('a')?'b':'a'}});expect(r.status).toBe(200);expect(await r.json()).toMatchObject({email});}
  for(const path of ['/api/durable','/api/durable/refunds','/api/durable/connectors','/api/durable/workflows','/api/workspace/records','/api/workspace/discovery','/api/workspace/discovery/owners','/api/workspace/enquiries/execution']){const response=await fetch(origin+path,{headers:{'x-workspace-id':'a'}});expect(response.status,path).toBe(401);await response.text();}
  const ownAction=await fetch(origin+'/api/durable?action='+baseA,{headers:{cookie:ca,'x-workspace-id':'b'}});expect(ownAction.status).toBe(200);expect((await ownAction.json()).id).toBe(baseA);
  const foreignAction=await fetch(origin+'/api/durable?action='+baseB,{headers:{cookie:ca,'x-workspace-id':'b'}});expect(foreignAction.status).toBe(404);await foreignAction.text();
  const privateAgents=await fetch(origin+'/api/workspace/agents?org=b',{headers:{cookie:ca,'x-workspace-id':'b'}});expect(privateAgents.status).toBe(200);expect((await privateAgents.json()).owners.every((owner:{email:string})=>owner.email==='a@tenant.test')).toBe(true);
  const rowsB=await fetch(origin+'/_proof/worker-b-scope',{headers:{'x-workspace-id':'a'}});expect(rowsB.status).toBe(200);expect(await rowsB.json()).toEqual([{org_id:'b'}]);
  const rows=await fetch(origin+'/_proof/worker-scope',{headers:{'x-workspace-id':'b'}});expect(rows.status).toBe(200);expect(await rows.json()).toEqual([{org_id:'a'}]);
  // Global chat budget is exhausted by the preceding exact-cap test. The actual
  // enquiry route must stop before connector/model construction.
  const chat=await fetch(origin+'/api/workspace/enquiries',{method:'POST',headers:{cookie:ca,origin:'https://looplabs.run','content-type':'application/json'},body:JSON.stringify({operation:'chat',id:randomUUID(),turns:[]})});expect(chat.status).toBe(429);await chat.text();
 }finally{child.kill('SIGTERM');expect(await exited).toBe(0);}
},20000);
it('scoped worker roles read necessary owner metadata and lock names without password/session/operator authority',async()=>{
 for(const [pool,org]of [[worker,'a'],[workerB,'b']]as const){const own=(await pool.query('SELECT email,org_id,active FROM ll_members')).rows;expect(own.length).toBeGreaterThan(0);expect(own.every(m=>m.org_id===org)).toBe(true);await denied(pool,'SELECT password_hash FROM ll_members');await denied(pool,'SELECT * FROM ll_sessions');await denied(pool,`UPDATE ll_members SET active=false`);await denied(pool,`UPDATE ll_members SET email='spoof@tenant.test'`);await denied(pool,`UPDATE ll_members SET password_hash='spoof'`);}
});
it('owner installer prepares fresh/repeat scoped roles and exclusive private web/workload generations without changing actions or owner credentials',async()=>{
 const parent=await realpath(await mkdtemp(join(tmpdir(),'ll-owner-install-')));await chmod(parent,0o700);const output=join(parent,'generation');const installation='p'+suffix,database=decodeURIComponent(new URL(testUrl).pathname.slice(1));
 const target={transport:{mode:'loopback-plaintext-test-fixture',fixture:'disposable-local-postgres'} as const,installation,schema,database,ownerRole:adminName,tenants:[{org:'a',epoch:epochs.a},{org:'b',epoch:epochs.b}],salesOrg:'a'};
 const actualLedger=await Promise.all([...scopedMigrations,...[[14,'lib/enquiries/worker-admission-schema.sql'],[15,'lib/enquiries/reset-intent-schema.sql'],[16,'lib/workspace/cloud-inventory-schema.sql'],[17,'lib/workspace/cloud-project-schema.sql'],[18,'lib/workspace/cloud-owner-review-schema.sql']]as const].map(async([version,file])=>({version,digest:createHash('sha256').update(await readFile(new URL('../../'+file,import.meta.url))).digest('hex')})));actualLedger.sort((a,b)=>a.version-b.version);
 for(const row of actualLedger)await admin.query(`INSERT INTO ${schema}.ll_migrations(version,digest) VALUES($1,$2)`,[row.version,row.digest]);
 const verify=async(owner:Pool)=>{expect((await owner.query(`SELECT version,digest FROM ${schema}.ll_migrations ORDER BY version`)).rows).toEqual(actualLedger);const tables=(await owner.query(`SELECT c.relname name,c.relrowsecurity rls,c.relforcerowsecurity force,ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum) columns FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','p') ORDER BY c.relname`,[schema])).rows;verifyTenantInventory({tables,migrations:(await owner.query(`SELECT version,digest FROM ${schema}.ll_migrations ORDER BY version`)).rows},actualLedger);};
 let installed:Record<string,string>={};const before=(await admin.query(`SELECT id,payload_hash FROM ${schema}.ll_actions ORDER BY id`)).rows;
 try{
  await expect(installTenantRoles(testUrl,{...target,database:'wrong_target'},output,verify,undefined,{kind:'owned-disposable-fixture'})).rejects.toThrow('Tenant installation refused');await expect(installTenantRoles(testUrl,{...target,tenants:[{org:'a',epoch:randomUUID()}]},output,verify,undefined,{kind:'owned-disposable-fixture'})).rejects.toThrow('Tenant installation refused');
  let publicationReached=false;const preservedNames=[...Object.values(names),brokerName,definerName,adminName];const preservedRoles=async()=>(await admin.query('SELECT rolname,oid::text oid FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname',[preservedNames])).rows;const rolesBefore=await preservedRoles();const assertRolledBack=async(installation:string)=>{expect((await admin.query('SELECT rolname,oid::text oid FROM pg_roles WHERE starts_with(rolname,$1) ORDER BY rolname',[`llti_${installation}_`])).rows).toEqual([]);expect(await preservedRoles()).toEqual(rolesBefore);expect((await admin.query(`SELECT login_name FROM ${schema}.ll_runtime_workspace_bindings WHERE starts_with(login_name,$1)`,[`llti_${installation}_`])).rows).toEqual([]);};await expect(installTenantRoles(testUrl,{...target,installation:'f'+suffix},join(parent,'failed'),verify,async()=>{publicationReached=true;throw Error('PRIVATE publication diagnostic');},{kind:'owned-disposable-fixture'})).rejects.toThrow('Tenant installation refused');await assertRolledBack('f'+suffix);await expect(readFile(join(parent,'failed','web.json'))).rejects.toMatchObject({code:'ENOENT'});
  const failingInstallation='r'+suffix;await admin.query(`CREATE FUNCTION ${schema}.ll_test_install_refusal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.login_name LIKE 'llti_${failingInstallation}%' THEN RAISE EXCEPTION 'dedicated mapping failure'; END IF;RETURN NEW;END $$`);await admin.query(`CREATE TRIGGER ll_test_install_refusal BEFORE INSERT ON ${schema}.ll_runtime_workspace_bindings FOR EACH ROW EXECUTE FUNCTION ${schema}.ll_test_install_refusal()`);
  try{await expect(installTenantRoles(testUrl,{...target,installation:failingInstallation},join(parent,'rollback'),verify,undefined,{kind:'owned-disposable-fixture'})).rejects.toThrow('Tenant installation refused');await assertRolledBack(failingInstallation);await expect(readFile(join(parent,'rollback','web.pending.json'))).rejects.toMatchObject({code:'ENOENT'});}finally{await admin.query(`DROP TRIGGER ll_test_install_refusal ON ${schema}.ll_runtime_workspace_bindings`);await admin.query(`DROP FUNCTION ${schema}.ll_test_install_refusal()`);}
  expect(publicationReached).toBe(true);
  // Actual second owner transaction replaces broker ownership under the same
  // schema lock while failed publication compensates. Cleanup must wait, then
  // refuse rather than restore/drop authority owned by the other transaction.
  const concurrentInstallation='c'+suffix,concurrentOutput=join(parent,'concurrent');const contender=new Pool({connectionString:testUrl,max:1});let released=false;let release:Promise<void>|undefined;
  try{
   await expect(installTenantRoles(testUrl,{...target,installation:concurrentInstallation},concurrentOutput,verify,async()=>{
    await contender.query('BEGIN');await contender.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`tenant-install:${schema}`]);await contender.query(`ALTER FUNCTION ${schema}.ll_login_workspace(text) OWNER TO ${definerName}`);
    release=new Promise<void>((resolve,reject)=>{setTimeout(()=>{contender.query('COMMIT').then(()=>{released=true;resolve();},reject);},100);});throw Error('Private publication fault');
   },{kind:'owned-disposable-fixture'})).rejects.toThrow('cleanup unverified');await release;expect(released).toBe(true);
   expect((await admin.query(`SELECT r.rolname owner FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=to_regprocedure($1)`,[`${schema}.ll_login_workspace(text)`])).rows[0].owner).toBe(definerName);
   expect(await readFile(join(concurrentOutput,'web.pending.json'))).toBeDefined();await expect(readFile(join(concurrentOutput,'ready.json'))).rejects.toMatchObject({code:'ENOENT'});
  }finally{
   await release;await contender.end();for(const fn of ['ll_login_workspace(text)','ll_credential_workspace(text)','ll_global_admit(text,text)'])await admin.query(`ALTER FUNCTION ${schema}.${fn} OWNER TO ${definerName}`);
   for(const role of (await admin.query('SELECT rolname FROM pg_roles WHERE rolname LIKE $1',[`llti_${concurrentInstallation}_%`])).rows){await admin.query(`DELETE FROM ${schema}.ll_runtime_workspace_bindings WHERE login_name=$1`,[role.rolname]);await admin.query(`DROP OWNED BY ${role.rolname}`);await admin.query(`DROP ROLE ${role.rolname}`);}await rm(concurrentOutput,{recursive:true,force:true});
  }
  await admin.query(`CREATE TABLE ${schema}.ll_future_credentials(secret text)`);try{await expect(installTenantRoles(testUrl,target,output,verify,undefined,{kind:'owned-disposable-fixture'})).rejects.toThrow('Tenant installation refused');}finally{await admin.query(`DROP TABLE ${schema}.ll_future_credentials`);}
  await admin.query(`ALTER TABLE ${schema}.ll_sales_requests RENAME TO ll_sales_requests_missing`);try{await expect(installTenantRoles(testUrl,target,output,verify,undefined,{kind:'owned-disposable-fixture'})).rejects.toThrow('Tenant installation refused');}finally{await admin.query(`ALTER TABLE ${schema}.ll_sales_requests_missing RENAME TO ll_sales_requests`);}
  await admin.query(`ALTER TABLE ${schema}.ll_quote_member_generations NO FORCE ROW LEVEL SECURITY`);try{await expect(installTenantRoles(testUrl,target,output,verify,undefined,{kind:'owned-disposable-fixture'})).rejects.toThrow('Tenant installation refused');}finally{await admin.query(`ALTER TABLE ${schema}.ll_quote_member_generations FORCE ROW LEVEL SECURITY`);}
  const first=await installTenantRoles(testUrl,target,output,verify,undefined,{kind:'owned-disposable-fixture'});installed=first.roles;for(const role of Object.keys(installed))rolesCreated.add(role);expect(first).toMatchObject({reused:false,activated:false});expect(Object.keys(installed)).toHaveLength(8);
  const webBytes=await readFile(join(output,'web.json')),workloadBytes=await readFile(join(output,'workloads.json'));expect(webBytes.toString()).not.toContain(testUrl);expect(workloadBytes.toString()).not.toContain(testUrl);expect(webBytes.toString()).not.toContain('_worker_');expect(webBytes.toString()).not.toContain('_scheduler_');expect(workloadBytes.toString()).not.toContain('_broker');
  await expect(bootstrapTenantContext(join(output,'web.json'))).rejects.toMatchObject({status:503});await expect(installTenantRoles(testUrl,target,output,verify)).rejects.toThrow('Tenant installation refused');
  const loaded=await bootstrapTenantContext(join(output,'web.json'),undefined,undefined,undefined,{kind:'owned-disposable-fixture'});try{expect((await loaded.context.member(sessionTokens.b)).actor.orgId).toBe('b');}finally{await loaded.close();}
  const helperOwners=(await admin.query(`SELECT p.oid::text oid,p.proname,p.proowner::text owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.proname=ANY($2::text[]) ORDER BY p.proname`,[schema,['ll_login_workspace','ll_credential_workspace','ll_global_admit']])).rows;
  await expect(installTenantRoles(testUrl,{...target,installation:'other'+suffix.slice(0,12)},join(parent,'competing'),verify,undefined,{kind:'owned-disposable-fixture'})).rejects.toThrow('Tenant installation refused');
  expect((await admin.query(`SELECT p.oid::text oid,p.proname,p.proowner::text owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.proname=ANY($2::text[]) ORDER BY p.proname`,[schema,['ll_login_workspace','ll_credential_workspace','ll_global_admit']])).rows).toEqual(helperOwners);expect(await readFile(join(output,'web.json'))).toEqual(webBytes);
  const repeat=await installTenantRoles(testUrl,target,output,verify,undefined,{kind:'owned-disposable-fixture'});expect(repeat).toMatchObject({reused:true,roles:installed,activated:false});expect(await readFile(join(output,'web.json'))).toEqual(webBytes);expect(await readFile(join(output,'workloads.json'))).toEqual(workloadBytes);expect((await admin.query(`SELECT id,payload_hash FROM ${schema}.ll_actions ORDER BY id`)).rows).toEqual(before);
  const workers=JSON.parse(workloadBytes.toString()).entries;const workloadEnv=(e:{url:string;org:string;epoch:string;role:string})=>({NODE_ENV:'test' as const,LOOPLABS_WORKLOAD_INSTALLATION_FILE:join(output,'runtime',e.role,'workloads.json'),LOOPLABS_DATABASE_URL:e.url,LOOPLABS_WORKSPACE_ID:e.org,LOOPLABS_RECOVERY_EPOCH:e.epoch,LOOPLABS_TENANT_DATABASE_ROLE:e.role,LOOPLABS_TENANT_DATABASE_SCHEMA:schema});for(const e of workers){await expect(createWorkloadPool(workloadEnv(e),e.purpose,1)).rejects.toMatchObject({status:503});const pool=await createWorkloadPool(workloadEnv(e),e.purpose,1,undefined,{kind:'owned-disposable-fixture'});try{expect((await pool.query('SELECT ll_bound_workspace() org')).rows).toEqual([{org:e.org}]);await denied(pool,'SELECT parent_id FROM ll_enquiry_revisions');await denied(pool,"INSERT INTO ll_enquiry_revisions(org_id,parent_id,successor_id,parent_hash,change_hash,lifecycle) VALUES('a',$1,$2,$3,$4,'customer')",[randomUUID(),randomUUID(),'a'.repeat(64),'b'.repeat(64)]);await denied(pool,'SELECT password_hash FROM ll_members');await denied(pool,'SELECT * FROM ll_sessions');await denied(pool,"INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES('no','a','spoof','operator')");}finally{await pool.end();}}
  // Use freshly installed role credentials, not the broader original fixture
  // roles, for actual existing plan/enrollment/approval/worker service SQL.
  const config=JSON.parse(webBytes.toString()),webA=config.web.find((e:{org:string})=>e.org==='a');const workerEntry=workers.find((e:{org:string;purpose:string})=>e.org==='a'&&e.purpose==='worker'),schedulerEntry=workers.find((e:{org:string;purpose:string})=>e.org==='a'&&e.purpose==='scheduler');
  const installedWeb=new Pool({connectionString:webA.url,options:`-c search_path=${schema}`,max:2}),installedWorker=await createWorkloadPool(workloadEnv(workerEntry),'worker',2,undefined,{kind:'owned-disposable-fixture'}),installedScheduler=await createWorkloadPool(workloadEnv(schedulerEntry),'scheduler',2,undefined,{kind:'owned-disposable-fixture'});
  try{
   await registerTenantPool(installedWeb,{...webA,schema});
   const revisionParent=randomUUID(),revisionSuccessor=randomUUID();for(const id of [revisionParent,revisionSuccessor])await admin.query(`INSERT INTO ${schema}.ll_enquiry_plans(org_id,id,fixture_id,source_version,policy_versions,plan,plan_hash,created_by) VALUES('a',$1,'chat_ack_v1','v1','{}',$2,$3,'a@tenant.test')`,[id,JSON.stringify({crm:{lifecycle:'customer'}}),'a'.repeat(64)]);
   await installedWeb.query("INSERT INTO ll_enquiry_revisions(org_id,parent_id,successor_id,parent_hash,change_hash,lifecycle) VALUES('a',$1,$2,$3,$4,'customer')",[revisionParent,revisionSuccessor,'a'.repeat(64),'b'.repeat(64)]);expect((await installedWeb.query('SELECT parent_id,successor_id FROM ll_enquiry_revisions WHERE parent_id=$1',[revisionParent])).rows).toEqual([{parent_id:revisionParent,successor_id:revisionSuccessor}]);for(const sql of ['UPDATE ll_enquiry_revisions SET lifecycle=\'lead\' WHERE parent_id=$1','DELETE FROM ll_enquiry_revisions WHERE parent_id=$1'])await denied(installedWeb,sql,[revisionParent]);await denied(installedWeb,'TRUNCATE ll_enquiry_revisions');
   await admin.query(`CREATE TABLE ${schema}.ll_future_credentials(secret text)`);await admin.query(`INSERT INTO ${schema}.ll_future_credentials VALUES('private fixture')`);
   try{for(const pool of [installedWeb,installedWorker,installedScheduler])await denied(pool,'SELECT * FROM ll_future_credentials');await expect(installTenantRoles(testUrl,target,output,verify,undefined,{kind:'owned-disposable-fixture'})).rejects.toThrow('Tenant installation refused');}finally{await admin.query(`DROP TABLE ${schema}.ll_future_credentials`);}
   await admin.query(`ALTER TABLE ${schema}.ll_members ADD COLUMN future_secret text`);await admin.query(`ALTER TABLE ${schema}.ll_sessions ADD COLUMN future_session_secret text`);
   try{for(const pool of [installedWeb,installedWorker,installedScheduler]){await denied(pool,'SELECT future_secret FROM ll_members');await denied(pool,'SELECT future_session_secret FROM ll_sessions');}await expect(installTenantRoles(testUrl,target,output,verify,undefined,{kind:'owned-disposable-fixture'})).rejects.toThrow('Tenant installation refused');}finally{await admin.query(`ALTER TABLE ${schema}.ll_members DROP COLUMN future_secret`);await admin.query(`ALTER TABLE ${schema}.ll_sessions DROP COLUMN future_session_secret`);}
   const installedLogin=await signIn(installedWeb,{email:'a@tenant.test',password:'private-fixture-password'});expect(await memberSession(installedWeb,installedLogin)).toMatchObject({orgId:'a',subject:'a@tenant.test'});await expect(signIn(installedWeb,{email:'b@tenant.test',password:'private-fixture-password'})).rejects.toMatchObject({status:401});await installedWeb.query('DELETE FROM ll_sessions WHERE hash=$1',[digest(installedLogin)]);expect(await memberSession(installedWeb,installedLogin)).toBeNull();
   const managerEmail=`manager-${suffix}@tenant.test`,managerRaw=randomBytes(32).toString('base64url');await admin.query(`INSERT INTO ${schema}.ll_members(email,org_id,name,password_hash) VALUES($1,'a','Independent manager','fixture')`,[managerEmail]);await admin.query(`INSERT INTO ${schema}.ll_sessions(hash,email,expires_at) VALUES($1,$2,now()+interval '1 hour')`,[digest(managerRaw),managerEmail]);await admin.query(`INSERT INTO ${schema}.ll_connector_policies(org_id,connector) VALUES('a','email') ON CONFLICT DO NOTHING`);await admin.query(`INSERT INTO ${schema}.ll_tokens(hash,org_id,subject,role) VALUES('v9-runner','a','enquiry-runner','worker')`);
   for(const pool of [installedWeb,installedWorker,installedScheduler]){expect((await pool.query('SELECT ll_membership_authority23() present')).rows[0].present).toBe(true);if(pool===installedScheduler)await denied(pool,'SELECT * FROM ll_quote_member_generations');else expect((await pool.query("SELECT * FROM ll_quote_member_generations WHERE org_id='b'")).rows).toEqual([]);await denied(pool,"UPDATE ll_quote_member_generations SET generation=generation+1");await denied(pool,"UPDATE ll_connector_actions SET membership_proposal='{}'");await denied(pool,"UPDATE ll_connector_actions SET membership_approval='{}'");}
   const owner=(await memberSession(installedWeb,sessionTokens.a))!,manager=(await memberSession(installedWeb,managerRaw))!;expect(owner).not.toBeNull();expect(manager).not.toBeNull();let writes=0,readbacks=0;
   const provider={workspaceId:'a',bindingId:'a'.repeat(64),source:async()=> 'v1',write:async()=>{writes++;return{outcome:'verified' as const,detail:'Private service fixture effect'};},inspect:async()=>{readbacks++;return{outcome:'verified' as const,detail:'Private service fixture effect'};}};
   const control=new ConnectorControl(installedWeb,provider),workflow=new WorkflowControl(installedWeb,control),enquiries=new EnquiryControl(installedWeb,workflow,async()=>({id:'1001',email:'customer@example.test',lifecycle:'customer',version:'v1'}));const id=randomUUID(),saved=await enquiries.prepareChat(owner,id) as {saved:{plan_hash:string}};
   await enquiries.rehearse(owner,id,saved.saved.plan_hash);const run=await workflow.read(owner,id);expect(run.steps).toHaveLength(2);
   for(const step of run.steps){await expect(control.review(owner,step.action_id,step.payload_hash,true)).rejects.toThrow('Independent');expect((await control.review(manager,step.action_id,step.payload_hash,true)).state).toBe('ready');}
   const workerControl=new ConnectorControl(installedWorker,provider),workerWorkflow=new WorkflowControl(installedWorker,workerControl);expect(await new EnquiryRunner(installedWorker,workerWorkflow).tick({orgId:'a',subject:'enquiry-runner',role:'worker',tokenHash:'v9-runner'})).toBe(2);expect((await workflow.read(owner,id)).state).toBe('completed');expect(writes).toBe(2);expect(readbacks).toBeGreaterThanOrEqual(2);
   expect(await new EnquiryRunner(installedWorker,workerWorkflow).tick({orgId:'a',subject:'enquiry-runner',role:'worker',tokenHash:'v9-runner'})).toBe(0);expect(writes).toBe(2);
   for(const pool of [installedWorker,installedScheduler]){await denied(pool,'SELECT password_hash FROM ll_members');await denied(pool,'SELECT * FROM ll_sessions');await denied(pool,'SELECT * FROM ll_sales_requests');await denied(pool,'SELECT * FROM ll_quote_plans');await denied(pool,`UPDATE ll_connector_actions SET approved_by='spoof'`);await denied(pool,`UPDATE ll_connector_actions SET approval_until=now()+interval '1 hour'`);await denied(pool,`UPDATE ll_members SET active=false`);await denied(pool,`INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES('spoof-v9','a','spoof','operator')`);if(pool===installedScheduler)await denied(pool,'SELECT * FROM ll_connector_actions');else expect((await pool.query("SELECT * FROM ll_connector_actions WHERE org_id='b'")).rows).toEqual([]);}
   await denied(installedScheduler,`UPDATE ll_connector_actions SET state='succeeded'`);await denied(installedWorker,`UPDATE ll_temporal_dispatch SET state='started'`);expect((await installedWorker.query("UPDATE ll_connector_actions SET state='cancelled' WHERE org_id='b'")).rowCount).toBe(0);expect((await installedScheduler.query("UPDATE ll_temporal_dispatch SET state='started' WHERE org_id='b'")).rowCount).toBe(0);for(const pool of [installedWorker,installedScheduler]){await denied(pool,"UPDATE ll_orgs SET auto_limit=100");await denied(pool,"UPDATE ll_agents SET tools=ARRAY['forbidden']");}
   // Genuine SQL lease and acknowledgement against the installed scheduler;
   // Temporal start is explicitly a stand-in, not a Temporal service proof.
   const scheduleId=randomUUID();await admin.query(`INSERT INTO ${schema}.ll_workflow_runs(org_id,id,created_by) VALUES('a',$1,'a@tenant.test')`,[scheduleId]);await admin.query(`INSERT INTO ${schema}.ll_enquiry_plans(org_id,id,fixture_id,source_version,policy_versions,plan,plan_hash,created_by,run_id) SELECT org_id,$2,fixture_id,source_version,policy_versions,plan,plan_hash,created_by,$2 FROM ${schema}.ll_enquiry_plans WHERE org_id='a' AND id=$1`,[plans.a,scheduleId]);await admin.query(`INSERT INTO ${schema}.ll_enquiry_dispatch(org_id,plan_id,created_by) VALUES('a',$1,'a@tenant.test')`,[scheduleId]);await admin.query(`INSERT INTO ${schema}.ll_temporal_dispatch(org_id,plan_id,workflow_id,plan_hash,plan_version,connector_version) VALUES('a',$1,$2,'hash','acknowledgement-1','private-twin-1')`,[scheduleId,'v9-scheduler-'+scheduleId]);let scheduled=0;const client={workflow:{start:async()=>{scheduled++;return {};}}};
   expect(await new TemporalOutbox(installedScheduler,build).tick({orgId:'a',subject:'enquiry-temporal',role:'worker',tokenHash:'worker-a'},client as never,'private-v9')).toBe(1);expect(scheduled).toBe(1);await expect(new TemporalOutbox(installedScheduler,build).tick({orgId:'b',subject:'enquiry-temporal',role:'worker',tokenHash:'worker-b'},client as never,'private-v9')).rejects.toMatchObject({status:403});expect(scheduled).toBe(1);

   // Actual installed-role product consumers, not an owner grant shim or provider execution proof.
   const productScope=randomUUID(),productAgent='product-'+suffix;
   const productProvider={...provider,contactId:'2001',bindingId:'c'.repeat(64),recordScope:{version:'record-scope-1' as const,workspaceId:'a',contactId:'2001',recipient:'alice@example.test'}};
   await registerAgent(installedWeb,owner,{id:productAgent,name:'Scoped CRM',owner:owner.subject,role:'crm_agent',connector:'crm_twin',actionLimit:10});
   const scopeControl=new ScopeControl(installedWeb,productProvider);
   expect(await scopeControl.enroll(owner,productScope)).toMatchObject({id:productScope,version:1,active:true});
   expect(await scopeControl.grant(owner,productScope,productAgent)).toMatchObject({agent_id:productAgent,version:1,active:true});
   expect((await installedWeb.query('SELECT kind FROM ll_connector_scope_events WHERE scope_id=$1 ORDER BY id',[productScope])).rows).toEqual([{kind:'enrolled'},{kind:'agent_granted'}]);
   expect(await control.contain(owner,'crm')).toEqual({contained:true});
   expect((await installedWeb.query("SELECT active FROM ll_connector_policies WHERE connector='crm'")).rows).toEqual([{active:false}]);
   expect(await control.enable(owner,'crm')).toEqual({enabled:true});
   await submitSales(installedWeb,{email:'prospect@tenant.test',name:'Fixture prospect',company:'Fixture company',companySize:'11–50',role:'Operator',workflow:'Review one bounded customer enquiry workflow',website:''});
   expect((await installedWeb.query("SELECT org_id FROM ll_sales_requests WHERE email='prospect@tenant.test'")).rows).toEqual([{org_id:'a'}]);
   // A sales request is accepted; this does not claim a confirmed booking.
   const productWrites=[
    {sql:"INSERT INTO ll_connector_scopes(org_id,id,contact_id,recipient,binding_id,contract_version,created_by) VALUES($1,$2,'2002','foreign@example.test',$3,'private-record-twin-2','fixture')",values:['b',randomUUID(),'d'.repeat(64)]},
    {sql:"INSERT INTO ll_connector_scope_grants(org_id,scope_id,agent_id,created_by) VALUES($1,$2,'agent','fixture')",values:['b',scopes.b]},
    {sql:"INSERT INTO ll_connector_scope_events(org_id,scope_id,kind,subject) VALUES($1,$2,'enrolled','fixture')",values:['b',scopes.b]},
    {sql:"INSERT INTO ll_sales_requests(org_id,id,email,name,company,company_size,role,workflow) VALUES($1,$2,'foreign@tenant.test','Fixture','Fixture','11–50','Operator','Bounded fixture workflow')",values:['b',randomUUID()]}
   ];
   for(const write of productWrites){await denied(installedWeb,write.sql,write.values);for(const pool of [installedWorker,installedScheduler])await denied(pool,write.sql,write.values.map(x=>x==='b'?'a':x));}
   for(const pool of [installedWorker,installedScheduler])await denied(pool,"UPDATE ll_connector_policies SET active=false,version=version+1 WHERE org_id='a'");
   expect((await installedWeb.query("UPDATE ll_connector_policies SET active=false,version=version+1 WHERE org_id='b'")).rowCount).toBe(0);
   for(const sql of ["UPDATE ll_connector_policies SET connector='forbidden'","UPDATE ll_connector_scopes SET recipient='other@example.test'","UPDATE ll_connector_scope_grants SET created_by='spoof'",'DELETE FROM ll_connector_scopes','TRUNCATE ll_connector_scope_events'])await denied(installedWeb,sql);
   // Authority cycles must not resurrect the previous exact approval.
   const productControl=new ConnectorControl(installedWeb,productProvider),writesBeforeCycles=writes;
   for(const agent of [undefined,productAgent]){
    const proposal=await productControl.propose(owner,{actionId:randomUUID(),agentId:productAgent,connector:'crm',payload:{lifecycle:'customer'}});
    expect((await productControl.review(manager,proposal.id,proposal.payload_hash,true)).state).toBe('ready');
    await expect(scopeControl.setActive(owner,productScope,false,agent,99)).rejects.toMatchObject({status:409});
    expect(await scopeControl.setActive(owner,productScope,false,agent,1)).toMatchObject({active:false,version:2});
    await expect(scopeControl.setActive(owner,productScope,true,agent,1)).rejects.toMatchObject({status:409});
    expect(await scopeControl.setActive(owner,productScope,true,agent,2)).toMatchObject({active:true,version:3});
    expect((await productControl.execute(manager,proposal.id)).state).toBe('cancelled');
    expect(writes).toBe(writesBeforeCycles);
   }
   expect((await installedWeb.query('SELECT active,version FROM ll_connector_scopes WHERE id=$1',[productScope])).rows).toEqual([{active:true,version:3}]);
   expect((await installedWeb.query('SELECT active,version FROM ll_connector_scope_grants WHERE scope_id=$1',[productScope])).rows).toEqual([{active:true,version:3}]);
   for(const pool of [installedWorker,installedScheduler])for(const table of ['ll_connector_scopes','ll_connector_scope_grants'])await denied(pool,`UPDATE ${table} SET active=false,version=version+1 WHERE org_id='a'`);
   for(const table of ['ll_connector_scopes','ll_connector_scope_grants'])expect((await installedWeb.query(`UPDATE ${table} SET active=false,version=version+1 WHERE org_id='b'`)).rowCount).toBe(0);
   expect((await admin.query(`UPDATE ${schema}.ll_agents SET active=false WHERE org_id='a' AND id=$1 RETURNING active`,[productAgent])).rows).toEqual([{active:false}]);
  }finally{await Promise.all([installedWeb,installedWorker,installedScheduler].map(p=>p.end()));}
  const readyFile=join(output,'ready.json'),readyBytes=await readFile(readyFile);await unlink(readyFile);await symlink(join(output,'web.json'),readyFile);await expect(installTenantRoles(testUrl,target,output,verify,undefined,{kind:'owned-disposable-fixture'})).rejects.toThrow('Tenant installation refused');await unlink(readyFile);await writeFile(readyFile,readyBytes,{mode:0o600});
  await link(join(output,'workloads.json'),join(output,'workloads-hardlink'));await expect(installTenantRoles(testUrl,target,output,verify,undefined,{kind:'owned-disposable-fixture'})).rejects.toThrow('Tenant installation refused');await unlink(join(output,'workloads-hardlink'));
  const alias=join(parent,'alias');await symlink(output,alias);await expect(installTenantRoles(testUrl,target,alias,verify,undefined,{kind:'owned-disposable-fixture'})).rejects.toThrow('Tenant installation refused');
  await expect(installTenantRoles(testUrl,target,output,async()=>{throw Error('unverified source');},undefined,{kind:'owned-disposable-fixture'})).rejects.toThrow('Tenant installation refused');expect(await readFile(join(output,'web.json'))).toEqual(webBytes);
 }finally{
  for(const fn of ['ll_login_workspace(text)','ll_credential_workspace(text)','ll_global_admit(text,text)'])await admin.query(`ALTER FUNCTION ${schema}.${fn} OWNER TO ${definerName}`);
  for(const role of Object.keys(installed)){await admin.query(`DELETE FROM ${schema}.ll_runtime_workspace_bindings WHERE login_name=$1`,[role]);await admin.query(`DROP OWNED BY ${role}`);await admin.query(`DROP ROLE ${role}`);rolesCreated.delete(role);}await rm(parent,{recursive:true,force:true});
 }
},30000);
it('actual server bootstrap validates owned installation, helper source/owner and independent A/B pool epochs; malformed startup never falls back',async()=>{
 const dir=await realpath(await mkdtemp(join(tmpdir(),'ll-tenant-bootstrap-')));await chmod(dir,0o700);const file=join(dir,'web.json');const bu=new URL(testUrl);bu.username=brokerName;bu.password=brokerPassword;
 const database=decodeURIComponent(bu.pathname.slice(1)),helpers:Record<string,string>={};for(const f of (await admin.query(`SELECT p.proname,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.proname=ANY($2::text[])`,[schema,['ll_bound_workspace','ll_credential_workspace','ll_global_admit','ll_login_workspace','ll_named_subject_exists','ll_runtime_classification']])).rows)helpers[f.proname]=createHash('sha256').update(f.definition).digest('hex');
 const web=['a','b'].map(org=>{const u=new URL(testUrl);u.username=names[org as 'a'|'b'];u.password=passwords[org as 'a'|'b'];return{url:u.href,role:names[org as 'a'|'b'],org,epoch:epochs[org as 'a'|'b'],purpose:'web'};});
 const cfg={transport:{mode:'loopback-plaintext-test-fixture',fixture:'disposable-local-postgres'} as const,version:1,installation:'private_actual_pg',schema,database,broker:{url:bu.href,role:brokerName},definer:definerName,helpers,web,workloads:[],salesOrg:'a'};
 const save=async(v:unknown)=>{await writeFile(file,JSON.stringify(v),{mode:0o600});await writeFile(join(dir,'ready.json'),JSON.stringify({installation:cfg.installation,webSha256:createHash('sha256').update(JSON.stringify(v)).digest('hex')}),{mode:0o600});};let loaded:Awaited<ReturnType<typeof bootstrapTenantContext>>|undefined;
 try{
  await save(cfg);loaded=await bootstrapTenantContext(file,undefined,undefined,undefined,{kind:'owned-disposable-fixture'});expect((await loaded.context.member(sessionTokens.b)).actor.orgId).toBe('b');await loaded.close();loaded=undefined;
  const initializerPools:Pool[]=[];let initialized=false;
  loaded=await bootstrapTenantContext(file,false,false,undefined,{kind:'owned-disposable-fixture'},async(pools,actualContext)=>{initialized=true;expect([...pools.keys()]).toEqual(['a','b']);for(const org of ['a','b']){const db=pools.get(org)!;initializerPools.push(db);expect((await actualContext.member(sessionTokens[org as 'a'|'b'])).db).toBe(db);expect((await db.query('SELECT ll_bound_workspace() org')).rows[0].org).toBe(org);}});expect(initialized).toBe(true);await loaded.close();loaded=undefined;
  for(const db of initializerPools)await expect(db.query('SELECT 1')).rejects.toThrow('after calling end');
  const activeContext=tenantContext();let failedPool:Pool|undefined;let failureCallbackReached=false;await expect(bootstrapTenantContext(file,true,false,undefined,{kind:'owned-disposable-fixture'},async(pools)=>{failureCallbackReached=true;failedPool=pools.get('a');throw Error('private initializer diagnostic');})).rejects.toMatchObject({status:503,message:'Scoped server installation unavailable.'});expect(failureCallbackReached).toBe(true);expect(tenantContext()).toBe(activeContext);await expect(failedPool!.query('SELECT 1')).rejects.toThrow('after calling end');
  await save(cfg);let replacedPool:Pool|undefined;await expect(bootstrapTenantContext(file,true,false,undefined,{kind:'owned-disposable-fixture'},async(pools)=>{replacedPool=pools.get('a');const exact=await readFile(file);await Promise.resolve();await unlink(file);await writeFile(file,exact,{mode:0o600});})).rejects.toMatchObject({status:503});expect(tenantContext()).toBe(activeContext);await expect(replacedPool!.query('SELECT 1')).rejects.toThrow('after calling end');
  await save(cfg);let callbackReached=false;await expect(bootstrapTenantContext(file,false,true,undefined,{kind:'owned-disposable-fixture'},async()=>{callbackReached=true;})).rejects.toMatchObject({status:503});expect(callbackReached).toBe(false);
  for(const bad of [{...cfg,web:[...web,web[0]]},{...cfg,web:[{...web[0],epoch:randomUUID()},web[1]]},{...cfg,web:[{...web[0],org:'b'},web[1]]},{...cfg,helpers:{...helpers,ll_global_admit:'0'.repeat(64)}},{...cfg,salesOrg:'unknown'},{...cfg,ownerDatabaseUrl:testUrl},{...cfg,workloads:[{...web[0],purpose:'worker'}]}]){await save(bad);await expect(bootstrapTenantContext(file,undefined,undefined,undefined,{kind:'owned-disposable-fixture'})).rejects.toMatchObject({status:503});}
  await save(cfg);const original=await readFile(file);let swapped=false;
  await expect(bootstrapTenantContext(file,false,false,async()=>{await unlink(file);await writeFile(file,original,{mode:0o600});swapped=true;},{kind:'owned-disposable-fixture'})).rejects.toMatchObject({status:503});expect(swapped).toBe(true);expect(await readFile(file)).toEqual(original);
  await save(cfg);await expect(bootstrapTenantContext(file,false,false,async()=>{await writeFile(join(dir,'ready.json'),JSON.stringify({installation:cfg.installation,webSha256:'0'.repeat(64)}),{mode:0o600});},{kind:'owned-disposable-fixture'})).rejects.toMatchObject({status:503});
  await save(cfg);await chmod(file,0o644);await expect(readTenantInstallation(file)).rejects.toThrow();await chmod(file,0o600);
  const alias=join(dir,'alias.json');await symlink(file,alias);await expect(readTenantInstallation(alias)).rejects.toThrow();
  const nested=join(dir,'nested');await mkdir(nested,{mode:0o700});const parentAlias=join(dir,'parent-alias');await symlink(nested,parentAlias);const nestedFile=join(nested,'web.json');await writeFile(nestedFile,JSON.stringify(cfg),{mode:0o600});await expect(readTenantInstallation(join(parentAlias,'web.json'))).rejects.toThrow();
  const ownedNames=[...rolesCreated,adminName];const ownedRoles=async()=>(await admin.query('SELECT rolname,oid::text oid FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname',[ownedNames])).rows;const ownerBefore=await ownedRoles();const attemptedRoles=async()=>(await admin.query('SELECT rolname,oid::text oid FROM pg_roles WHERE starts_with(rolname,$1) ORDER BY rolname',[`llti_${cfg.installation}_`])).rows;expect(await attemptedRoles()).toEqual([]);await save({...cfg,broker:{url:testUrl,role:adminName}});await expect(bootstrapTenantContext(file,undefined,undefined,undefined,{kind:'owned-disposable-fixture'})).rejects.toMatchObject({status:503});expect(await ownedRoles()).toEqual(ownerBefore);expect(await attemptedRoles()).toEqual([]);
 }finally{await loaded?.close();await rm(dir,{recursive:true,force:true});}
},20000);
it('public sales has no default tenant and global fixed budget survives separate tenant pools',async()=>{
 await expect(context.sales()).rejects.toMatchObject({status:503});await context.configureSales('a');await expect(context.configureSales('b')).rejects.toMatchObject({status:503});
 await admin.query(`DELETE FROM ${schema}.ll_access_attempts WHERE key LIKE 'sales%'`);
 for(let i=0;i<10;i++)expect(await context.sales()).toBe(a);await expect(context.sales()).rejects.toMatchObject({status:429});
 await denied(a,`SELECT ${schema}.ll_global_admit('sales',$1)`,[digest('public-sales')]);
});
it('actual web revision link is tenant-scoped immutable, refuses forged parent/owner and contains a superseded plan',async()=>{
 const parent=randomUUID(),successor=randomUUID(),bad=randomUUID();const parentHash='a'.repeat(64),changeHash='b'.repeat(64);
 const ownerEmail='a@tenant.test';
 const create=async(id:string,owner=ownerEmail)=>admin.query(`INSERT INTO ${schema}.ll_enquiry_plans(org_id,id,fixture_id,source_version,policy_versions,plan,plan_hash,created_by) VALUES('a',$1,'chat_ack_v1','v1','{}',$2,$3,$4)`,[id,JSON.stringify({crm:{lifecycle:'customer'}}),parentHash,owner]);
 await create(parent);await create(successor);const otherOwner=`manager-${suffix}@tenant.test`,foreignOwnerSuccessor=randomUUID();await create(foreignOwnerSuccessor,otherOwner);
 const link=`INSERT INTO ${schema}.ll_enquiry_revisions(org_id,parent_id,successor_id,parent_hash,change_hash,lifecycle) VALUES($1,$2,$3,$4,$5,'customer')`;
 await expect(a.query(link,['a',parent,successor,'0'.repeat(64),changeHash])).rejects.toMatchObject({code:'23514'});
 await expect(a.query(link,['a',parent,foreignOwnerSuccessor,parentHash,changeHash])).rejects.toMatchObject({code:'23514'});expect((await admin.query(`SELECT parent_id FROM ${schema}.ll_enquiry_revisions WHERE parent_id=$1`,[parent])).rows).toEqual([]);
 await expect(create(bad,'b@tenant.test')).rejects.toMatchObject({code:'23514'});expect((await admin.query(`SELECT id FROM ${schema}.ll_enquiry_plans WHERE id=$1`,[bad])).rowCount).toBe(0);
 await a.query(link,['a',parent,successor,parentHash,changeHash]);expect((await a.query(`SELECT parent_id,successor_id FROM ${schema}.ll_enquiry_revisions WHERE parent_id=$1`,[parent])).rows).toEqual([{parent_id:parent,successor_id:successor}]);
 expect((await b.query(`SELECT parent_id FROM ${schema}.ll_enquiry_revisions WHERE parent_id=$1`,[parent])).rows).toEqual([]);
 await expect(b.query(link,['a',parent,successor,parentHash,changeHash])).rejects.toMatchObject({code:'23514'});
 for(const sql of [`UPDATE ${schema}.ll_enquiry_revisions SET lifecycle='lead' WHERE parent_id=$1`,`DELETE FROM ${schema}.ll_enquiry_revisions WHERE parent_id=$1`])await denied(a,sql,[parent]);await denied(a,`TRUNCATE ${schema}.ll_enquiry_revisions`);
 await expect(a.query(`UPDATE ${schema}.ll_enquiry_plans SET run_id=$1 WHERE id=$2`,[baseA,parent])).rejects.toMatchObject({code:'23514'});expect((await admin.query(`SELECT run_id FROM ${schema}.ll_enquiry_plans WHERE id=$1`,[parent])).rows[0].run_id).toBeNull();
 for(const pool of [worker,workerB]){await denied(pool,`SELECT parent_id FROM ${schema}.ll_enquiry_revisions`);await denied(pool,link,['a',parent,successor,parentHash,changeHash]);}
 expect((await admin.query(`SELECT parent_id,successor_id FROM ${schema}.ll_enquiry_revisions WHERE parent_id=$1`,[parent])).rows).toEqual([{parent_id:parent,successor_id:successor}]);
});
it('revision privileges do not expand to an owner-added future column',async()=>{
 await admin.query(`ALTER TABLE ${schema}.ll_enquiry_revisions ADD COLUMN undeclared_metadata text`);try{await denied(a,`SELECT undeclared_metadata FROM ${schema}.ll_enquiry_revisions`);await denied(a,`INSERT INTO ${schema}.ll_enquiry_revisions(org_id,parent_id,successor_id,parent_hash,change_hash,lifecycle,undeclared_metadata) VALUES('a',$1,$2,$3,$4,'customer','fixture')`,[randomUUID(),randomUUID(),'a'.repeat(64),'b'.repeat(64)]);}finally{await admin.query(`ALTER TABLE ${schema}.ll_enquiry_revisions DROP COLUMN undeclared_metadata`);}
});


it('scoped runtimes cannot restore or change epoch; actual offline quarantine contains A while B remains unchanged',async()=>{
 const next=randomUUID(),hash='d'.repeat(64);const tables=['ll_orgs','ll_members','ll_agents','ll_tokens','ll_actions','ll_connector_actions','ll_workflow_runs','ll_connector_scopes','ll_workspace_recovery'];
 const foreignSessions=(await admin.query(`SELECT s.* FROM ${schema}.ll_sessions s JOIN ${schema}.ll_members m ON m.email=s.email WHERE m.org_id='b' ORDER BY s.hash`)).rows;
 const foreign:Record<string,unknown>={};for(const t of tables)foreign[t]=(await admin.query(`SELECT * FROM ${schema}.${t} WHERE ${t==='ll_orgs'?'id':'org_id'}='b' ORDER BY 1`)).rows;
 await expect(quarantineRestore(a,'a',next,hash)).rejects.toMatchObject({status:403});await expect(quarantineRestore(worker,'a',next,hash)).rejects.toMatchObject({status:403});
 await denied(a,`UPDATE ${schema}.ll_workspace_recovery SET epoch=$1 WHERE org_id='a'`,[next]);await denied(worker,`INSERT INTO ${schema}.ll_workspace_recovery_events(org_id,epoch,backup_hash,counts) VALUES('a',$1,$2,'{}')`,[next,hash]);
 await recoveryFence(a,'a',epochs.a);await expect(recoveryFence(a,'b',epochs.b)).rejects.toMatchObject({status:403});
 const ids=(await admin.query(`SELECT id,payload_hash FROM ${schema}.ll_actions WHERE org_id='a' ORDER BY id`)).rows;
 const activeMembers=(await admin.query(`SELECT email FROM ${schema}.ll_members WHERE org_id='a' AND active=true`)).rows,activeAgents=(await admin.query(`SELECT id FROM ${schema}.ll_agents WHERE org_id='a' AND active=true`)).rows;expect(activeMembers).toHaveLength(2);expect(activeAgents,JSON.stringify(activeAgents)).toHaveLength(3);const counts=await quarantineRestore(admin,'a',next,hash);expect(counts.sessions).toBeGreaterThan(0);expect(counts.members).toBe(activeMembers.length);expect(counts.agents).toBe(activeAgents.length);expect((await admin.query(`SELECT email FROM ${schema}.ll_members WHERE org_id='a' AND active=true`)).rows).toEqual([]);expect((await admin.query(`SELECT id FROM ${schema}.ll_agents WHERE org_id='a' AND active=true`)).rows).toEqual([]);
 await expect(recoveryFence(a,'a',epochs.a)).rejects.toMatchObject({status:503});await expect(recoveryFence(a,'a',next)).rejects.toMatchObject({status:503});await recoveryFence(b,'b',epochs.b);
 const renewed=connection('a');try{await registerTenantPool(renewed,{org:'a',epoch:next,role:names.a,schema,purpose:'web'});await recoveryFence(renewed,'a');}finally{await renewed.end();}
 expect(await memberSession(a,sessionTokens.a)).toBeNull();
 expect((await routeSession(new NextRequest('https://looplabs.run/api/workspace/session',{headers:{cookie:`looplabs_workspace_session=${sessionTokens.a}`}}))).status).toBe(401);
 expect((await admin.query(`SELECT s.* FROM ${schema}.ll_sessions s JOIN ${schema}.ll_members m ON m.email=s.email WHERE m.org_id='b' ORDER BY s.hash`)).rows).toEqual(foreignSessions);expect((await a.query(`SELECT state FROM ${schema}.ll_actions`)).rows.every(r=>r.state==='uncertain')).toBe(true);
 expect((await admin.query(`SELECT id,payload_hash FROM ${schema}.ll_actions WHERE org_id='a' ORDER BY id`)).rows).toEqual(ids);
 for(const t of tables)expect((await admin.query(`SELECT * FROM ${schema}.${t} WHERE ${t==='ll_orgs'?'id':'org_id'}='b' ORDER BY 1`)).rows).toEqual(foreign[t]);
 expect(await quarantineRestore(admin,'a',next,hash)).toEqual(counts);await expect(quarantineRestore(admin,'a',next,'e'.repeat(64))).rejects.toMatchObject({status:409});
 vi.stubEnv('LOOPLABS_RECOVERY_EPOCH',next);try{await expect(new TemporalOutbox(worker,build).tick({orgId:'a',subject:'enquiry-temporal',role:'worker',tokenHash:'worker-a'},{workflow:{start:async()=>{throw Error('Must not start after quarantine');}}}as never,'tenant-a')).rejects.toMatchObject({status:503});}finally{vi.unstubAllEnvs();}
});
it('actual shared PostgreSQL archive restore fences every restored tenant with independent fresh epochs and preserves stable action identities',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ll-tenant-restore-'));await chmod(dir,0o700);const archive=join(dir,'tenant.dump');const url=new URL(testUrl);
 const env={PATH:process.env.PATH||'',NODE_ENV:'test' as const,PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:url.pathname.slice(1),PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password)};
 const command=async(name:string,args:string[])=>{try{return await promisify(execFile)(name,args,{env,timeout:15000,maxBuffer:1024*1024});}catch{throw Error('Dedicated archive operation refused; diagnostics suppressed');}};
 const currentEpoch=(await admin.query(`SELECT epoch FROM ${schema}.ll_workspace_recovery WHERE org_id='a'`)).rows[0].epoch;const fresh=connection('a');await registerTenantPool(fresh,{org:'a',epoch:currentEpoch,role:names.a,schema,purpose:'web'});
 const freshWorker=connection('worker');await registerTenantPool(freshWorker,{org:'a',epoch:currentEpoch,role:names.worker,schema,purpose:'worker'});await recoveryFence(fresh,'a');await recoveryFence(freshWorker,'a');
 const before=(await admin.query(`SELECT org_id,id,payload_hash FROM ${schema}.ll_actions ORDER BY org_id,id`)).rows;
 const sessionsB=(await admin.query(`SELECT s.* FROM ${schema}.ll_sessions s JOIN ${schema}.ll_members m ON m.email=s.email WHERE m.org_id='b' ORDER BY hash`)).rows;
 try{
  await command('pg_dump',['--format=custom','--no-owner','--no-acl',`--schema=${schema}`,`--file=${archive}`]);await chmod(archive,0o600);const hash=createHash('sha256').update(await readFile(archive)).digest('hex');
  await admin.query(`UPDATE ${schema}.ll_actions SET reason='post-backup-only' WHERE org_id='a'`);
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);await command('pg_restore',['--exit-on-error','--no-owner','--no-acl',`--dbname=${env.PGDATABASE}`,archive]);
  // Restoring --no-acl is deliberately not runtime-ready. Fail closed until
  // owner reapplies narrow grants and helper ownership, never reuse PUBLIC defaults.
  await admin.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ${schema} FROM PUBLIC`);
  for(const key of ['a','b','worker','workerB','unmapped']as const)await grant(key);
  await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${definerName},${brokerName}`);
  await admin.query(`GRANT SELECT ON ${schema}.ll_members,${schema}.ll_sessions,${schema}.ll_tokens,${schema}.ll_named_subject_presence TO ${definerName}`);
  await admin.query(`GRANT SELECT,INSERT,UPDATE ON ${schema}.ll_access_attempts TO ${definerName}`);
  await admin.query(`GRANT CREATE ON SCHEMA ${schema} TO ${definerName}`);
  for(const fn of ['ll_login_workspace(text)','ll_credential_workspace(text)','ll_global_admit(text,text)'])await admin.query(`ALTER FUNCTION ${schema}.${fn} OWNER TO ${definerName}`);
  await admin.query(`REVOKE CREATE ON SCHEMA ${schema} FROM ${definerName}`);
  await admin.query(`GRANT EXECUTE ON FUNCTION ${schema}.ll_login_workspace(text),${schema}.ll_credential_workspace(text),${schema}.ll_global_admit(text,text) TO ${brokerName}`);
  expect((await admin.query(`SELECT org_id,id,payload_hash FROM ${schema}.ll_actions ORDER BY org_id,id`)).rows).toEqual(before);
  const next=randomUUID();await quarantineRestore(admin,'a',next,hash);
  await expect(recoveryFence(fresh,'a')).rejects.toMatchObject({status:503});await expect(recoveryFence(freshWorker,'a')).rejects.toMatchObject({status:503});await expect(context.member(sessionTokens.a)).rejects.toMatchObject({status:401});
  // The archive includes B, so B must also be fenced. Do not mistake an A-only
  // quarantine for selective tenant archive import or revive peer authority.
  expect(sessionsB.length).toBeGreaterThan(0);const nextB=randomUUID();expect(nextB).not.toBe(next);await quarantineRestore(admin,'b',nextB,hash);
  await expect(recoveryFence(b,'b')).rejects.toMatchObject({status:503});await expect(recoveryFence(workerB,'b')).rejects.toMatchObject({status:503});await expect(context.member(sessionTokens.b)).rejects.toMatchObject({status:401});
  const freshB=connection('b');try{await registerTenantPool(freshB,{org:'b',epoch:nextB,role:names.b,schema,purpose:'web'});await recoveryFence(freshB,'b');}finally{await freshB.end();}
  expect((await admin.query(`SELECT s.* FROM ${schema}.ll_sessions s JOIN ${schema}.ll_members m ON m.email=s.email WHERE m.org_id='b' ORDER BY hash`)).rows).toEqual([]);
  expect((await admin.query(`SELECT org_id,id,payload_hash FROM ${schema}.ll_actions ORDER BY org_id,id`)).rows).toEqual(before);
 }finally{await fresh.end();await freshWorker.end();await rm(dir,{recursive:true,force:true});}
},30000);
it('refuses dropped-and-recreated same-name login because owner binding pins the original role OID',async()=>{
 const old=(await admin.query(`SELECT login_oid FROM ${schema}.ll_runtime_workspace_bindings WHERE login_name=$1`,[names.a])).rows[0].login_oid;await a.end();await admin.query(`DROP OWNED BY ${names.a}`);await admin.query(`DROP ROLE ${names.a}`);rolesCreated.delete(names.a);await createRole('a');await grant('a');a=connection('a');
 const now=(await admin.query('SELECT oid FROM pg_roles WHERE rolname=$1',[names.a])).rows[0].oid;expect(now).not.toBe(old);expect((await a.query(`SELECT ${schema}.ll_bound_workspace() org`)).rows[0].org).toBeNull();expect((await a.query(`SELECT * FROM ${schema}.ll_actions`)).rows).toEqual([]);await denied(a,`INSERT INTO ${schema}.ll_orgs(id) VALUES('recreated')`);
 expect((await a.query(`SELECT ${schema}.ll_runtime_classification() classification`)).rows[0].classification).toBe('invalid');
 await admin.query(`GRANT EXECUTE ON FUNCTION ${schema}.ll_test_definer_token_insert(text,text) TO ${names.a}`);
 await expect(a.query(`SELECT ${schema}.ll_test_definer_token_insert('a','agent')`)).rejects.toMatchObject({code:'23514'});
});
