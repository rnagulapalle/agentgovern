import {isDeepStrictEqual} from 'node:util';
import type {Pool,PoolClient} from 'pg';
import {tenantPoolBinding,assertTenantPool,tenantPoolTransport} from '../durable/tenant-pool';
/** Separate, administrator-owned execution publication for the isolated native
 * quote fixture. Publication is not provider conformance or action authority. */
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {readdir} from 'node:fs/promises';
import {ControlError} from '../durable/contracts';
import type {ExecutionContext} from '../durable/pg-transport';
import {readPublishedWebGeneration,readOwnedPrivateFile} from '../workspace/tenant-bootstrap';
import {parseHttpsInput,readOwnedHttpsCa,type HttpsTrust} from './https-transport';
import type {QuotePlanProposal} from './plan';
const id=/^[A-Za-z0-9_-]{1,64}$/,hash=/^[a-f0-9]{64}$/,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,member=/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
function exact(v:unknown,keys:string[]):v is Record<string,unknown>{if(!v||typeof v!=='object'||Object.getPrototypeOf(v)!==Object.prototype)return false;const d=Object.getOwnPropertyDescriptors(v);return Reflect.ownKeys(v).length===keys.length&&keys.every(k=>d[k]&&'value'in d[k]&&d[k].enumerable);}
function refuse():never{throw new ControlError(503,'A sealed, separate supported quote execution generation is required.');}
type BaseMetadata={workspaceId:string;scopeId:string;requester:string;origin:string;quoteId:string;quoteBinding:string;emailBinding:string;distributorId:string;lines:QuotePlanProposal['quote']['lines'];provisionerFile:string};
export type QuoteExecutionMetadata=BaseMetadata & ({version:1}|{version:2;webGenerationFile:string;emailOrigin:string;nativeTransport:HttpsTrust;emailTransport:HttpsTrust;recoveryEpoch:string;roleOid:string;databaseOid:string});
export async function readQuoteExecutionGeneration(file:string,execution:ExecutionContext={kind:'installed-runtime'},readProbe?:()=>Promise<void>){
 try{
  // Current native execution transport supports an owned local fixture only.
  // An owned file or its mode must never turn production plaintext on.
  if(typeof window!=='undefined'||typeof file!=='string'||file!==resolve(file)||!file.endsWith('/execution.json'))refuse();
  const configRead=await readOwnedPrivateFile(file,32768),readyRead=await readOwnedPrivateFile(resolve(dirname(file),'ready.json'),16384);
  const c:unknown=JSON.parse(configRead.bytes.toString('utf8')),r:unknown=JSON.parse(readyRead.bytes.toString('utf8'));
  const d=c&&typeof c==='object'&&Object.getPrototypeOf(c)===Object.prototype?Object.getOwnPropertyDescriptor(c,'version'):undefined;
  if(!d||!Object.hasOwn(d,'value')||!d.enumerable)refuse();const version=d.value;
  const keys=['version','purpose','workspaceId','scopeId','requester','origin','quoteId','quoteBinding','emailBinding','distributorId','lines','provisionerFile','nativeToken','emailToken'];
  if(!exact(c,version===2?[...keys,'emailOrigin','nativeTransport','emailTransport','recoveryEpoch','roleOid','databaseOid','webGenerationFile']:keys)||![1,2].includes(Number(version))||c.purpose!=='quote-demo-execution'||!['workspaceId','quoteId','distributorId'].every(k=>typeof c[k]==='string'&&id.test(c[k] as string))||typeof c.scopeId!=='string'||!uuid.test(c.scopeId)||typeof c.requester!=='string'||c.requester.length>254||!member.test(c.requester)||!['quoteBinding','emailBinding'].every(k=>typeof c[k]==='string'&&hash.test(c[k] as string))||c.quoteBinding===c.emailBinding||!['nativeToken','emailToken'].every(k=>typeof c[k]==='string'&&/^[A-Za-z0-9_-]{32,128}$/.test(c[k] as string))||c.nativeToken===c.emailToken||typeof c.provisionerFile!=='string'||c.provisionerFile!==resolve(c.provisionerFile)||!c.provisionerFile.endsWith('/provisioner.json')||dirname(c.provisionerFile)===dirname(file))refuse();
  let web:Awaited<ReturnType<typeof readPublishedWebGeneration>>|undefined;
  const cas:Awaited<ReturnType<typeof readOwnedHttpsCa>>[]=[];
  if(version===1){if(execution.kind!=='owned-disposable-fixture'||c.origin!=='http://127.0.0.1:8019')refuse();}
  else {if(typeof c.recoveryEpoch!=='string'||!uuid.test(c.recoveryEpoch)||![c.roleOid,c.databaseOid].every(x=>typeof x==='string'&&/^[1-9][0-9]*$/.test(x)))refuse();for(const input of [{origin:c.origin,transport:c.nativeTransport},{origin:c.emailOrigin,transport:c.emailTransport}]){const parsed=parseHttpsInput(input);if(parsed.transport.trust==='owned-ca')cas.push(await readOwnedHttpsCa(parsed.transport.caFile,parsed.transport.caSha256));}}
  if(version===2){if(typeof c.webGenerationFile!=='string'||resolve(c.webGenerationFile)!==c.webGenerationFile||dirname(c.webGenerationFile)===dirname(file))refuse();web=await readPublishedWebGeneration(c.webGenerationFile);if(web.config.transport?.mode!=='verified-tls'||web.config.web.filter(e=>e.org===c.workspaceId&&e.epoch===c.recoveryEpoch).length!==1)refuse();if(web.config.transport.trust==='owned-ca')cas.push(await readOwnedHttpsCa(web.config.transport.caFile,web.config.transport.caSha256));}
  if(!Array.isArray(c.lines)||c.lines.length<1||c.lines.length>100)refuse();let sum=0n;const seen=new Set<string>();
  for(const line of c.lines){if(!exact(line,['id','quantity','unitPriceMinor'])||typeof line.id!=='string'||!id.test(line.id)||seen.has(line.id)||!Number.isSafeInteger(line.quantity)||Number(line.quantity)<1||Number(line.quantity)>1000000||!Number.isSafeInteger(line.unitPriceMinor)||Number(line.unitPriceMinor)<1)refuse();seen.add(line.id);sum+=BigInt(line.quantity as number)*BigInt(line.unitPriceMinor as number);}
  if(sum>BigInt(Number.MAX_SAFE_INTEGER)||!exact(r,['version','purpose','sha256'])||r.version!==version||r.purpose!=='quote-demo-execution'||r.sha256!==createHash('sha256').update(configRead.bytes).digest('hex'))refuse();
  const assertStable=async()=>{try{await configRead.assertStable();await readyRead.assertStable();await web?.assertStable();for(const ca of cas)await ca.assertStable();if((await readdir(dirname(file))).sort().join()!=='execution.json,ready.json')refuse();}catch{refuse();}};
  await assertStable();await readProbe?.();await assertStable();
  const {nativeToken,emailToken,purpose,...metadata}=c;void purpose;
  const snapshot=structuredClone(metadata) as QuoteExecutionMetadata;
  snapshot.lines.forEach(Object.freeze);Object.freeze(snapshot.lines);
  const assertWebPool=async(db:Pool,client?:PoolClient)=>{
   let xid:string|undefined;
   if(client){
    if(!tenantPoolBinding(db)||tenantPoolBinding(db)!==tenantPoolBinding(client))refuse();
    const b=await assertTenantPool(client,snapshot.workspaceId);
    if(b.purpose!=='web'||snapshot.version===2&&(b.epoch!==snapshot.recoveryEpoch||b.roleOid!==snapshot.roleOid||b.databaseOid!==snapshot.databaseOid))refuse();
    xid=(await client.query('SELECT pg_current_xact_id_if_assigned()::text xid')).rows[0]?.xid;if(!xid)refuse();
   }
   if(snapshot.version!==2)return;
   await assertStable();const published=web?.config,entry=published?.web.find(e=>e.org===snapshot.workspaceId&&e.epoch===snapshot.recoveryEpoch);
   if(!published||!entry||published.transport?.mode!=='verified-tls')refuse();
   const checkTransport=()=>{const t=tenantPoolTransport(db);if(!t||t.execution!=='installed-runtime'||t.purpose!=='web'||t.schema!==published.schema||!isDeepStrictEqual(t.transport,published.transport))refuse();};
   checkTransport();
   const rows=(await (client??db).query('SELECT ssl,version FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows;
   if(rows.length!==1||rows[0].ssl!==true||!['TLSv1.2','TLSv1.3'].includes(rows[0].version))refuse();
   await assertStable();checkTransport();
   if(client){await assertTenantPool(client,snapshot.workspaceId);if(tenantPoolBinding(db)!==tenantPoolBinding(client)||(await client.query('SELECT pg_current_xact_id_if_assigned()::text xid')).rows[0]?.xid!==xid)refuse();}
  };
  // Callback-only credentials; no tokens are returned in metadata or diagnostics.
  return {metadata:Object.freeze(snapshot),assertWebPool,subtotalMinor:Number(sum),assertStable,nativeCredential:async()=>{await assertStable();return nativeToken as string;},emailCredential:async()=>{await assertStable();return emailToken as string;}};
 }catch{refuse();}
}
