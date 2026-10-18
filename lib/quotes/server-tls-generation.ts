/** Isolated native listener publication; not a production execution factory. */
import {readdir} from 'node:fs/promises';
import {readOwnedPrivateFile} from '../workspace/owned-private-file';
import {resolve,dirname} from 'node:path';
import {createHash,createPrivateKey,X509Certificate} from 'node:crypto';
import {createServer} from 'node:https';
import type {RequestListener} from 'node:http';
import {ControlError} from '../durable/contracts';
type Scope=Readonly<{workspaceId:string;quoteId:string;quoteBinding:string;emailBinding:string}>;
const refuse=()=>new ControlError(503,'Owned verified native listener generation unavailable.');
function exact(v:unknown,keys:string[]):v is Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.getPrototypeOf(v)!==Object.prototype)return false;const d=Object.getOwnPropertyDescriptors(v);return Reflect.ownKeys(d).length===keys.length&&keys.every(k=>d[k]?.enumerable&&Object.hasOwn(d[k],'value'));}
async function privateBytes(file:string,max:number){
 const read=await readOwnedPrivateFile(file,max);if(!read.bytes.length)throw refuse();return {bytes:read.bytes,stable:async()=>{try{await read.assertStable();}catch{throw refuse();}}};
}
/** Fixed loopback listener is intentionally still a controlled application
 * endpoint. It does not establish hosted atomicity or externally reachable TLS. */
export async function readNativeQuoteTlsGeneration(file:string,scope:Scope){
 try{
  if(typeof window!=='undefined'||typeof file!=='string'||file!==resolve(file)||!file.endsWith('/tls.json')||!exact(scope,['workspaceId','quoteId','quoteBinding','emailBinding'])||![scope.workspaceId,scope.quoteId].every(v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(v))||![scope.quoteBinding,scope.emailBinding].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))||scope.quoteBinding===scope.emailBinding)throw refuse();
  const bound=Object.freeze({...scope});const dir=dirname(file),config=await privateBytes(file,16384),ready=await privateBytes(resolve(dir,'ready.json'),16384),cert=await privateBytes(resolve(dir,'cert.pem'),65536),key=await privateBytes(resolve(dir,'key.pem'),16384);
  const c:unknown=JSON.parse(config.bytes.toString('utf8')),r:unknown=JSON.parse(ready.bytes.toString('utf8'));const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
  if(!exact(c,['version','purpose','workspaceId','quoteId','quoteBinding','emailBinding','certSha256','keySha256'])||c.version!==1||c.purpose!=='native-quote-server'||Object.keys(bound).some(k=>c[k]!==bound[k as keyof Scope])||c.certSha256!==digest(cert.bytes)||c.keySha256!==digest(key.bytes)||!exact(r,['version','purpose','sha256'])||r.version!==1||r.purpose!=='native-quote-server'||r.sha256!==digest(config.bytes))throw refuse();
  if(!/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\s*$/.test(cert.bytes.toString('utf8'))||!/^-----BEGIN PRIVATE[ ]KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PRIVATE[ ]KEY-----\s*$/.test(key.bytes.toString('utf8')))throw refuse();
  const leaf=new X509Certificate(cert.bytes);if(leaf.ca||!leaf.checkIP('127.0.0.1')||Date.parse(leaf.validFrom)>Date.now()||Date.parse(leaf.validTo)<=Date.now()||!leaf.checkPrivateKey(createPrivateKey(key.bytes)))throw refuse();
  const assertStable=async()=>{await Promise.all([config.stable(),ready.stable(),cert.stable(),key.stable()]);if((await readdir(dir)).sort().join()!=='cert.pem,key.pem,ready.json,tls.json'||Date.parse(leaf.validTo)<=Date.now())throw refuse();};await assertStable();
  return {assertStable,createServer:(handler:RequestListener)=>createServer({cert:cert.bytes,key:key.bytes,minVersion:'TLSv1.2',handshakeTimeout:3000},async(req,res)=>{try{await assertStable();await handler(req,res);}catch{if(!res.destroyed&&!res.headersSent){res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end('{"status":"unavailable"}');}else res.destroy();}})};
 }catch{throw refuse();}
}
