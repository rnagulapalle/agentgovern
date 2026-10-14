// Transport-only successor publication. Never provisions a tenant, identity,
// approval, quote pin or effect, and never rewrites retained generations.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {basename,dirname,resolve} from 'node:path';
import {mkdir,readdir,writeFile} from 'node:fs/promises';
import {readOwnedPrivateFile} from '../lib/workspace/owned-private-file.ts';
const sha=b=>createHash('sha256').update(b).digest('hex');
const json=b=>JSON.parse(Buffer.from(b).toString());
const bytes=v=>Buffer.from(JSON.stringify(v)+'\n');
const transportKeys=new Set(['transport','databaseTransport','nativeTransport','emailTransport']);
const linkKeys=new Set(['webGenerationFile','provisionerFile','tlsFile']);
const names=new Set(['web.json','workloads.json','execution.json','background.json','listener.json','provisioner.json','tls.json']);
const lookup=(map,key)=>Object.hasOwn(map,key)?map[key]:undefined;
const path=p=>{assert(typeof p==='string'&&resolve(p)===p&&!/[\r\n\0]/.test(p));return p;};
function transport(v){assert(v&&typeof v==='object'&&!Array.isArray(v));assert.deepEqual(Object.keys(v).sort(),['caFile','caSha256','mode','trust']);assert(v.mode==='verified-tls'&&v.trust==='owned-ca');path(v.caFile);assert(/^[a-f0-9]{64}$/.test(v.caSha256));}
export function mapPublicationPaths(value,mappings){
 if(typeof value==='string')return lookup(mappings,value)??value;
 if(Array.isArray(value))return value.map(v=>mapPublicationPaths(v,mappings));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,mapPublicationPaths(v,mappings)]));
 return value;
}
export function validateSealedPublication(records){
 assert(records&&typeof records==='object'&&!Array.isArray(records));const keys=Object.keys(records).sort();assert(keys.includes('ready.json'));assert(keys.every(n=>names.has(n)||n==='ready.json'||n==='cert.pem'||n==='key.pem'));const r=json(records['ready.json']);
 const payloads=keys.filter(n=>names.has(n));assert(payloads.length>0&&payloads.length<=2);
 for(const n of payloads){const v=json(records[n]);assert(v&&typeof v==='object'&&!Array.isArray(v));for(const [k,t]of Object.entries(v))if(transportKeys.has(k))transport(t);}
 if(keys.includes('web.json')){assert(keys.join()==='ready.json,web.json');assert(r.webSha256===sha(records['web.json']));assert(r.installation===json(records['web.json']).installation);}
 else if(keys.includes('workloads.json')){assert(['ready.json,workloads.json','execution.json,ready.json,workloads.json'].includes(keys.join()));assert(r.workloadsSha256===sha(records['workloads.json']));assert(r.installation===json(records['workloads.json']).installation);if(keys.includes('execution.json'))assert(r.executionSha256===sha(records['execution.json']));}
 else{assert(payloads.length===1);const v=json(records[payloads[0]]);assert.deepEqual(Object.keys(r).sort(),['purpose','sha256','version']);assert(r.sha256===sha(records[payloads[0]])&&r.version===v.version&&r.purpose===v.purpose);if(payloads[0]==='tls.json'){assert(keys.join()==='cert.pem,key.pem,ready.json,tls.json');assert(v.certSha256===sha(records['cert.pem'])&&v.keySha256===sha(records['key.pem']));}else assert(keys.length===2);}
 return true;
}
export function renewSealedPublication(records,{paths,authorities,leaf}){
 validateSealedPublication(records);assert(paths&&authorities&&Array.isArray(authorities)&&authorities.length===3);assert(new Set(authorities.map(a=>a.oldFile)).size===3);for(const a of authorities){path(a.oldFile);path(a.newFile);assert(a.oldFile!==a.newFile&&/^[a-f0-9]{64}$/.test(a.oldSha)&&/^[a-f0-9]{64}$/.test(a.newSha)&&a.oldSha!==a.newSha);}
 const result=Object.fromEntries(Object.entries(records).map(([k,v])=>[k,Buffer.from(v)]));
 for(const n of Object.keys(records).filter(n=>names.has(n))){const before=json(records[n]),after=structuredClone(before);for(const [k,v]of Object.entries(before)){if(transportKeys.has(k)){const a=authorities.find(a=>a.oldFile===v.caFile);assert(a&&a.oldSha===v.caSha256,'Exact retained CA identity required');after[k]={...v,caFile:a.newFile,caSha256:a.newSha};}else if(linkKeys.has(k)){assert(Object.hasOwn(paths,v),'Linked successor generation required');after[k]=paths[v];}}
 if(n==='tls.json'){assert(leaf?.cert&&leaf?.key);after.certSha256=sha(leaf.cert);after.keySha256=sha(leaf.key);result['cert.pem']=Buffer.from(leaf.cert);result['key.pem']=Buffer.from(leaf.key);}
 // Reverse only the permitted transport/link/certificate changes, then compare
 // every authority field, including role URLs, tokens, scope, epoch and OIDs.
 const reversed=structuredClone(after);for(const k of Object.keys(before)){if(transportKeys.has(k)||linkKeys.has(k))reversed[k]=before[k];}if(n==='tls.json'){reversed.certSha256=before.certSha256;reversed.keySha256=before.keySha256;}assert.deepEqual(reversed,before,'Transport renewal changed execution authority');result[n]=bytes(after);
 }
 const r=json(records['ready.json']);if(result['web.json'])r.webSha256=sha(result['web.json']);else if(result['workloads.json']){r.workloadsSha256=sha(result['workloads.json']);if(result['execution.json'])r.executionSha256=sha(result['execution.json']);}else r.sha256=sha(result[Object.keys(result).find(n=>names.has(n))]);result['ready.json']=bytes(r);validateSealedPublication(result);return result;
}
export async function readSealedPublication(directory){path(directory);const files=await readdir(directory),reads={};for(const name of files){assert(names.has(name)||['ready.json','cert.pem','key.pem'].includes(name),'Unexpected private publication file');reads[name]=await readOwnedPrivateFile(resolve(directory,name),131072);}const records=Object.fromEntries(Object.entries(reads).map(([n,r])=>[n,r.bytes]));validateSealedPublication(records);return {records,assertStable:async()=>{assert.deepEqual((await readdir(directory)).sort(),files.sort());for(const r of Object.values(reads))await r.assertStable();}};}
export async function publishSealedSuccessor(directory,records){path(directory);validateSealedPublication(records);await mkdir(directory,{mode:0o700});for(const [name,b]of Object.entries(records))await writeFile(resolve(directory,name),b,{mode:0o600,flag:'wx'});const actual=await readSealedPublication(directory);assert.deepEqual(actual.records,records);return actual;}
const services=['application-db','quote-email','quote-twin','quote-scheduler','quote-worker','temporal-scheduler','temporal-worker','web'];
export function rebindInternalTlsCompose(before,{directories,files,web}){
 assert(before&&typeof before==='object'&&!Array.isArray(before));assert(Object.keys(before.services).every(s=>!['__proto__','constructor','prototype'].includes(s)));assert(services.every(s=>before.services[s]));const after=structuredClone(before);
 const replace=v=>{if(typeof v==='string')return lookup(files,v)??lookup(directories,v)??v;if(Array.isArray(v))return v.map(replace);return v;};
 for(const name of services){const service=after.services[name];assert(Array.isArray(service.volumes));for(const mount of service.volumes){assert(typeof mount==='object'&&mount.type==='bind'||mount.type==='volume');if(mount.type==='bind'){const next=lookup(directories,mount.source)??lookup(files,mount.source);if(next){assert(mount.read_only===true,'Renewal cannot replace writable state');mount.source=next;if(Object.hasOwn(directories,mount.target))mount.target=directories[mount.target];else if(Object.hasOwn(files,mount.target))mount.target=files[mount.target];}}}
 if(service.environment)service.environment=Object.fromEntries(Object.entries(service.environment).map(([k,v])=>[k,replace(v)]));if(service.command)service.command=replace(service.command);if(service.healthcheck?.test){assert(Array.isArray(service.healthcheck.test));service.healthcheck.test=service.healthcheck.test.map(v=>{const direct=replace(v);if(direct!==v)return direct;assert(typeof v==='string');const entries=Object.entries(files).sort((a,b)=>b[0].length-a[0].length);const matches=entries.filter(([old])=>v.includes(old));assert(matches.every(([old])=>!v.includes(old+'/')),'Ambiguous healthcheck publication path');let next=v;for(const [old,to]of matches)next=next.split(old).join(to);return next;});}
 }
 const db=after.services['application-db'];assert(db.command.length===1);db.command=[retainedDatabaseStartup(db.command[0])];assert.deepEqual(db.volumes.filter(v=>v.read_only===false),before.services['application-db'].volumes.filter(v=>v.read_only===false));
 if(web){assert(/^sha256:[a-f0-9]{64}$/.test(web.image));after.services.web.image=web.image;after.services.web.environment=Object.fromEntries(Object.entries(web.environment).map(([k,v])=>[k,replace(v)]));after.services.web.networks=structuredClone(web.networks);}
 for(const name of Object.keys(before.services).filter(s=>!services.includes(s)))assert.deepEqual(after.services[name],before.services[name]);
 return after;
}
export function renewalPublicationDirectories(ready){assert(ready?.version===1&&ready.purpose==='retained-private-installed-runtime');const files=[...Object.values(ready.files),...Object.values(ready.quoteFiles),...Object.values(ready.quotePublications),ready.quoteProvider.listenerFile];assert(files.every(f=>typeof f==='string'&&names.has(basename(f))));return [...new Set(files.map(dirname))];}
export const internalTlsServices=Object.freeze(services);
// A successor root holds only scoped runtime publications, never the offline
// installation/owner credential bundle or mutable email/provider state.
export async function prepareInternalTlsPublications({applicationRoot,generation,certificates}){
 path(applicationRoot);path(generation);assert(generation.startsWith(applicationRoot+'/internal-tls-')&&/^internal-tls-[a-f0-9]{24}$/.test(basename(generation)),'Exclusive successor under retained authority required');
 const input=await readOwnedPrivateFile(resolve(applicationRoot,'runtime-continuation/retained-runtime-ready.json'),131072),ready=json(input.bytes);const baseDirectories=renewalPublicationDirectories(ready),webRead=await readSealedPublication(dirname(ready.quotePublications.webExecutionFile)),listenerRead=await readSealedPublication(dirname(ready.quoteProvider.listenerFile));const web=json(webRead.records['execution.json']),listener=json(listenerRead.records['listener.json']);
 const emailFile=ready.quoteProvider.emailProcess.argv.at(-1);assert(emailFile.endsWith('/tls.json'));const directories=[...new Set([...baseDirectories,dirname(web.provisionerFile),dirname(listener.tlsFile),dirname(emailFile)])];assert(directories.length>=9&&directories.length<=12);assert(directories.every(d=>d.startsWith(applicationRoot+'/')&&!d.includes('/internal-tls-')));
 const records=new Map();for(const dir of directories)records.set(dir,await readSealedPublication(dir));
 const db=json(records.get(dirname(ready.files.webFile)).records['web.json']).transport;
 const authorities=[['db',db],['native',web.nativeTransport],['email',web.emailTransport]].map(([kind,t])=>{transport(t);const c=certificates[kind];assert(c?.caFile&&c.caSha256);return {kind,oldFile:t.caFile,oldSha:t.caSha256,newFile:c.caFile,newSha:c.caSha256};});
 for(const a of authorities){const old=await readOwnedPrivateFile(a.oldFile,65536),next=await readOwnedPrivateFile(a.newFile,65536);assert(sha(old.bytes)===a.oldSha&&sha(next.bytes)===a.newSha,'Observed exact CA bytes required');await old.assertStable();await next.assertStable();}
 const directoryMap=Object.fromEntries(directories.map(d=>[d,resolve(generation,d.slice(applicationRoot.length+1))])),paths={};for(const [old,next]of Object.entries(directoryMap))for(const n of Object.keys(records.get(old).records))paths[resolve(old,n)]=resolve(next,n);
 for(const a of authorities){paths[a.oldFile]=a.newFile;directoryMap[dirname(a.oldFile)]=dirname(a.newFile);}
 const serverMap={};for(const [kind,old]of [['native',dirname(listener.tlsFile)],['email',dirname(emailFile)]]){const c=certificates[kind];const cert=await readOwnedPrivateFile(resolve(c.serverDirectory,'cert.pem'),65536),key=await readOwnedPrivateFile(resolve(c.serverDirectory,'key.pem'),65536);assert(sha(cert.bytes)===c.certificateSha256&&sha(key.bytes)===c.keySha256);serverMap[old]={cert:cert.bytes,key:key.bytes};await cert.assertStable();await key.assertStable();}
 const successors=new Map();for(const [old,read]of records){const next=renewSealedPublication(read.records,{paths,authorities,leaf:serverMap[old]});successors.set(directoryMap[old],next);}
 for(const read of records.values())await read.assertStable();await input.assertStable();
 // Caller already created the exclusive generation to issue its certificates.
 // Each publication is then exclusive; interruption leaves an unselected partial
 // generation, never a ready pointer and never changed retained files.
 for(const [dir,next]of successors){await mkdir(dirname(dir),{recursive:true,mode:0o700});await publishSealedSuccessor(dir,next);}
 const continuation=mapPublicationPaths(ready,paths);const reversed=mapPublicationPaths(continuation,Object.fromEntries(Object.entries(paths).map(([a,b])=>[b,a])));assert.deepEqual(reversed,ready);const continuationDir=resolve(generation,'runtime-continuation');await mkdir(continuationDir,{mode:0o700});await writeFile(resolve(continuationDir,'retained-runtime-ready.json'),bytes(continuation),{mode:0o600,flag:'wx'});
 const successorDigests=Object.fromEntries([...successors].flatMap(([d,rs])=>Object.entries(rs).map(([n,b])=>[resolve(d,n),sha(b)])));successorDigests[resolve(continuationDir,'retained-runtime-ready.json')]=sha(bytes(continuation));
 const sourceDigests=Object.fromEntries([...records].flatMap(([d,r])=>Object.entries(r.records).map(([n,b])=>[resolve(d,n),sha(b)])));sourceDigests[resolve(applicationRoot,'runtime-continuation/retained-runtime-ready.json')]=sha(input.bytes);for(const a of authorities){sourceDigests[a.oldFile]=a.oldSha;successorDigests[a.newFile]=a.newSha;}
 for(const read of records.values())await read.assertStable();await input.assertStable();
 return {version:1,purpose:'transport-only-internal-tls-publications',applicationRoot,generation,directories:directoryMap,files:paths,authorities,sourceDigests,successorDigests,continuationSha256:sha(bytes(continuation)),executionAuthorityChanged:false,published:true,activated:false};
}
export async function selectInternalTlsApplicationRoot(originalRoot,sourceFreezeSha256,configurationRoot='/srv/looplabs-production/config'){
 path(originalRoot);path(configurationRoot);assert(/^[a-f0-9]{64}$/.test(sourceFreezeSha256));
 const {lstat,readlink}=await import('node:fs/promises');const pointer=resolve(configurationRoot,'internal-tls-current');let s;try{s=await lstat(pointer);}catch(e){if(e.code==='ENOENT')return originalRoot;throw e;}
 assert(s.isSymbolicLink()&&s.uid===process.getuid());const target=await readlink(pointer);assert(target.startsWith(configurationRoot+'/temporal-renewal-')&&/^temporal-renewal-[a-f0-9]{24}$/.test(basename(dirname(target)))&&basename(target)==='internal-tls-activation.json');
 const read=await readOwnedPrivateFile(target,131072),receipt=json(read.bytes);assert(receipt.contract==='owned-internal-tls-activation-1'&&receipt.activated===true&&receipt.executionAuthorityChanged===false&&receipt.applicationRoot===originalRoot&&receipt.sourceFreezeSha256===sourceFreezeSha256);assert(receipt.generation.startsWith(originalRoot+'/internal-tls-')&&/^internal-tls-[a-f0-9]{24}$/.test(basename(receipt.generation)));
 const ready=await readOwnedPrivateFile(resolve(receipt.generation,'runtime-continuation/retained-runtime-ready.json'),131072);assert(sha(ready.bytes)===receipt.continuationSha256&&json(ready.bytes).sourceFreezeSha256===sourceFreezeSha256);await read.assertStable();await ready.assertStable();assert(await readlink(pointer)===target);return receipt.generation;
}

