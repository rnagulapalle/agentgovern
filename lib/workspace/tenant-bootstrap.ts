import {assertWebRecoveryDeployment} from './web-recovery-deployment';
import {parseTransport,scopedPoolOptions,type ExecutionContext,type PostgreSQLTransport} from '../durable/pg-transport';
// Server-only installation bootstrap. This file must not be imported by a client
// component. Only an owned administrator-created config is accepted; no request
// data, caller org assertion, mutable GUC or legacy singleton selects a pool.
import {readdir} from 'node:fs/promises';
import {readOwnedPrivateFile} from './owned-private-file';
export {readOwnedPrivateFile} from './owned-private-file';
import { dirname,resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { ControlError } from '../durable/contracts';
import { registerTenantPool } from '../durable/tenant-pool';
import { TenantContext,configureTenantContext } from './tenant-context';
const identifier=/^[_a-zA-Z][_a-zA-Z0-9]{0,62}$/;
const hash=/^[a-f0-9]{64}$/;
const helperNames=['ll_bound_workspace','ll_credential_workspace','ll_global_admit','ll_login_workspace','ll_named_subject_exists','ll_runtime_classification'];
type Login={url:string;role:string;org:string;epoch:string;purpose:'web'|'worker'|'scheduler'};
type Config={transport?:PostgreSQLTransport;version:1;installation:string;schema:string;database:string;broker:{url:string;role:string};definer:string;helpers:Record<string,string>;web:Login[];workloads:Login[];salesOrg:string};
function exact(value:unknown,keys:string[]){return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join()===keys.sort().join();}
function url(value:string,role:string,database:string){let u:URL;try{u=new URL(value);}catch{throw Error('config');}if(!['postgres:','postgresql:'].includes(u.protocol)||!u.password||decodeURIComponent(u.username)!==role||decodeURIComponent(u.pathname.slice(1))!==database||u.search||u.hash)throw Error('config');return u;}
export function parseTenantInstallation(value:unknown):Config{
 if(typeof window!=='undefined'||!(exact(value,['version','installation','schema','database','broker','definer','helpers','web','workloads','salesOrg'])||exact(value,['version','installation','schema','database','broker','definer','helpers','web','workloads','salesOrg','transport'])))throw Error('config');
 const c=value as Config;if(c.version!==1||typeof c.installation!=='string'||!identifier.test(c.installation)||!identifier.test(c.schema)||!identifier.test(c.database)||!identifier.test(c.definer)||!exact(c.broker,['url','role'])||!identifier.test(c.broker.role)||!exact(c.helpers,helperNames)||Object.values(c.helpers).some(v=>typeof v!=='string'||!hash.test(v))||!Array.isArray(c.web)||!c.web.length||c.web.length>50||!Array.isArray(c.workloads)||c.workloads.length>100)throw Error('config');
 const base=url(c.broker.url,c.broker.role,c.database),roles=new Set([c.broker.role,c.definer]),orgs=new Set<string>();
 for(const [entries,purposes]of [[c.web,['web']],[c.workloads,['worker','scheduler']]] as const)for(const entry of entries){if(!exact(entry,['url','role','org','epoch','purpose'])||!identifier.test(entry.role)||roles.has(entry.role)||typeof entry.org!=='string'||!/^[-_a-zA-Z0-9]{1,64}$/.test(entry.org)||typeof entry.epoch!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.epoch)||!(purposes as readonly string[]).includes(entry.purpose))throw Error('config');const u=url(entry.url,entry.role,c.database);if(['protocol','hostname','port','pathname'].some(k=>u[k as keyof URL]!==base[k as keyof URL])||u.password===base.password)throw Error('config');roles.add(entry.role);if(entry.purpose==='web'){if(orgs.has(entry.org))throw Error('config');orgs.add(entry.org);}}
 if(typeof c.salesOrg!=='string'||!orgs.has(c.salesOrg)||c.workloads.some(e=>!orgs.has(e.org)))throw Error('config');return Object.freeze({...c,transport:parseTransport(c.transport)});
}
export async function readTenantInstallation(file:string){const read=await readOwnedPrivateFile(file,131072);return parseTenantInstallation(JSON.parse(read.bytes.toString('utf8')));}
async function readWebGeneration(file:string,readProbe:(()=>Promise<void>)|undefined,sealed:boolean){
 const path=resolve(file);if(!path.endsWith('/web.json'))throw Error('Published generation required');
 const configRead=await readOwnedPrivateFile(path,131072),config=parseTenantInstallation(JSON.parse(configRead.bytes.toString('utf8')));
 if(config.workloads.length)throw Error('Web installation must not contain workload credentials');
 const assertInventory=async()=>{if(sealed&&(await readdir(dirname(path))).sort().join()!=='ready.json,web.json')throw Error('Sealed web generation inventory');};
 await assertInventory();await readProbe?.();
 const readyRead=await readOwnedPrivateFile(resolve(dirname(path),'ready.json'),16384),ready=JSON.parse(readyRead.bytes.toString('utf8'));
 if(ready.installation!==config.installation||ready.webSha256!==createHash('sha256').update(configRead.bytes).digest('hex'))throw Error('Published generation mismatch');
 const assertStable=async()=>{await configRead.assertStable();await readyRead.assertStable();await assertInventory();};await assertStable();
 return{config,configBytes:Buffer.from(configRead.bytes),readyBytes:Buffer.from(readyRead.bytes),assertStable};
}
/** Offline sealed-publication/installed web startup reader; no database or pool is opened.
 * A sealed web directory contains only its exact config and readiness bytes. */
