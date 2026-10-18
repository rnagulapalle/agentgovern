// Proof-only actual installation. Owner seeds/faults; no owner product pools.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {Pool} from 'pg';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {scopedPoolOptions,type PostgreSQLTransport} from '../lib/durable/pg-transport';
import {createWorkloadPool} from '../lib/durable/workload-pool';
import {installTenantRoles} from '../lib/workspace/tenant-installer';
import {readOwnerWorkloadInventory} from '../lib/workspace/tenant-bootstrap';
import {verifyTenantInventory} from '../lib/workspace/tenant-read-inventory';
import {applyQuoteExecutionMigrations} from '../lib/workspace/quote-execution-migrations';
import {scopedMigrations} from '../runtime/temporal/staging-preflight';
export async function installTemporalProofRoles(input:{url:string;transport:PostgreSQLTransport;schema:string;generation:string;epoch:string;installation:string;seed:(owner:Pool)=>Promise<void>;endpoint?:{kind:'owned-disposable-docker';hostname:'trial-db'}}) {
 assert.equal(input.transport.mode,'verified-tls','Verified TLS required');
 const target=new URL(input.url);
 if(input.endpoint===undefined)assert.equal(target.hostname,'localhost','Owned loopback target required');
 else{
  assert.deepEqual(input.endpoint,{kind:'owned-disposable-docker',hostname:'trial-db'});
  assert(existsSync('/.dockerenv'),'Explicit disposable container required');
  assert.equal(target.hostname,'trial-db');assert.equal(target.port,'5432');assert.equal(target.pathname,'/trial');assert.equal(target.username,'trial');
  assert(/^gateway_[a-f0-9]{16}$/.test(input.schema));assert(/^g[a-f0-9]{16}$/.test(input.installation));
 }
 const owner=new Pool(await scopedPoolOptions({url:input.url,schema:input.schema,purpose:'installer',transport:input.transport}));
 const pools:Pool[]=[];let roles:Record<string,string>={};
 try{
  await owner.query('CREATE TABLE ll_migrations(version integer PRIMARY KEY,digest text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  for(const file of JSON.parse(await readFile('install-order.json','utf8')) as string[])await owner.query(await readFile(file,'utf8'));
  await owner.query("INSERT INTO ll_orgs(id) VALUES('local-proof')");await owner.query("INSERT INTO ll_workspace_recovery(org_id,epoch)VALUES('local-proof',$1)",[input.epoch]);await input.seed(owner);
  await owner.query((await readFile('lib/durable/tenant-boundary-prototype-schema.sql','utf8')).replaceAll('__SCHEMA__',input.schema));
  const ledger=await Promise.all([...scopedMigrations,...[[14,'lib/enquiries/worker-admission-schema.sql'],[15,'lib/enquiries/reset-intent-schema.sql'],[16,'lib/workspace/cloud-inventory-schema.sql'],[17,'lib/workspace/cloud-project-schema.sql'],[18,'lib/workspace/cloud-owner-review-schema.sql']] as const].map(async([version,f])=>({version,digest:createHash('sha256').update(await readFile(f)).digest('hex')})));
  for(const m of ledger)await owner.query('INSERT INTO ll_migrations(version,digest)VALUES($1,$2)',[m.version,m.digest]);
  const verify=async(db:Pool)=>verifyTenantInventory({tables:(await db.query("SELECT c.relname name,c.relrowsecurity rls,c.relforcerowsecurity force,ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum) columns FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','p')",[input.schema])).rows,migrations:(await db.query('SELECT version,digest FROM ll_migrations')).rows},ledger);
  roles=(await installTenantRoles(input.url,{transport:input.transport,installation:input.installation,schema:input.schema,database:new URL(input.url).pathname.slice(1),ownerRole:(await owner.query('SELECT current_user role')).rows[0].role,tenants:[{org:'local-proof',epoch:input.epoch}],salesOrg:'local-proof'},input.generation,verify)).roles;
  await applyQuoteExecutionMigrations(owner);
  const loaded=await readOwnerWorkloadInventory(join(input.generation,'workloads.json'));await loaded.assertStable();
  const environment=(purpose:'worker'|'scheduler')=>{const e=loaded.config.entries.find(e=>e.purpose===purpose);assert(e);return{LOOPLABS_DATABASE_URL:e.url,LOOPLABS_WORKSPACE_ID:e.org,LOOPLABS_RECOVERY_EPOCH:e.epoch,LOOPLABS_TENANT_DATABASE_ROLE:e.role,LOOPLABS_TENANT_DATABASE_SCHEMA:input.schema,LOOPLABS_WORKLOAD_INSTALLATION_FILE:join(input.generation,'runtime',e.role,'workloads.json')};};
  const worker=await createWorkloadPool(environment('worker'),'worker'),scheduler=await createWorkloadPool(environment('scheduler'),'scheduler');pools.push(worker,scheduler);
  const stopRuntimePools=async()=>{for(const p of pools.splice(0))await p.end();};
  return{owner,worker,scheduler,roles,environment,stopRuntimePools,webFile:join(input.generation,'web.json'),close:async()=>{await stopRuntimePools();await owner.end();}};
 }catch(error){for(const p of pools)await p.end();
  for(const[name,oid]of Object.entries(roles)){assert.equal((await owner.query('SELECT oid::text oid FROM pg_roles WHERE rolname=$1',[name])).rows[0]?.oid,oid);await owner.query('DROP OWNED BY '+name);await owner.query('DROP ROLE '+name);}
  await owner.end();throw error;}

}
