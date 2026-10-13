/** Owned scheduling metadata only. No worker credential, approval or effect. */
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {readdir} from 'node:fs/promises';
import {readOwnedPrivateFile} from '../workspace/tenant-bootstrap';
import {ControlError} from '../durable/contracts';
import type {QuoteWorkerPin} from '../../runtime/temporal/quote-outbox';
const refuse=()=>new ControlError(503,'Owned quote background publication unavailable.');
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return d?.enumerable&&Object.hasOwn(d,'value');});
export async function readQuoteBackgroundGeneration(file:string){try{
 if(typeof file!=='string'||resolve(file)!==file||!file.endsWith('/background.json'))throw refuse();
 const dir=dirname(file),read=await readOwnedPrivateFile(file,16384),ready=await readOwnedPrivateFile(resolve(dir,'ready.json'),16384),m:unknown=JSON.parse(read.bytes.toString()),r:unknown=JSON.parse(ready.bytes.toString());
 if(!exact(m,['version','purpose','workspaceId','scopeId','recoveryEpoch','databaseOid','workerRoleOid','schedulerRoleOid','buildId'])||m.version!==1||m.purpose!=='quote-background-admission'||typeof m.workspaceId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(m.workspaceId)||![m.scopeId,m.recoveryEpoch].every(v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v))||![m.databaseOid,m.workerRoleOid,m.schedulerRoleOid].every(v=>typeof v==='string'&&/^[1-9][0-9]*$/.test(v))||m.workerRoleOid===m.schedulerRoleOid||typeof m.buildId!=='string'||!/^quote-[a-f0-9]{64}$/.test(m.buildId)||!exact(r,['version','purpose','sha256'])||r.version!==1||r.purpose!==m.purpose||r.sha256!==createHash('sha256').update(read.bytes).digest('hex'))throw refuse();
 const assertStable=async()=>{try{await read.assertStable();await ready.assertStable();if((await readdir(dir)).sort().join()!=='background.json,ready.json')throw refuse();}catch{throw refuse();}};await assertStable();
 const pin:QuoteWorkerPin=Object.freeze({buildId:m.buildId,workerRoleOid:m.workerRoleOid as string,schedulerRoleOid:m.schedulerRoleOid as string});
 return {workspaceId:m.workspaceId,scopeId:m.scopeId as string,recoveryEpoch:m.recoveryEpoch as string,databaseOid:m.databaseOid as string,pin,assertStable};
 }catch{throw refuse();}}
