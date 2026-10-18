import {it,expect} from 'vitest';
import {validateInstalledAssemblyCoupling,validateCurrentInspectedImage,prepareInstalledAssemblyPublication,readInstalledAssemblyGenerations,assertNamedAssemblyActors} from './staging-installed-publication';
// Labelled consistency observations, not a PostgreSQL/image/publication trial.
const epoch='00000000-0000-4000-8000-000000000001';
function fixture(){
 const expected={installation:'proof',schema:'proof_schema',database:'fixture',org:'local-proof',epoch,roles:{web_role:'11',worker_role:'12',scheduler_role:'13'}};
 const entry=(purpose:'web'|'worker'|'scheduler')=>({purpose,role:purpose+'_role',org:'local-proof',epoch,url:`postgres://${purpose}_role:private@localhost/fixture`});
 const common={version:1 as const,installation:'proof',schema:'proof_schema',database:'fixture',transport:{mode:'verified-tls' as const,trust:'standard' as const}};
 const web={...common,broker:{url:'postgres://broker:separate@localhost/fixture',role:'broker'},definer:'definer',helpers:Object.fromEntries(['ll_bound_workspace','ll_credential_workspace','ll_global_admit','ll_login_workspace','ll_named_subject_exists','ll_runtime_classification'].map(name=>[name,'a'.repeat(64)])),web:[entry('web')],workloads:[],salesOrg:'local-proof'};
 const worker={...common,entries:[entry('worker')]},scheduler={...common,entries:[entry('scheduler')]};
 const binding=(purpose:'web'|'worker'|'scheduler',roleOid:string)=>({org:'local-proof',epoch,role:purpose+'_role',schema:'proof_schema',purpose,roleOid,databaseOid:'20'});
 return{expected,web,worker,scheduler,bindings:{web:binding('web','11'),worker:binding('worker','12'),scheduler:binding('scheduler','13')}};
}
const validate=(x:ReturnType<typeof fixture>)=>validateInstalledAssemblyCoupling(x.expected,x.web,x.worker,x.scheduler,x.bindings);
it('correlates installed observations without granting runtime or release authority',()=>{expect(validate(fixture())).toEqual({contract:'installed-assembly-publication-coupling-1',installation:'proof',schema:'proof_schema',org:'local-proof',epoch});});
it('wrong tenant, purpose, epoch, installation, role/OID, database and transport refuse',()=>{
 const changes=[(x:ReturnType<typeof fixture>)=>{x.expected.database='foreign';},(x:ReturnType<typeof fixture>)=>{x.worker.entries[0].org='foreign';},(x:ReturnType<typeof fixture>)=>{x.worker.entries[0].purpose='scheduler' as 'worker';},(x:ReturnType<typeof fixture>)=>{x.scheduler.entries[0].epoch='00000000-0000-4000-8000-000000000002';},(x:ReturnType<typeof fixture>)=>{x.worker.installation='other';},(x:ReturnType<typeof fixture>)=>{x.bindings.worker.roleOid='99';},(x:ReturnType<typeof fixture>)=>{x.bindings.worker.databaseOid='21';},(x:ReturnType<typeof fixture>)=>{x.bindings.web.schema='other';},(x:ReturnType<typeof fixture>)=>{x.scheduler.entries[0].role='web_role';},(x:ReturnType<typeof fixture>)=>{x.worker.transport={mode:'loopback-plaintext-test-fixture'} as unknown as typeof x.worker.transport;},(x:ReturnType<typeof fixture>)=>{x.worker.entries[0].url='postgres://worker_role:private@foreign.test/fixture';},(x:ReturnType<typeof fixture>)=>{x.web.web[0].role='broker';},(x:ReturnType<typeof fixture>)=>{x.worker.entries.push({...x.worker.entries[0]});},(x:ReturnType<typeof fixture>)=>{x.bindings.worker.purpose='web' as 'worker';}];
 for(const change of changes){const x=fixture();change(x);expect(()=>validate(x)).toThrow();}
});
it('requires exact independent image/source observation and actual inspected byte equality',()=>{
 const h='a'.repeat(64),imageId='sha256:'+h,inspected={buildId:'ack-'+h,serviceHash:h,workflowHash:h,lockHash:h},current={...inspected,imageId,profile:'ack' as const,constructionSha256:h};
 expect(()=>validateCurrentInspectedImage(imageId,h,current,inspected)).not.toThrow();
 for(const key of ['imageId','profile','buildId','serviceHash','workflowHash','lockHash','constructionSha256'] as const){const changed={...current,[key]:'foreign'};expect(()=>validateCurrentInspectedImage(imageId,h,changed as typeof current,inspected)).toThrow();}
 expect(()=>validateCurrentInspectedImage(imageId,h,{...current,eligible:true} as typeof current,inspected)).toThrow();expect(()=>validateCurrentInspectedImage(imageId,h,current,{...inspected,serviceHash:'b'.repeat(64)})).toThrow();
});
it('missing trusted verifier and mutable image refuse before any source/database/docker action',async()=>{
 let touched=false;const x={verifyCurrentImage:undefined,imageId:'mutable:latest',docker:()=>{touched=true;throw Error('not allowed');}} as unknown as Parameters<typeof prepareInstalledAssemblyPublication>[0];
 await expect(prepareInstalledAssemblyPublication({...x,output:'/private/tmp/unused-publication'})).rejects.toThrow('publication refused');expect(touched).toBe(false);
});

