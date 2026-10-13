// Owner-only disposable networking publication. Does not alter original role/epoch grants or activate a process.
import assert from 'node:assert/strict';
import {mkdir,writeFile,lstat,realpath,readdir,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {readWorkloadInstallation,parseWorkloadInstallation} from '../lib/workspace/tenant-bootstrap';
export async function publishTemporalProofRole(source:string,destination:string,purpose:'worker'|'scheduler',host:'host.docker.internal'|'127.0.0.1',port:number,caFile:string){
 assert(['worker','scheduler'].includes(purpose));assert(['host.docker.internal','127.0.0.1'].includes(host));assert(Number.isInteger(port)&&port>0&&port<65536);assert(caFile.startsWith('/'));if(host==='host.docker.internal')assert.equal(caFile,'/proof-db/ca.pem');
 const loaded=await readWorkloadInstallation(source);assert.equal(loaded.config.entries.length,1);assert.equal(loaded.config.entries[0].purpose,purpose);assert(loaded.config.transport.mode==='verified-tls'&&loaded.config.transport.trust==='owned-ca');
 const config=structuredClone(loaded.config),entry=config.entries[0],url=new URL(entry.url);assert.equal(url.hostname,'localhost');url.hostname=host;url.port=String(port);entry.url=url.href;
 config.transport={...loaded.config.transport,caFile};parseWorkloadInstallation(config);await loaded.assertStable();
 const parent=dirname(destination);assert.equal(await realpath(parent),parent,'Canonical owned publication parent required');const parentStat=await lstat(parent);assert(parentStat.isDirectory()&&!parentStat.isSymbolicLink()&&parentStat.uid===process.getuid!()&&(parentStat.mode&0o777)===0o700);
 await mkdir(destination,{mode:0o700});const created=await lstat(destination);assert(created.isDirectory()&&!created.isSymbolicLink()&&created.uid===process.getuid!());
 try{const bytes=JSON.stringify(config);await writeFile(join(destination,'workloads.json'),bytes,{mode:0o600,flag:'wx'});await writeFile(join(destination,'ready.json'),JSON.stringify({installation:config.installation,workloadsSha256:createHash('sha256').update(bytes).digest('hex')}),{mode:0o600,flag:'wx'});await loaded.assertStable();assert.equal(await realpath(destination),destination);const finished=await lstat(destination);assert.equal(finished.ino,created.ino);assert.equal(finished.dev,created.dev);
 }catch(error){const current=await lstat(destination);if(current.isDirectory()&&!current.isSymbolicLink()&&current.ino===created.ino&&current.dev===created.dev&&current.uid===process.getuid!()&&(await readdir(destination)).every(f=>['workloads.json','ready.json'].includes(f)))await rm(destination,{recursive:true});throw error;}
 return{directory:destination,environment:{LOOPLABS_DATABASE_URL:entry.url,LOOPLABS_WORKSPACE_ID:entry.org,LOOPLABS_RECOVERY_EPOCH:entry.epoch,LOOPLABS_TENANT_DATABASE_ROLE:entry.role,LOOPLABS_TENANT_DATABASE_SCHEMA:config.schema,LOOPLABS_WORKLOAD_INSTALLATION_FILE:host==='host.docker.internal'?'/proof-runtime/workloads.json':join(destination,'workloads.json')}};
}