export const readPublishedWebGeneration=(file:string,readProbe?:()=>Promise<void>)=>readWebGeneration(file,readProbe,true);
async function helpers(broker:Pool,c:Config){
 const facts=(await broker.query(`SELECT p.proname,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) definition,r.rolname owner,r.rolcanlogin,r.rolsuper,r.rolbypassrls,r.rolcreaterole,r.rolcreatedb,r.rolreplication,EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) grouped FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname=$1 AND p.proname=ANY($2::text[])`,[c.schema,helperNames])).rows;
 if(facts.length!==helperNames.length||new Set(facts.map(x=>x.proname)).size!==helperNames.length)throw Error('helper inventory');
 for(const f of facts){if(createHash('sha256').update(f.definition).digest('hex')!==c.helpers[f.proname])throw Error('helper source');if(['ll_login_workspace','ll_credential_workspace','ll_global_admit'].includes(f.proname)&&(!f.prosecdef||f.owner!==c.definer||f.rolcanlogin||f.rolsuper||!f.rolbypassrls||f.rolcreaterole||f.rolcreatedb||f.rolreplication||f.grouped||JSON.stringify(f.proconfig)!==JSON.stringify(['search_path=pg_catalog'])))throw Error('helper owner');}
}
/** Preparation/startup lifecycle only. No role creation, migrations, session,
 * workload enrollment, renewal or provider effect occurs in the web process. */
