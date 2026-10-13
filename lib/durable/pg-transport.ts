// PRIVATE UNAPPLIED: only administrator-owned installation config may select policy.
import assert from 'node:assert/strict';
import type {PoolConfig} from 'pg';
import type {ConnectionOptions} from 'node:tls';
export type PostgreSQLTransport={mode:'verified-tls';trust:'standard'}|{mode:'verified-tls';trust:'owned-ca';caFile:string;caSha256:string}|{mode:'loopback-plaintext-test-fixture';fixture:'disposable-local-postgres'};
export type PoolPurpose='broker'|'web'|'worker'|'scheduler'|'installer';
export type PoolInput={url:string;schema:string;purpose:PoolPurpose;transport?:PostgreSQLTransport};
export type ExecutionContext={kind:'installed-runtime'|'owned-disposable-fixture'};

import {constants} from 'node:fs';import {lstat,open,realpath} from 'node:fs/promises';import {resolve,dirname,parse} from 'node:path';
import {createHash,X509Certificate} from 'node:crypto';import {checkServerIdentity} from 'node:tls';import {isIP} from 'node:net';
const exact=(v:unknown,keys:string[])=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join()===keys.sort().join();
const hex=/^[a-f0-9]{64}$/;const ident=/^[_a-zA-Z][_a-zA-Z0-9]{0,62}$/;
export function parseTransport(input:unknown):PostgreSQLTransport{
 const value=input as Record<string,unknown>|undefined;
 if(input===undefined)return Object.freeze({mode:'verified-tls',trust:'standard'});
 if(exact(input,['mode','trust'])&&value!.mode==='verified-tls'&&value!.trust==='standard')return Object.freeze({...value}) as PostgreSQLTransport;
 if(exact(input,['mode','trust','caFile','caSha256'])&&value!.mode==='verified-tls'&&value!.trust==='owned-ca'&&typeof value!.caFile==='string'&&resolve(value!.caFile)===value!.caFile&&typeof value!.caSha256==='string'&&hex.test(value!.caSha256))return Object.freeze({...value}) as PostgreSQLTransport;
 if(exact(input,['mode','fixture'])&&value!.mode==='loopback-plaintext-test-fixture'&&value!.fixture==='disposable-local-postgres')return Object.freeze({...value}) as PostgreSQLTransport;
 throw Error('PostgreSQL transport configuration refused');
}
async function ownedCa(file:string,sha:string){
 for(let p=file;;p=dirname(p)){const s=await lstat(p);assert(!s.isSymbolicLink());if(p===parse(p).root)break;}
 assert.equal(await realpath(file),file);const parent=await lstat(dirname(file));assert(parent.isDirectory()&&parent.uid===process.getuid!()&&(parent.mode&0o777)===0o700);
 const f=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=await f.stat();assert(s.isFile()&&s.nlink===1&&s.uid===process.getuid!()&&(s.mode&0o777)===0o600&&s.size>0&&s.size<=65536);const bytes=await f.readFile();const after=await f.stat(),named=await lstat(file);for(const k of ['dev','ino','uid','mode','size','mtimeMs','ctimeMs'] as const){assert.equal(s[k],after[k]);assert.equal(s[k],named[k]);}const parentAfter=await lstat(dirname(file));assert.equal(await realpath(file),file);for(const k of ['dev','ino','uid','mode'] as const)assert.equal(parentAfter[k],parent[k]);assert.equal(createHash('sha256').update(bytes).digest('hex'),sha);const cert=new X509Certificate(bytes);assert(cert.ca);assert(Date.parse(cert.validFrom)<=Date.now()&&Date.parse(cert.validTo)>Date.now());return bytes;}finally{await f.close();}
}
type ScopedTransportProvenance=Readonly<{transport:PostgreSQLTransport;purpose:PoolPurpose;schema:string;execution:ExecutionContext['kind'];caSha256?:string}>;
const provenanceKey=Symbol.for('looplabs.private.scoped-transport-provenance');
const transportGlobals=globalThis as typeof globalThis & {[provenanceKey]?:WeakMap<object,ScopedTransportProvenance>};
if(typeof window!=='undefined')throw Error('Server transport construction required');
if(!Object.hasOwn(transportGlobals,provenanceKey))Object.defineProperty(transportGlobals,provenanceKey,{value:new WeakMap<object,ScopedTransportProvenance>(),writable:false,configurable:false});
const provenance=transportGlobals[provenanceKey]!;assert(provenance instanceof WeakMap);

