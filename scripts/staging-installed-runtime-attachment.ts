// Existing eight-service trial attachment. Reads sealed administrator generations;
// never installs, enrolls a build, approves work or starts a container.
import assert from 'node:assert/strict';
import {dirname,join,resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {readInstalledAssemblyGenerations} from './staging-installed-publication';
import {scopedPoolOptions} from '../lib/durable/pg-transport';
type Files={webFile:string;workerFile:string;schedulerFile:string};
type Settings={origin:string;buildId:string;taskQueue:string;workloadToken:string;connectorToken:string;records:string;temporal:Record<string,string>};
export function installedRuntimeTopology(files:Files,caFile:string,uid:number,gid:number){
 for(const file of [...Object.values(files),caFile])assert.equal(resolve(file),file);
 assert(Number.isSafeInteger(uid)&&uid>0&&Number.isSafeInteger(gid)&&gid>0,'Non-root owned runtime identity required');
 const dirs=Object.values(files).map(dirname);assert.equal(new Set(dirs).size,3,'Distinct sealed purpose directories required');
 assert(dirs.every(a=>dirs.every(b=>a===b||(!a.startsWith(b+'/')&&!b.startsWith(a+'/')))));
 const caDir=dirname(caFile);assert(dirs.every(d=>d!==caDir&&!d.startsWith(caDir+'/')&&!caDir.startsWith(d+'/')));
 const mount=(p:string)=>({type:'bind',source:p,target:p,read_only:true});
 return {services:{
  web:{user:`${uid}:${gid}`,volumes:[mount(dirs[0]),mount(caDir)]},
  'temporal-worker':{user:`${uid}:${gid}`,env_file:['${LOOPLABS_STAGING_PRIVATE_DIR}/worker.env'],volumes:[mount(dirs[1]),mount(caDir)]},
  'temporal-scheduler':{user:`${uid}:${gid}`,env_file:['${LOOPLABS_STAGING_PRIVATE_DIR}/scheduler.env'],volumes:[mount(dirs[2]),mount(caDir)]},
 }};
}
export async function attachInstalledRuntime(files:Files,settings:Settings,output:string){
 assert.deepEqual(Object.keys(settings).sort(),['origin','buildId','taskQueue','workloadToken','connectorToken','records','temporal'].sort());
 const generation=await readInstalledAssemblyGenerations(files),web=generation.web.config;
 assert(web.transport?.mode==='verified-tls'&&web.transport.trust==='owned-ca');
 assert(/^ack-[a-f0-9]{64}$/.test(settings.buildId));assert(/^[a-zA-Z0-9_-]{1,128}$/.test(settings.taskQueue));
 for(const token of [settings.workloadToken,settings.connectorToken])assert(/^[a-zA-Z0-9_-]{32,128}$/.test(token));
 const origin=new URL(settings.origin);assert.equal(origin.protocol,'https:');assert(!origin.username&&!origin.password&&origin.pathname==='/'&&!origin.search&&!origin.hash);
 assert.deepEqual(Object.keys(settings.temporal).sort(),['LOOPLABS_TEMPORAL_ADDRESS','LOOPLABS_TEMPORAL_NAMESPACE','LOOPLABS_TEMPORAL_API_KEY','LOOPLABS_TEMPORAL_CA_PATH','LOOPLABS_TEMPORAL_CERT_PATH','LOOPLABS_TEMPORAL_KEY_PATH'].sort());
 assert.equal(settings.temporal.LOOPLABS_TEMPORAL_ADDRESS,'temporal:7233');assert(/^looplabs-staging-[a-z0-9-]+$/.test(settings.temporal.LOOPLABS_TEMPORAL_NAMESPACE));assert(settings.temporal.LOOPLABS_TEMPORAL_API_KEY.length>=32);
 for(const [k,v]of Object.entries({LOOPLABS_TEMPORAL_CA_PATH:'/run/temporal-tls/ca.pem',LOOPLABS_TEMPORAL_CERT_PATH:'/run/temporal-tls/client.pem',LOOPLABS_TEMPORAL_KEY_PATH:'/run/temporal-tls/client.key'}))assert.equal(settings.temporal[k],v);
 const caFile=web.transport.caFile;
 const topology=installedRuntimeTopology(files,caFile,process.getuid!(),process.getgid!());
 // Reading scoped options validates the actual CA bytes, ownership, mode,
 // digest and hostname verifier. It does not open a connection or enroll work.
 await scopedPoolOptions({url:web.broker.url,schema:web.schema,purpose:'broker',transport:web.transport});
 const shared={LOOPLABS_WORKSPACE_ID:'local-proof',LOOPLABS_TEMPORAL_WORKSPACE:'staging',LOOPLABS_TEMPORAL_BUILD_ID:settings.buildId,LOOPLABS_TEMPORAL_RECORD_BUILD_ID:settings.buildId,LOOPLABS_RECORD_CATALOG:settings.records,LOOPLABS_CONNECTOR_TWIN_URL:'http://connector-twin:8018',LOOPLABS_CONNECTOR_TWIN_TOKEN:settings.connectorToken};
 const env:Record<string,Record<string,string>>={web:{...shared,LOOPLABS_TENANT_WEB_CONFIG:files.webFile,LOOPLABS_DURABLE_ORIGIN:origin.origin,LOOPLABS_RECOVERY_EPOCH:web.web[0].epoch}};
 for(const purpose of ['worker','scheduler'] as const){
  const c=generation[purpose].config,e=c.entries[0];assert.equal(e.purpose,purpose);assert.equal(c.installation,web.installation);assert.equal(c.schema,web.schema);assert.equal(c.database,web.database);assert.deepEqual(c.transport,web.transport);assert.equal(e.epoch,web.web[0].epoch);assert.equal(e.org,'local-proof');assert.notEqual(e.role,web.web[0].role);
  env[purpose]={...shared,...settings.temporal,LOOPLABS_WORKLOAD_INSTALLATION_FILE:files[purpose==='worker'?'workerFile':'schedulerFile'],LOOPLABS_DATABASE_URL:e.url,LOOPLABS_TENANT_DATABASE_ROLE:e.role,LOOPLABS_TENANT_DATABASE_SCHEMA:c.schema,LOOPLABS_RECOVERY_EPOCH:e.epoch,LOOPLABS_TEMPORAL_WORKER_TOKEN:settings.workloadToken,LOOPLABS_TEMPORAL_TASK_QUEUE:settings.taskQueue};
 }
 assert.notEqual(env.worker.LOOPLABS_TENANT_DATABASE_ROLE,env.scheduler.LOOPLABS_TENANT_DATABASE_ROLE);
 for(const values of Object.values(env))for(const [k,v]of Object.entries(values)){assert(/^[A-Z][A-Z0-9_]*$/.test(k));assert(typeof v==='string'&&!/[\r\n\0]/.test(v));}
 await generation.web.assertStable();await generation.worker.assertStable();await generation.scheduler.assertStable();
 await mkdir(output,{mode:0o700});
 for(const [role,values]of Object.entries(env))await writeFile(join(output,role+'.env'),Object.entries(values).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600,flag:'wx'});
 await writeFile(join(output,'compose-installed.json'),JSON.stringify(topology),{mode:0o600,flag:'wx'});
 await generation.web.assertStable();await generation.worker.assertStable();await generation.scheduler.assertStable();
 return {attached:true,roleCount:3,distinctSqlPurposes:true,sameCanonicalMountPaths:true,verifiedCaRead:true,runtimeStarted:false,admissionEstablished:false,releaseAccepted:false};
}
