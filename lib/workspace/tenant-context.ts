import type { Pool } from 'pg';
import { ControlError } from '../durable/contracts';
import { assertTenantPool } from '../durable/tenant-pool';
import { authenticate } from '../durable/service';
import { digest,memberSession } from './identity';
import { signIn,passwordMatches,passwordHash } from './auth';
const validatedContexts=new WeakSet<object>();
const dummy=passwordHash('unavailable-account','00000000000000000000000000000000');
/** Broker grants are narrow EXECUTE-only. Its result selects a server registry
 * pool; existing authentication and the live DB binding are checked again. */
export class TenantContext {
 private constructor(private broker:Pool,private pools:ReadonlyMap<string,Pool>,private schema:string){}
 static async create(broker:Pool,pools:ReadonlyMap<string,Pool>,schema:string,brokerRole:string){
  if(!/^[_a-zA-Z][_a-zA-Z0-9]{0,62}$/.test(schema)||!pools.size)throw new ControlError(503,'Tenant context unavailable.');
  const brokerFacts=(await broker.query(`SELECT current_user role,(SELECT rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication FROM pg_roles WHERE rolname=current_user) privileged,EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)) grouped,has_schema_privilege(current_user,$1,'CREATE') creates,EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','p','v','m') AND c.relname LIKE 'll_%' AND has_table_privilege(current_user,c.oid,'SELECT')) reads,EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','p') AND c.relname LIKE 'll_%' AND has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')) writes`,[schema])).rows[0];
  if(!brokerFacts||brokerFacts.role!==brokerRole||brokerFacts.privileged||brokerFacts.grouped||brokerFacts.creates||brokerFacts.reads||brokerFacts.writes)throw new ControlError(503,'Restricted broker required.');
  for(const [org,pool]of pools){const b=await assertTenantPool(pool,org);if(b.purpose!=='web')throw new ControlError(503,'Web pool required.');}
  const context=new TenantContext(broker,new Map(pools),schema);validatedContexts.add(context);return context;
 }
 // Construct a bundle-local facade from the server's already validated context;
 // this preserves canonical ControlError identity without trusting request data.
 static installedFacade(context:TenantContext){
  const local=new TenantContext(context.broker,new Map(context.pools),context.schema);
  local.salesOrg=context.salesOrg;return local;
 }
 private salesOrg:string|undefined;
 async configureSales(org:string){if(this.salesOrg)throw new ControlError(503,'Sales workspace is immutable.');await this.selected(org);this.salesOrg=org;}
 async sales(){if(!this.salesOrg)throw new ControlError(503,'Sales intake unavailable.');await this.admit('sales',digest('public-sales'));return this.selected(this.salesOrg);}
 private async selected(org:unknown){if(typeof org!=='string'||!this.pools.has(org))throw new ControlError(401,'Valid workspace credentials are required.');const db=this.pools.get(org)!;await assertTenantPool(db,org);return db;}
 async login(value:Record<string,unknown>){
  if(Object.keys(value).some(k=>!['email','password'].includes(k))||typeof value.email!=='string'||typeof value.password!=='string'||value.email.length>254||value.password.length>256||!value.password)throw new ControlError(400,'Enter your email and password.');
  const email=value.email.trim().toLowerCase();await this.admit('login',digest(email));
  const org=(await this.broker.query(`SELECT ${this.schema}.ll_login_workspace($1) org`,[email])).rows[0]?.org;
  if(!org){passwordMatches(value.password,dummy);throw new ControlError(401,'Email or password is incorrect.');}
  return signIn(await this.selected(org),value);
 }
 private async credential(token:string){if(!/^[a-zA-Z0-9_-]{32,128}$/.test(token))throw new ControlError(401,'Valid workspace credentials are required.');const org=(await this.broker.query(`SELECT ${this.schema}.ll_credential_workspace($1) org`,[digest(token)])).rows[0]?.org;return this.selected(org);}
 async authenticated(token:string){const db=await this.credential(token),actor=await authenticate(db,token);await assertTenantPool(db,actor.orgId);return{db,actor};}
 async member(token:string){const db=await this.credential(token),actor=await memberSession(db,token);if(!actor)throw new ControlError(401,'Sign in to your workspace.');await assertTenantPool(db,actor.orgId);return{db,actor};}
 async logout(token:string){try{const {db}=await this.member(token);await db.query('DELETE FROM ll_sessions WHERE hash=$1',[digest(token)]);}catch(error){if(!(error instanceof ControlError)||error.status!==401)throw error;}}
 async admitPlanner(token:string){const context=await this.member(token);await this.admit('chat',digest(context.actor.orgId+':'+context.actor.subject));return context;}

 private async admit(purpose:'login'|'chat'|'sales',principal:string){const allowed=(await this.broker.query(`SELECT ${this.schema}.ll_global_admit($1,$2) allowed`,[purpose,principal])).rows[0]?.allowed;if(allowed!==true)throw new ControlError(429,'Too many requests. Please try again later.');}
}
const contextKey=Symbol.for('looplabs.private.v11.tenant-context');
const server=globalThis as typeof globalThis & {[contextKey]?:Readonly<{context:TenantContext}>};
let local:TenantContext|undefined;
export function configureTenantContext(context:TenantContext){
 if(typeof window!=='undefined'||!(context instanceof TenantContext)||!validatedContexts.has(context)||Object.prototype.hasOwnProperty.call(server,contextKey))throw new ControlError(503,'Tenant context is immutable.');
 Object.defineProperty(server,contextKey,{value:Object.freeze({context}),writable:false,configurable:false});
}
export function tenantContext(){
 if(typeof window!=='undefined'||!Object.prototype.hasOwnProperty.call(server,contextKey))throw new ControlError(503,'Tenant context unavailable.');
 const descriptor=Object.getOwnPropertyDescriptor(server,contextKey);
 if(!descriptor||descriptor.writable||descriptor.configurable||!Object.isFrozen(descriptor.value)||!descriptor.value.context)throw new ControlError(503,'Tenant context unavailable.');
 return local??=(TenantContext.installedFacade(descriptor.value.context));
}
