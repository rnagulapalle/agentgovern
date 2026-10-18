import {assertScopedPoolConstruction} from './pg-transport';
import type {PoolConfig} from 'pg';
import type { Pool, PoolClient } from 'pg';
import { ControlError } from './contracts';
type Binding = Readonly<{org:string;epoch:string;role:string;schema:string;purpose:'web'|'worker'|'scheduler';roleOid:string;databaseOid:string}>;
// Node server bundles must share the same opaque validated pool identities.
const bindingKey=Symbol.for('looplabs.private.v11.tenant-pool-bindings');
const globals=globalThis as typeof globalThis & {[bindingKey]?:WeakMap<object,Binding>};
if(typeof window!=='undefined')throw new ControlError(503,'Server database context required.');
if(!Object.prototype.hasOwnProperty.call(globals,bindingKey))Object.defineProperty(globals,bindingKey,{value:new WeakMap<object,Binding>(),writable:false,configurable:false});
const bindings=globals[bindingKey]!;
if(!(bindings instanceof WeakMap))throw new ControlError(503,'Scoped database registry unavailable.');
const constructionKey=Symbol.for('looplabs.private.tenant-pool-construction');
const constructionGlobals=globalThis as typeof globalThis & {[constructionKey]?:WeakMap<object,PoolConfig>};
if(!Object.hasOwn(constructionGlobals,constructionKey))Object.defineProperty(constructionGlobals,constructionKey,{value:new WeakMap<object,PoolConfig>(),writable:false,configurable:false});
const constructed=constructionGlobals[constructionKey]!;if(!(constructed instanceof WeakMap))throw new ControlError(503,'Scoped construction registry unavailable.');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function tenantPoolBinding(db:Pool|PoolClient){return bindings.get(db);}
export async function assertTenantPool(db:Pool|PoolClient,org?:string){
 const origin=constructed.get(db);if(origin)assertScopedPoolConstruction(origin,(db as Pool).options);
 const b=bindings.get(db);if(!b||org!==undefined&&org!==b.org)throw new ControlError(403,'Scoped database context required.');
 const row=(await db.query(`SELECT ${b.schema}.ll_bound_workspace() org,${b.schema}.ll_runtime_classification() purpose,current_user role,(SELECT oid::text FROM pg_roles WHERE rolname=current_user) role_oid,(SELECT oid::text FROM pg_database WHERE datname=current_database()) database_oid,(SELECT rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication FROM pg_roles WHERE rolname=current_user) privileged,EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)) grouped,has_schema_privilege(current_user,$2,'CREATE') creates,EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$2 AND c.relkind IN ('r','p') AND pg_has_role(current_user,c.relowner,'USAGE')) owns,(SELECT epoch::text FROM ${b.schema}.ll_workspace_recovery WHERE org_id=$1) epoch`,[b.org,b.schema])).rows[0];
 if(origin)assertScopedPoolConstruction(origin,(db as Pool).options);
 if(!row||row.org!==b.org||row.purpose!==b.purpose||row.role!==b.role||row.role_oid!==b.roleOid||row.database_oid!==b.databaseOid||row.epoch!==b.epoch||row.privileged||row.grouped||row.creates||row.owns)throw new ControlError(503,'Scoped database authority changed.');
 return b;
}
/** Server configuration is only an expectation: database role/OID/org and externally
 * configured epoch must match before registration. No unchecked authority setter. */
export async function registerTenantPool(pool:Pool,expected:{org:string;epoch:string;role:string;schema:string;purpose:'web'|'worker'|'scheduler'},origin?:PoolConfig){
 const transport=origin?assertScopedPoolConstruction(origin,pool.options):undefined;if(transport&&(transport.purpose!==expected.purpose||transport.schema!==expected.schema))throw new ControlError(503,'Scoped construction binding differs.');
 if(bindings.has(pool)||!/^[_a-zA-Z][_a-zA-Z0-9]{0,62}$/.test(expected.schema)||!/^[_a-zA-Z][_a-zA-Z0-9]{0,62}$/.test(expected.role)||!/^[-_a-zA-Z0-9]{1,64}$/.test(expected.org)||!uuid.test(expected.epoch)||!['web','worker','scheduler'].includes(expected.purpose))throw new ControlError(503,'Invalid scoped pool registration.');
 const row=(await pool.query(`SELECT ${expected.schema}.ll_bound_workspace() org,${expected.schema}.ll_runtime_classification() purpose,current_user role,(SELECT oid::text FROM pg_roles WHERE rolname=current_user) role_oid,(SELECT oid::text FROM pg_database WHERE datname=current_database()) database_oid,has_schema_privilege(current_user,$2,'CREATE') creates,(SELECT epoch::text FROM ${expected.schema}.ll_workspace_recovery WHERE org_id=$1) epoch,(SELECT rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication FROM pg_roles WHERE rolname=current_user) privileged,EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)) grouped,EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$2 AND c.relkind IN ('r','p') AND pg_has_role(current_user,c.relowner,'USAGE')) owns`,[expected.org,expected.schema])).rows[0];
 if(origin)assertScopedPoolConstruction(origin,pool.options);
 if(!row||row.org!==expected.org||row.purpose!==expected.purpose||row.role!==expected.role||row.epoch!==expected.epoch.toLowerCase()||row.privileged||row.grouped||row.owns||row.creates)throw new ControlError(503,'Scoped pool registration refused.');
 const b=Object.freeze({...expected,epoch:expected.epoch.toLowerCase(),roleOid:row.role_oid,databaseOid:row.database_oid});bindings.set(pool,b);if(origin)constructed.set(pool,origin);pool.on('acquire',client=>bindings.set(client,b));return pool;
}

export function tenantPoolTransport(pool:Pool){const options=constructed.get(pool);return options?assertScopedPoolConstruction(options,pool.options):undefined;}
