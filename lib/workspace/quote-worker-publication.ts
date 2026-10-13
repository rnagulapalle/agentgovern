/** Offline additive publisher for an already-installed dedicated quote worker.
 * Reuses installed transport/FD/hash readers; creates no role/grant/action/pin. */
import type {Pool} from 'pg';
import {Pool as PostgreSQLPool} from 'pg';
import {lstat,mkdir,realpath,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {parseWorkloadInstallation} from './tenant-bootstrap';
import {scopedPoolOptions,type ExecutionContext} from '../durable/pg-transport';
import {registerTenantPool,assertTenantPool} from '../durable/tenant-pool';
import {readQuoteWorkerExecution,parseQuoteWorkerExecution} from '../quotes/worker-execution-generation';
export async function publishQuoteWorkerExecution(owner:Pool,output:string,workloads:unknown,input:unknown,execution:ExecutionContext={kind:'installed-runtime'}){
 // Explicit native fixture boundary: publication cannot establish remote provider support.
 const metadata=parseQuoteWorkerExecution(input);
 if(metadata.contract==='quote-worker-execution-1'&&(execution.kind!=='owned-disposable-fixture'||process.env.NODE_ENV!=='test'))throw Error('Native worker publication1 remains fixture-only');
 const config=parseWorkloadInstallation(workloads);if(config.entries.length!==1||config.entries[0].purpose!=='worker')throw Error('Single quote worker generation required');
 if(metadata.contract==='quote-worker-execution-2'&&config.transport.mode!=='verified-tls')throw Error('Installed quote publication requires verified database transport');
 const entry=config.entries[0],schema=config.schema;
 if((await owner.query(`SELECT ${schema}.ll_runtime_classification() purpose`)).rows[0]?.purpose!=='offline')throw Error('Offline publisher required');
 const facts=(await owner.query(`SELECT q.role_oid::text oid,b.org_id,r.rolname FROM ${schema}.ll_quote_workload_roles q JOIN ${schema}.ll_runtime_workspace_bindings b ON b.login_oid=q.role_oid AND b.org_id=q.org_id AND b.purpose=q.purpose JOIN pg_roles r ON r.oid=q.role_oid WHERE q.org_id=$1 AND q.purpose='worker' AND r.rolname=$2`,[entry.org,entry.role])).rows;
 if(facts.length!==1||facts[0].oid!==metadata.roleOid||metadata.workspaceId!==entry.org||metadata.recoveryEpoch!==entry.epoch)throw Error('Existing dedicated worker identity required');
 const check=new PostgreSQLPool(await scopedPoolOptions({url:entry.url,schema,purpose:'worker',transport:config.transport},execution));
 try{await registerTenantPool(check,{...entry,schema});const b=await assertTenantPool(check,entry.org);if(b.roleOid!==metadata.roleOid||b.databaseOid!==metadata.databaseOid)throw Error('Exact installed worker database identity required');}finally{await check.end();}
 const dir=resolve(output),parent=dirname(dir);if(await realpath(parent)!==parent)throw Error('Owned canonical publication parent required');const p=await lstat(parent);if(!p.isDirectory()||p.uid!==process.getuid!()||(p.mode&0o777)!==0o700)throw Error('Owned private publication parent required');
 // mkdir is exclusive. Existing/symlink generations are never overwritten.
 await mkdir(dir,{mode:0o700});const w=JSON.stringify(config),e=JSON.stringify(metadata);
 await writeFile(join(dir,'workloads.json'),w,{mode:0o600,flag:'wx'});await writeFile(join(dir,'execution.json'),e,{mode:0o600,flag:'wx'});
 await writeFile(join(dir,'ready.json'),JSON.stringify({installation:config.installation,workloadsSha256:createHash('sha256').update(w).digest('hex'),executionSha256:createHash('sha256').update(e).digest('hex')}),{mode:0o600,flag:'wx'});
 const read=await readQuoteWorkerExecution(join(dir,'execution.json'),execution);await read.assertStable();
 return {scope:metadata.contract==='quote-worker-execution-2'?'sealed verified TLS worker publication only' as const:'owned native fixture worker publication only' as const,activated:false as const,roleOid:metadata.roleOid,databaseOid:metadata.databaseOid};
}

/** Offline installed-web execution publication. The existing tenant web
 * publication is read, not copied: owner/broker credentials never enter output. */
export async function publishQuoteWebExecution(owner:Pool,output:string,webFile:string,input:unknown){
 const keys=['version','purpose','workspaceId','scopeId','requester','origin','quoteId','quoteBinding','emailBinding','distributorId','lines','provisionerFile','nativeToken','emailToken','emailOrigin','nativeTransport','emailTransport','recoveryEpoch','roleOid','databaseOid','webGenerationFile'];
 const visited=new WeakSet<object>();const dataOnly=(v:unknown):boolean=>{if(v===null||typeof v!=='object')return ['string','number','boolean'].includes(typeof v);if(visited.has(v))return false;visited.add(v);if(!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype)return false;const good=Reflect.ownKeys(v).every(k=>{if(Array.isArray(v)&&k==='length')return true;const d=Object.getOwnPropertyDescriptor(v,k);return typeof k==='string'&&!!d&&Object.hasOwn(d,'value')&&d.enumerable&&dataOnly(d.value);});visited.delete(v);return good;};
 if(!input||typeof input!=='object'||Object.getPrototypeOf(input)!==Object.prototype||Reflect.ownKeys(input).length!==keys.length||!keys.every(k=>Object.hasOwn(input,k))||!dataOnly(input))throw Error('Exact descriptor-only web publication required');
 const metadata=structuredClone(input) as Record<string,unknown>;if(metadata.version!==2||metadata.purpose!=='quote-demo-execution'||metadata.webGenerationFile!==webFile)throw Error('Installed web metadata2 required');
 const {parseHttpsInput}=await import('../quotes/https-transport');parseHttpsInput({origin:metadata.origin,transport:metadata.nativeTransport});parseHttpsInput({origin:metadata.emailOrigin,transport:metadata.emailTransport});
 const {readPublishedWebGeneration}=await import('./tenant-bootstrap');
 const {readQuoteExecutionGeneration}=await import('../quotes/execution-generation');
 const web=await readPublishedWebGeneration(webFile),config=web.config;
 if(config.transport?.mode!=='verified-tls')throw Error('Verified installed database publication required');
 if((await owner.query(`SELECT ${config.schema}.ll_runtime_classification() purpose`)).rows[0]?.purpose!=='offline')throw Error('Offline publisher required');
 const dir=resolve(output),parent=dirname(dir);if(await realpath(parent)!==parent)throw Error('Owned canonical publication parent required');const p=await lstat(parent);if(!p.isDirectory()||p.uid!==process.getuid!()||(p.mode&0o777)!==0o700)throw Error('Owned private publication parent required');
 const bytes=JSON.stringify(metadata);if(Buffer.byteLength(bytes)>32768)throw Error('Bounded publication required');await mkdir(dir,{mode:0o700});await writeFile(join(dir,'execution.json'),bytes,{mode:0o600,flag:'wx'});await writeFile(join(dir,'ready.json'),JSON.stringify({version:2,purpose:'quote-demo-execution',sha256:createHash('sha256').update(bytes).digest('hex')}),{mode:0o600,flag:'wx'});
 const generation=await readQuoteExecutionGeneration(join(dir,'execution.json')),m=generation.metadata;if(m.version!==2)throw Error('Installed web metadata2 required');
 const entries=config.web.filter(e=>e.org===m.workspaceId&&e.epoch===m.recoveryEpoch);if(entries.length!==1)throw Error('Exact existing web login required');const entry=entries[0];
 const check=new PostgreSQLPool(await scopedPoolOptions({url:entry.url,schema:config.schema,purpose:'web',transport:config.transport}));
 try{await registerTenantPool(check,{...entry,schema:config.schema});const b=await assertTenantPool(check,entry.org);if(b.roleOid!==m.roleOid||b.databaseOid!==m.databaseOid||b.epoch!==m.recoveryEpoch)throw Error('Exact installed web database identity required');await generation.assertStable();await web.assertStable();}finally{await check.end();}
 return {scope:'sealed verified TLS web publication only' as const,activated:false as const,roleOid:m.roleOid,databaseOid:m.databaseOid};
}
