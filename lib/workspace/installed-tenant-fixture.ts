/** Test-only real installation. Never import from a product route or launcher.
 * Owner SQL is restricted to fixture provisioning/fault injection; services
 * receive genuinely installed, registered scoped roles, never an owner pool. */
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { chmod, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { scopedMigrations } from '../../runtime/temporal/staging-preflight';
import { installTenantRoles } from './tenant-installer';
import { verifyTenantInventory } from './tenant-read-inventory';
import { bootstrapTenantContext } from './tenant-bootstrap';
import { registerTenantPool } from '../durable/tenant-pool';
import { scopedPoolOptions } from '../durable/pg-transport';
import { createWorkloadPool } from '../durable/workload-pool';

const execution = {kind:'owned-disposable-fixture'} as const;
const transport = {mode:'loopback-plaintext-test-fixture',fixture:'disposable-local-postgres'} as const;
type Options = { schemaPrefix?:'reset_archive'; tenants: readonly string[]; salesOrg:string; beforeSchemas?:(owner:Pool,schema:string)=>Promise<void>; seed:(owner:Pool)=>Promise<void> };
export async function createInstalledTenantFixture(options:Options) {
 if (process.env.NODE_ENV !== 'test' || !process.env.LOOPLABS_TEST_DATABASE_URL)
  throw Error('Dedicated test-only tenant installation required');
 const url=process.env.LOOPLABS_TEST_DATABASE_URL;
 const parsed=new URL(url);
 if(!['127.0.0.1','localhost'].includes(parsed.hostname)||!options.tenants.length||new Set(options.tenants).size!==options.tenants.length||!options.tenants.includes(options.salesOrg)||options.tenants.some(v=>!/^[-a-zA-Z0-9_]{1,64}$/.test(v)))
  throw Error('Owned local tenant fixture required');
 if(options.schemaPrefix!==undefined&&options.schemaPrefix!=='reset_archive')throw Error('Owned fixture schema prefix required');
 const schema=(options.schemaPrefix??'ll_inst_fixture')+'_'+randomBytes(8).toString('hex');
 const admin=new Pool({connectionString:url,max:1,connectionTimeoutMillis:5000});
 const owner=new Pool({connectionString:url,options:`-c search_path=${schema}`,max:8,connectionTimeoutMillis:5000});
 const pools:Pool[]=[];let parent:string|undefined,loaded:Awaited<ReturnType<typeof bootstrapTenantContext>>|undefined;
 let roles:Record<string,string>={};let closed=false;let quiesced=false;
 const close=async()=>{
  if(closed)return;closed=true;
  await loaded?.close();loaded=undefined;await Promise.all(pools.splice(0).map(p=>p.end()));await owner.end();
  try{
   const schemaIdentity=(await admin.query('SELECT oid::text oid,nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) owned FROM pg_namespace WHERE nspname=$1',[schema])).rows[0];if(schemaIdentity&&!schemaIdentity.owned)throw Error('Owned schema cleanup refused');
   for(const [role,oid]of Object.entries(roles)){
    const current=(await admin.query('SELECT oid::text oid FROM pg_roles WHERE rolname=$1',[role])).rows[0];
    if(!current||current.oid!==oid)throw Error('Owned role cleanup refused');
    await admin.query(`DROP OWNED BY ${role}`);await admin.query(`DROP ROLE ${role}`);
   }
   if((await admin.query('SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[])',[Object.keys(roles)])).rows.length)throw Error('Owned role cleanup unverified');
   const finalIdentity=(await admin.query('SELECT oid::text oid,nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) owned FROM pg_namespace WHERE nspname=$1',[schema])).rows[0];if(JSON.stringify(finalIdentity)!==JSON.stringify(schemaIdentity))throw Error('Owned schema cleanup identity changed');
   await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
   if((await admin.query('SELECT 1 FROM pg_namespace WHERE nspname=$1',[schema])).rows.length)throw Error('Owned schema cleanup unverified');
   if(parent)await rm(parent,{recursive:true,force:true});
  }finally{await admin.end();}
 };
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  if(options.beforeSchemas){await options.beforeSchemas(owner,schema);const current=(await admin.query('SELECT oid::text oid,nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) owned FROM pg_namespace WHERE nspname=$1',[schema])).rows[0];if(!current?.owned)throw Error('Owned historical fixture schema required');}
  await owner.query('CREATE TABLE ll_migrations(version integer PRIMARY KEY,digest text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  const files=JSON.parse(await readFile('install-order.json','utf8')) as string[];
  for(const file of files)await owner.query(await readFile(file,'utf8'));
  for(const org of options.tenants)await owner.query('INSERT INTO ll_orgs(id) VALUES($1)',[org]);
  await options.seed(owner);
  const tenants=options.tenants.map(org=>({org,epoch:randomUUID()}));
  for(const entry of tenants)await owner.query('INSERT INTO ll_workspace_recovery(org_id,epoch) VALUES($1,$2)',[entry.org,entry.epoch]);
  await owner.query((await readFile('lib/durable/tenant-boundary-prototype-schema.sql','utf8')).replaceAll('__SCHEMA__',schema));
  const ledger=await Promise.all([...scopedMigrations,...[[14,'lib/enquiries/worker-admission-schema.sql'],[15,'lib/enquiries/reset-intent-schema.sql'],[16,'lib/workspace/cloud-inventory-schema.sql'],[17,'lib/workspace/cloud-project-schema.sql'],[18,'lib/workspace/cloud-owner-review-schema.sql']] as const].map(async([version,file])=>({version,digest:createHash('sha256').update(await readFile(file)).digest('hex')})));
  ledger.sort((a,b)=>a.version-b.version);
  for(const row of ledger)await owner.query('INSERT INTO ll_migrations(version,digest) VALUES($1,$2)',[row.version,row.digest]);
  const verify=async(db:Pick<Pool,'query'>)=>{
   const tables=(await db.query(`SELECT c.relname name,c.relrowsecurity rls,c.relforcerowsecurity force,ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum) columns FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','p') ORDER BY c.relname`,[schema])).rows;
   verifyTenantInventory({tables,migrations:(await db.query(`SELECT version,digest FROM ${schema}.ll_migrations ORDER BY version`)).rows},ledger);
  };
  parent=await realpath(await mkdtemp(join(tmpdir(),'ll-installed-test-')));await chmod(parent,0o700);
  const generation=join(parent,'generation');
  const ownerRole=(await admin.query('SELECT current_user name')).rows[0].name;
  const target={installation:'t'+randomBytes(8).toString('hex'),schema,database:decodeURIComponent(parsed.pathname.slice(1)),ownerRole,tenants,salesOrg:options.salesOrg,transport};
  roles=(await installTenantRoles(url,target,generation,verify,undefined,execution)).roles;
  loaded=await bootstrapTenantContext(join(generation,'web.json'),false,false,undefined,execution);
  const config=JSON.parse(await readFile(join(generation,'web.json'),'utf8'));
  const webPools=new Map<string,Pool>();
  for(const entry of config.web){const db=new Pool({...await scopedPoolOptions({url:entry.url,schema,purpose:'web',transport},execution),max:8});await registerTenantPool(db,{...entry,schema});pools.push(db);webPools.set(entry.org,db);}
  const web=(org:string)=>{const db=webPools.get(org);if(!db)throw Error('Unknown fixture workspace');return db;};
  const workload=async(org:string,purpose:'worker'|'scheduler')=>{
   const entries=JSON.parse(await readFile(join(generation,'workloads.json'),'utf8')).entries;
   const entry=entries.find((v:{org:string;purpose:string})=>v.org===org&&v.purpose===purpose);if(!entry)throw Error('Unknown fixture workload');
   const db=await createWorkloadPool({NODE_ENV:'test',LOOPLABS_WORKLOAD_INSTALLATION_FILE:join(generation,'runtime',entry.role,'workloads.json'),LOOPLABS_DATABASE_URL:entry.url,LOOPLABS_WORKSPACE_ID:entry.org,LOOPLABS_RECOVERY_EPOCH:entry.epoch,LOOPLABS_TENANT_DATABASE_ROLE:entry.role,LOOPLABS_TENANT_DATABASE_SCHEMA:schema},purpose,3,undefined,execution);pools.push(db);return db;
  };
  // Offline proof/test harnesses may pass only a purpose-specific publication
  // pathname to a child. Credential bytes remain sealed in the installer files.
  const publication=async(org:string,purpose:'web'|'worker'|'scheduler')=>{
   if(closed||!options.tenants.includes(org))throw Error('Unknown fixture publication');
   if(purpose==='web')return join(generation,'web.json');
   const inventory=JSON.parse(await readFile(join(generation,'workloads.json'),'utf8'));
   const entry=inventory.entries.find((v:{org:string;purpose:string})=>v.org===org&&v.purpose===purpose);
   if(!entry)throw Error('Unknown fixture publication');
   return join(generation,'runtime',entry.role,'workloads.json');
  };
  const context=loaded.context;
  const quiesceRuntime=async()=>{if(closed)throw Error('Closed installed fixture');await loaded?.close();loaded=undefined;await Promise.all(pools.splice(0).map(p=>p.end()));quiesced=true;};
  // Test-only offline setup metadata; never import this helper into runtime.
  const offlineRecovery=()=>{if(closed||!quiesced)throw Error('Quiesced owned fixture required');return{ownerUrl:url,target,generation,verify,execution};};
  const captureRecovery=()=>{if(closed)throw Error('Closed installed fixture');return{ownerUrl:url,target,generation,verify,execution};};
  return {owner,context,web,workload,publication,close,schema,quiesceRuntime,offlineRecovery,captureRecovery};
 }catch{await close();throw Error('Genuine installed tenant fixture unavailable');}
}