export function retainedDatabaseStartup(command){
 assert(typeof command==='string'&&command.includes('PG_VERSION')&&command.split('exec postgres -D /owned-pg ').length===2,'Exact retained PostgreSQL startup required');const tail=command.split('exec postgres -D /owned-pg ')[1];assert(tail.includes('ssl=on')&&tail.includes('ssl_cert_file=/owned-tls/server.pem')&&tail.includes('ssl_key_file=/owned-tls/server.key')&&!/initdb|PG_VERSION|[\r\n]/.test(tail),'Verified TLS flags retained exactly');
 return (`set -eu\nmajor=$(postgres --version | sed -n 's/^postgres (PostgreSQL) \\([0-9][0-9]*\\)\\..*/\\1/p')\n[ -n "$major" ] || exit 70\n[ -s /owned-pg/PG_VERSION ] || exit 71\n[ "$(cat /owned-pg/PG_VERSION)" = "$major" ] || exit 72\n[ -s /owned-pg/pg_hba.conf ] || exit 73\nexec postgres -D /owned-pg `+tail).replaceAll('$',()=> '$$');
}
export function assertRetainedPostgresMetadata(value){assert(value&&typeof value==='object'&&!Array.isArray(value));assert.deepEqual(Object.keys(value).sort(),['hbaPresent','pgVersion','postgresVersion']);assert(typeof value.pgVersion==='string'&&/^[1-9][0-9]*$/.test(value.pgVersion)&&typeof value.postgresVersion==='string');const version=value.postgresVersion.match(/^postgres \(PostgreSQL\) ([1-9][0-9]*)\.[0-9]+(?:[^\r\n]*)$/);assert(version&&version[1]===value.pgVersion&&value.hbaPresent===true,'Existing matching PostgreSQL data and HBA required before renewal');return true;}