export function assertScopedPoolConstruction(options:PoolConfig,actual:PoolConfig){const p=provenance.get(options);assert(p,'Trusted scoped construction required');if(p.caSha256){const ca=options.ssl&&typeof options.ssl==='object'?options.ssl.ca:undefined;assert(Buffer.isBuffer(ca)&&createHash('sha256').update(ca).digest('hex')===p.caSha256,'Scoped CA bytes changed');}for(const key of ['host','port','database','user','password','ssl','sslnegotiation','options','enableChannelBinding'] as const)assert(actual[key]===options[key],'Scoped pool construction changed');return p;}
/** No connectionString, URL query override, arbitrary ssl/options spread, or environment-selected identity. */
export async function scopedPoolOptions(input:unknown,execution:ExecutionContext={kind:'installed-runtime'},env:Readonly<Record<string,string|undefined>>=process.env):Promise<PoolConfig>{
 assert(exact(input,['url','schema','purpose'])||exact(input,['url','schema','purpose','transport']));const {url,schema,purpose,transport}=input as PoolInput;
 assert(['broker','web','worker','scheduler','installer'].includes(purpose));assert(ident.test(schema));assert(exact(execution,['kind'])&&['installed-runtime','owned-disposable-fixture'].includes(execution.kind));
 assert(env.NODE_TLS_REJECT_UNAUTHORIZED===undefined||env.NODE_TLS_REJECT_UNAUTHORIZED==='1');assert(env.PGSSLNEGOTIATION===undefined||env.PGSSLNEGOTIATION==='postgres');
 const u=new URL(url);assert(['postgres:','postgresql:'].includes(u.protocol)&&u.hostname&&!u.search&&!u.hash);const host=u.hostname.replace(/^\[|\]$/g,'');assert(host&&!host.startsWith('/')&&!host.includes('%'));const database=decodeURIComponent(u.pathname.slice(1)),user=decodeURIComponent(u.username),password=decodeURIComponent(u.password);assert(ident.test(database)&&ident.test(user)&&password.length>0&&password.length<=4096);const port=u.port?Number(u.port):5432;assert(Number.isSafeInteger(port)&&port>0&&port<=65535);
 const policy=parseTransport(transport);let ssl:boolean|ConnectionOptions;
 if(policy.mode==='loopback-plaintext-test-fixture'){assert.equal(execution.kind,'owned-disposable-fixture');assert(['127.0.0.1','::1'].includes(host));ssl=false;}
 else{ssl={rejectUnauthorized:true,minVersion:'TLSv1.2',checkServerIdentity:(_name,cert)=>checkServerIdentity(host,cert)};if(!isIP(host))ssl.servername=host;if(policy.trust==='owned-ca')ssl.ca=await ownedCa(policy.caFile,policy.caSha256);Object.freeze(ssl);}
 const options=Object.freeze({host,port,database,user,password,ssl,sslnegotiation:'postgres',options:`-c search_path=${schema}`,max:purpose==='installer'?1:3,connectionTimeoutMillis:5000,query_timeout:10000,statement_timeout:10000,enableChannelBinding:true});provenance.set(options,Object.freeze({transport:policy,purpose,schema,execution:execution.kind,...(typeof ssl==='object'&&Buffer.isBuffer(ssl.ca)?{caSha256:createHash('sha256').update(ssl.ca).digest('hex')}:{})}));return options;
}
