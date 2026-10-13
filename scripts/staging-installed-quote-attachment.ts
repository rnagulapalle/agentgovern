/** Attach existing sealed quote publications to distinct worker/scheduler services.
 * This does not issue workload authority, enroll builds or start containers. */
import assert from 'node:assert/strict';
import {basename,dirname,join,resolve} from 'node:path';
import {mkdir,writeFile,readdir} from 'node:fs/promises';
import {readQuoteWorkerExecution} from '../lib/quotes/worker-execution-generation';
import {readWorkloadInstallation} from '../lib/workspace/tenant-bootstrap';
type Temporal=Record<string,string>;
export async function attachInstalledQuoteRuntime(input:{workerExecutionFile:string;schedulerFile:string;workloadToken:string;taskQueue:string;temporal:Temporal},output:string){
 assert.deepEqual(Object.keys(input).sort(),['workerExecutionFile','schedulerFile','workloadToken','taskQueue','temporal'].sort());
 assert(/^[A-Za-z0-9_-]{32,128}$/.test(input.workloadToken));assert(/^[A-Za-z0-9_-]{1,128}$/.test(input.taskQueue));
 const worker=await readQuoteWorkerExecution(input.workerExecutionFile),scheduler=await readWorkloadInstallation(input.schedulerFile),w=worker.workload,s=scheduler.config.entries[0],m=worker.metadata;
 assert.equal(m.contract,'quote-worker-execution-2');assert.equal(w.org,'local-proof');assert.equal(s.org,w.org);assert.equal(s.epoch,w.epoch);assert.equal(s.purpose,'scheduler');assert.notEqual(s.role,w.role);
 assert.equal(scheduler.config.installation,worker.installation.installation);assert.equal(scheduler.config.schema,worker.installation.schema);assert.equal(scheduler.config.database,worker.installation.database);assert.deepEqual(scheduler.config.transport,worker.installation.transport);
 assert.deepEqual(Object.keys(input.temporal).sort(),['LOOPLABS_TEMPORAL_ADDRESS','LOOPLABS_TEMPORAL_NAMESPACE','LOOPLABS_TEMPORAL_API_KEY','LOOPLABS_TEMPORAL_CA_PATH','LOOPLABS_TEMPORAL_CERT_PATH','LOOPLABS_TEMPORAL_KEY_PATH'].sort());assert.equal(input.temporal.LOOPLABS_TEMPORAL_ADDRESS,'temporal:7233');assert(/^looplabs-staging-[a-z0-9-]+$/.test(input.temporal.LOOPLABS_TEMPORAL_NAMESPACE));assert(input.temporal.LOOPLABS_TEMPORAL_API_KEY.length>=32);
 for(const [key,path]of Object.entries({LOOPLABS_TEMPORAL_CA_PATH:'/run/temporal-tls/ca.pem',LOOPLABS_TEMPORAL_CERT_PATH:'/run/temporal-tls/client.pem',LOOPLABS_TEMPORAL_KEY_PATH:'/run/temporal-tls/client.key'}))assert.equal(input.temporal[key],path);
 const transport=worker.installation.transport;assert(transport?.mode==='verified-tls'&&transport.trust==='owned-ca');
 // Keep purpose directories and their CA trust disjoint; no owner generation
 // or web credential is mounted into a quote runtime service.
 const workerFile=join(dirname(input.workerExecutionFile),'workloads.json');
 for(const file of [workerFile,input.schedulerFile,transport.caFile])assert.equal(resolve(file),file);
 const dirs=[dirname(workerFile),dirname(input.schedulerFile),dirname(transport.caFile)];assert.equal(new Set(dirs).size,3);assert(dirs.every(a=>dirs.every(b=>a===b||!a.startsWith(b+'/')&&!b.startsWith(a+'/'))));
 assert(Number.isSafeInteger(process.getuid!())&&process.getuid!()>0&&process.getgid!()>0);
 const trustFiles=new Map<string,Set<string>>();
 for(const tls of [transport,...(m.contract==='quote-worker-execution-2'?[m.nativeTransport,m.emailTransport]:[])])if(tls.trust==='owned-ca'){const dir=dirname(tls.caFile);assert(!dirs.slice(0,2).some(d=>dir===d||dir.startsWith(d+'/')||d.startsWith(dir+'/')));const expected=trustFiles.get(dir)??new Set<string>();expected.add(basename(tls.caFile));trustFiles.set(dir,expected);}
 for(const [dir,names]of trustFiles)assert.deepEqual((await readdir(dir)).sort(),[...names].sort(),'Trust-only CA directory required; no signing key or credential mount');
 const user=`${process.getuid!()}:${process.getgid!()}`,mount=(p:string)=>({type:'bind',source:p,target:p,read_only:true});
 const common={...input.temporal,LOOPLABS_WORKSPACE_ID:w.org,LOOPLABS_TEMPORAL_WORKSPACE:'staging',LOOPLABS_RECOVERY_EPOCH:w.epoch,LOOPLABS_TEMPORAL_WORKER_TOKEN:input.workloadToken,LOOPLABS_TEMPORAL_BUILD_ID:m.buildId,LOOPLABS_TEMPORAL_TASK_QUEUE:input.taskQueue};
 await mkdir(output,{mode:0o700});
 const services:Record<string,unknown>={};for(const purpose of ['worker','scheduler'] as const){const entry=purpose==='worker'?w:s,file=purpose==='worker'?workerFile:input.schedulerFile,env={...common,LOOPLABS_WORKLOAD_INSTALLATION_FILE:file,LOOPLABS_DATABASE_URL:entry.url,LOOPLABS_TENANT_DATABASE_ROLE:entry.role,LOOPLABS_TENANT_DATABASE_SCHEMA:worker.installation.schema,...(purpose==='worker'?{LOOPLABS_QUOTE_WORKER_EXECUTION_FILE:input.workerExecutionFile}:{})};for(const [k,v]of Object.entries(env))assert(/^[A-Z][A-Z0-9_]*$/.test(k)&&typeof v==='string'&&!/[\r\n\0]/.test(v));await writeFile(join(output,'quote-'+purpose+'.env'),Object.entries(env).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600,flag:'wx'});
 const volumes=[mount(dirname(file)),mount(dirname(transport.caFile))];if(purpose==='worker'&&m.contract==='quote-worker-execution-2')for(const tls of [m.nativeTransport,m.emailTransport])if(tls.trust==='owned-ca'&&!volumes.some(v=>v.source===dirname(tls.caFile)))volumes.push(mount(dirname(tls.caFile)));
 services['quote-'+purpose]={user,command:['node','.worker/quote-temporal-service.cjs',purpose,'quote'],env_file:[join(output,'quote-'+purpose+'.env')],volumes};}
 await worker.assertStable();await scheduler.assertStable();await writeFile(join(output,'compose-quote-installed.json'),JSON.stringify({services}),{mode:0o600,flag:'wx'});
 return {attached:true as const,roleCount:2,sqlPurposeSeparation:true as const,currentImageExecuted:false as const,releaseAccepted:false as const};
}
