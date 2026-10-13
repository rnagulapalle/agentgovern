/** Private additive quote worker publication. No owner/web/provisioner credential
 * is accepted. Native loopback execution is a disposable fixture only. */
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {readdir} from 'node:fs/promises';
import {readOwnedPrivateFile,readWorkloadInstallation} from '../workspace/tenant-bootstrap';
import {ControlError} from '../durable/contracts';
import {parseHttpsInput,readOwnedHttpsCa,type HttpsTrust} from './https-transport';
import type {ExecutionContext} from '../durable/pg-transport';
const id=/^[A-Za-z0-9_-]{1,64}$/,hash=/^[a-f0-9]{64}$/,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function exact(v:unknown,keys:string[]):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return !!d&&'value'in d&&d.enumerable;});}
type CommonQuoteWorkerExecution={workspaceId:string;recoveryEpoch:string;roleOid:string;databaseOid:string;buildId:string;scopeId:string;quoteId:string;distributorId:string;quoteBinding:string;emailBinding:string;nativeOrigin:string;emailOrigin:string;nativeToken:string;emailToken:string};
export type QuoteWorkerExecution=CommonQuoteWorkerExecution & ({contract:'quote-worker-execution-1'}|{contract:'quote-worker-execution-2';nativeTransport:HttpsTrust;emailTransport:HttpsTrust});
export function parseQuoteWorkerExecution(value:unknown):Readonly<QuoteWorkerExecution>{
 const descriptor=value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype?Object.getOwnPropertyDescriptor(value,'contract'):undefined;
 if(!descriptor||!Object.hasOwn(descriptor,'value')||!descriptor.enumerable)throw Error('Quote worker metadata');
 const contract=descriptor.value;
 const m=value as QuoteWorkerExecution;
 const common=['contract','workspaceId','recoveryEpoch','roleOid','databaseOid','buildId','scopeId','quoteId','distributorId','quoteBinding','emailBinding','nativeOrigin','emailOrigin','nativeToken','emailToken'];
 if(!m||!exact(m,contract==='quote-worker-execution-2'?[...common,'nativeTransport','emailTransport']:common)||!['quote-worker-execution-1','quote-worker-execution-2'].includes(m.contract)||![m.workspaceId,m.quoteId,m.distributorId].every(x=>typeof x==='string'&&id.test(x))||![m.recoveryEpoch,m.scopeId].every(x=>typeof x==='string'&&uuid.test(x))||![m.roleOid,m.databaseOid].every(x=>typeof x==='string'&&/^[1-9][0-9]*$/.test(x))||typeof m.buildId!=='string'||!/^quote-[a-f0-9]{64}$/.test(m.buildId)||![m.quoteBinding,m.emailBinding].every(x=>typeof x==='string'&&hash.test(x))||m.quoteBinding===m.emailBinding||![m.nativeToken,m.emailToken].every(x=>typeof x==='string'&&/^[A-Za-z0-9_-]{32,128}$/.test(x))||m.nativeToken===m.emailToken)throw Error('Quote worker metadata');
 if(m.contract==='quote-worker-execution-1'){if(m.nativeOrigin!=='http://127.0.0.1:8019'||m.emailOrigin!=='http://127.0.0.1:8018')throw Error('Quote worker fixture origin');}
 else {parseHttpsInput({origin:m.nativeOrigin,transport:m.nativeTransport});parseHttpsInput({origin:m.emailOrigin,transport:m.emailTransport});}
 return Object.freeze(structuredClone(m));
}
export async function readQuoteWorkerExecution(file:string,execution:ExecutionContext={kind:'installed-runtime'},probe?:()=>Promise<void>){
 try{
  const path=resolve(file);if(!path.endsWith('/execution.json'))throw Error('Sealed quote worker publication required');
  const dir=dirname(path),read=await readOwnedPrivateFile(path,16384),m=parseQuoteWorkerExecution(JSON.parse(read.bytes.toString('utf8')));

  if(m.contract==='quote-worker-execution-1'&&(execution.kind!=='owned-disposable-fixture'||process.env.NODE_ENV!=='test'))throw Error('Native worker execution1 is fixture-only');
  const workloads=await readWorkloadInstallation(resolve(dir,'workloads.json')),entry=workloads.config.entries[0];
  if(m.contract==='quote-worker-execution-2'&&workloads.config.transport.mode!=='verified-tls')throw Error('Installed quote requires verified database transport');
  if(entry.purpose!=='worker'||entry.org!==m.workspaceId||entry.epoch!==m.recoveryEpoch)throw Error('Exact worker publication binding');
  await probe?.();const readyRead=await readOwnedPrivateFile(resolve(dir,'ready.json'),16384),ready=JSON.parse(readyRead.bytes.toString('utf8'));
  if(!exact(ready,['installation','workloadsSha256','executionSha256'])||ready.installation!==workloads.config.installation||ready.executionSha256!==createHash('sha256').update(read.bytes).digest('hex'))throw Error('Quote worker readiness');
  const cas:Awaited<ReturnType<typeof readOwnedHttpsCa>>[]=[];if(m.contract==='quote-worker-execution-2')for(const t of [m.nativeTransport,m.emailTransport])if(t.trust==='owned-ca')cas.push(await readOwnedHttpsCa(t.caFile,t.caSha256));
  const inventory=async()=>{if((await readdir(dir)).sort().join()!=='execution.json,ready.json,workloads.json')throw Error('Execution-only directory required');};
  const assertStable=async()=>{await read.assertStable();await readyRead.assertStable();await workloads.assertStable();for(const ca of cas)await ca.assertStable();await inventory();};await assertStable();
  return {metadata:Object.freeze({...m}),workload:entry,installation:workloads.config,assertStable,nativeCredential:async()=>{await assertStable();return m.nativeToken;},emailCredential:async()=>{await assertStable();return m.emailToken;}};
 }catch{throw new ControlError(503,'Sealed quote worker execution configuration unavailable.');}
}
