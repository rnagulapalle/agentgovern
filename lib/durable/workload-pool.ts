import { Pool } from 'pg';
import {readWorkloadInstallation} from '../workspace/tenant-bootstrap';
import {scopedPoolOptions,type ExecutionContext} from './pg-transport';
import { ControlError } from './contracts';
import { assertTenantPool,registerTenantPool } from './tenant-pool';
export async function registerWorkloadPool(db:Pool,env:Readonly<Record<string,string|undefined>>,purpose:'worker'|'scheduler'){
 const org=env.LOOPLABS_WORKSPACE_ID,epoch=env.LOOPLABS_RECOVERY_EPOCH,role=env.LOOPLABS_TENANT_DATABASE_ROLE,schema=env.LOOPLABS_TENANT_DATABASE_SCHEMA;
 if(!org||!epoch||!role||!schema)throw new ControlError(503,'Scoped workload installation required.');
 await registerTenantPool(db,{org,epoch,role,schema,purpose});await assertTenantPool(db,org);return db;
}

/** Published owner-created worker generation only; never reads broker/web passwords. */
export async function createWorkloadPool(env:Readonly<Record<string,string|undefined>>,purpose:'worker'|'scheduler',max=3,readProbe?:()=>Promise<void>,execution:ExecutionContext={kind:'installed-runtime'}){
 let db:Pool|undefined;try{if(!env.LOOPLABS_WORKLOAD_INSTALLATION_FILE||!Number.isSafeInteger(max)||max<1||max>32)throw Error('workload config');const loaded=await readWorkloadInstallation(env.LOOPLABS_WORKLOAD_INSTALLATION_FILE,readProbe),c=loaded.config;
 const entries=c.entries.filter(e=>e.url===env.LOOPLABS_DATABASE_URL&&e.org===env.LOOPLABS_WORKSPACE_ID&&e.epoch===env.LOOPLABS_RECOVERY_EPOCH&&e.role===env.LOOPLABS_TENANT_DATABASE_ROLE&&e.purpose===purpose);if(entries.length!==1||c.schema!==env.LOOPLABS_TENANT_DATABASE_SCHEMA)throw Error('workload binding');const entry=entries[0];const options=await scopedPoolOptions({url:entry.url,schema:c.schema,purpose,transport:c.transport},execution);await loaded.assertStable();db=new Pool({...options,max});await registerWorkloadPool(db,env,purpose);await loaded.assertStable();return db;
 }catch{await db?.end();throw new ControlError(503,'Scoped workload installation unavailable.');}
}