export type TenantInitializer=(web:ReadonlyMap<string,Pool>,context:TenantContext)=>Promise<void>;
export async function bootstrapTenantContext(file:string,activate=false,preparation=false,readProbe?:()=>Promise<void>,execution:ExecutionContext={kind:'installed-runtime'},initialize?:TenantInitializer){
 const owned:Pool[]=[];try{
  if(activate&&preparation)throw Error('Pending generation cannot activate');
  let c:Config,assertGenerationStable:()=>Promise<void>;
  if(preparation){const read=await readOwnedPrivateFile(file,131072);c=parseTenantInstallation(JSON.parse(read.bytes.toString('utf8')));await readProbe?.();assertGenerationStable=read.assertStable;}
  else{const generation=await readWebGeneration(file,readProbe,false);c=generation.config;assertGenerationStable=generation.assertStable;}
  await assertGenerationStable();if(activate)assertWebRecoveryDeployment(c.web,process.env);const constructed=new WeakMap<Pool,import('pg').PoolConfig>();const make=async(entry:{url:string},purpose:'broker'|'web')=>{const policy=parseTransport(c.transport);const options=await scopedPoolOptions({url:entry.url,schema:c.schema,purpose,transport:policy},execution);const db=new Pool(options);constructed.set(db,options);owned.push(db);return db;};
  const broker=await make(c.broker,'broker');await helpers(broker,c);const web=new Map<string,Pool>();
  for(const entry of c.web){const db=await make(entry,'web');await registerTenantPool(db,{org:entry.org,epoch:entry.epoch,role:entry.role,schema:c.schema,purpose:'web'},constructed.get(db));web.set(entry.org,db);}
  // Independently validate workload installation facts, but do not retain
  // worker/scheduler logins in a web process or give their credentials to Next.
  if(c.workloads.length)throw Error('Web installation must not contain workload credentials');
  const context=await TenantContext.create(broker,web,c.schema,c.broker.role);await context.configureSales(c.salesOrg);await assertGenerationStable();
  // Source-owned server initialization only: use the very same enrolled Pools,
  // never reconstruct a logical equivalent or impersonate a named requester.
  // Failure or publication replacement during the await refuses activation and
  // closes every owned pool. No provider config/credentials come from callers.
  if(initialize){if(preparation)throw Error('Pending generation cannot initialize product services');await initialize(web,context);await assertGenerationStable();}
  if(activate)configureTenantContext(context);
  return {context,close:async()=>{await Promise.all(owned.map(pool=>pool.end()));}};
 }catch{await Promise.allSettled(owned.map(pool=>pool.end()));throw new ControlError(503,'Scoped server installation unavailable.');}
}

export type WorkloadInstallation={version:1;installation:string;schema:string;database:string;transport:PostgreSQLTransport;entries:Login[]};
export function parseWorkloadInstallation(value:unknown):WorkloadInstallation{
 if(!exact(value,['version','installation','schema','database','transport','entries']))throw Error('workload configuration');const c=value as WorkloadInstallation;
 if(c.version!==1||!identifier.test(c.installation)||!identifier.test(c.schema)||!identifier.test(c.database)||!Array.isArray(c.entries)||!c.entries.length||c.entries.length>100)throw Error('workload configuration');const roles=new Set<string>(),bindings=new Set<string>();let base:URL|undefined;
 for(const e of c.entries){if(!exact(e,['url','role','org','epoch','purpose'])||!identifier.test(e.role)||roles.has(e.role)||typeof e.org!=='string'||!/^[-_a-zA-Z0-9]{1,64}$/.test(e.org)||typeof e.epoch!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(e.epoch)||!['worker','scheduler'].includes(e.purpose)||bindings.has(e.org+':'+e.purpose))throw Error('workload configuration');const parsed=url(e.url,e.role,c.database);if(base&&['protocol','hostname','port','pathname'].some(k=>parsed[k as keyof URL]!==base![k as keyof URL]))throw Error('mixed workload hosts');base=parsed;roles.add(e.role);bindings.add(e.org+':'+e.purpose);}
 return Object.freeze({...c,transport:parseTransport(c.transport),entries:c.entries.map(e=>Object.freeze({...e}))});
}
async function readWorkloadGeneration(file:string,readProbe:(()=>Promise<void>)|undefined,ownerInventory:boolean){
 const path=resolve(file);if(!path.endsWith('/workloads.json'))throw Error('Published workload generation required');const read=await readOwnedPrivateFile(path,131072);const config=parseWorkloadInstallation(JSON.parse(read.bytes.toString('utf8')));if(!ownerInventory&&config.entries.length!==1)throw Error('Single process workload credential required');await readProbe?.();const readyRead=await readOwnedPrivateFile(resolve(dirname(path),'ready.json'),16384);const ready=JSON.parse(readyRead.bytes.toString('utf8'));if(ready.installation!==config.installation||ready.workloadsSha256!==createHash('sha256').update(read.bytes).digest('hex'))throw Error('Published workload generation mismatch');const assertStable=async()=>{await read.assertStable();await readyRead.assertStable();};await assertStable();return{config,assertStable};
}

export const readWorkloadInstallation=(file:string,readProbe?:()=>Promise<void>)=>readWorkloadGeneration(file,readProbe,false);
/** Offline administrator inventory only; never mount this aggregate in a workload. */
export const readOwnerWorkloadInventory=(file:string)=>readWorkloadGeneration(file,undefined,true);