import {mkdtemp,mkdir,writeFile,rm,symlink,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
async function privateFiles(run:(files:{webFile:string;workerFile:string;schedulerFile:string})=>Promise<void>){
 const root=await mkdtemp(join(await realpath(tmpdir()),'ll-publication-contract-'));await chmod(root,0o700);
 try{const f=fixture();for(const name of ['ll_bound_workspace','ll_credential_workspace','ll_global_admit','ll_login_workspace','ll_named_subject_exists','ll_runtime_classification'])f.web.helpers[name as keyof typeof f.web.helpers]='a'.repeat(64) as never;
 const files={webFile:join(root,'web','web.json'),workerFile:join(root,'worker','workloads.json'),schedulerFile:join(root,'scheduler','workloads.json')};
 for(const role of ['web','worker','scheduler'] as const){const dir=join(root,role);await mkdir(dir,{mode:0o700});const bytes=Buffer.from(JSON.stringify(f[role]));await writeFile(files[(role+'File') as keyof typeof files],bytes,{mode:0o600});await writeFile(join(dir,'ready.json'),JSON.stringify({installation:'proof',[role==='web'?'webSha256':'workloadsSha256']:createHash('sha256').update(bytes).digest('hex')}),{mode:0o600});}
 await run(files);
 }finally{await rm(root,{recursive:true});}
}
it('real owned private files are captured with sealed web and exactly one login per poller; no DB is opened',async()=>privateFiles(async files=>{
 const loaded=await readInstalledAssemblyGenerations(files);expect(loaded.web.config.workloads).toHaveLength(0);expect(loaded.worker.config.entries).toHaveLength(1);expect(loaded.scheduler.config.entries[0].purpose).toBe('scheduler');await loaded.worker.assertStable();await loaded.web.assertStable();
 // Changing bytes after read cannot be silently used by publication.
 await writeFile(files.workerFile,'{}',{mode:0o600});await expect(loaded.worker.assertStable()).rejects.toThrow();
}));
it('unsealed, permissive, symlink and tampered generations refuse without owner fallback',async()=>{
 await privateFiles(async files=>{await writeFile(join(join(files.webFile,'..'),'extra'),'private',{mode:0o600});await expect(readInstalledAssemblyGenerations(files)).rejects.toThrow();});
 await privateFiles(async files=>{await chmod(files.schedulerFile,0o644);await expect(readInstalledAssemblyGenerations(files)).rejects.toThrow();});
 await privateFiles(async files=>{await rm(files.workerFile);await symlink(files.schedulerFile,files.workerFile);await expect(readInstalledAssemblyGenerations(files)).rejects.toThrow();});
 await privateFiles(async files=>{await writeFile(join(files.workerFile,'..','ready.json'),JSON.stringify({installation:'proof',workloadsSha256:'0'.repeat(64)}),{mode:0o600});await expect(readInstalledAssemblyGenerations(files)).rejects.toThrow();});
});

import {readFile} from 'node:fs/promises';
it('initial and final named checks deny foreign workspace, wrong subject and alternate pool',()=>{
 const db={} as import('pg').Pool,expected={org:'local-proof',named:{requester:'owner@example.test',reviewer:'manager@example.test'}},requester={db,actor:{orgId:expected.org,subject:expected.named.requester}},reviewer={db,actor:{orgId:expected.org,subject:expected.named.reviewer}};
 expect(()=>assertNamedAssemblyActors(expected,requester,reviewer)).not.toThrow();
 for(const field of ['orgId','subject'] as const){expect(()=>assertNamedAssemblyActors(expected,{...requester,actor:{...requester.actor,[field]:'foreign'}},reviewer)).toThrow();expect(()=>assertNamedAssemblyActors(expected,requester,{...reviewer,actor:{...reviewer.actor,[field]:'foreign'}})).toThrow();}
 expect(()=>assertNamedAssemblyActors(expected,requester,{...reviewer,db:{} as import('pg').Pool})).toThrow();
});
it('preparer has no enrollment or write-SQL path, so a failed publication or revoked member cannot add registry authority',async()=>{
 const source=await readFile(new URL('./staging-installed-publication.ts',import.meta.url),'utf8');
 expect(source).not.toMatch(/enrollInspectedWorker|enrollExtractedWorker/);expect(source).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|GRANT)\b/);expect(source).toContain('admissionEstablished:false');expect(source.match(/assertNamedAssemblyActors\(input,/g)).toHaveLength(2);
});
