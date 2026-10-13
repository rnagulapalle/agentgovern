// Versioned preparation only. Installer/CI provenance, namespace enrollment and
// execution remain separate. No owner credential is published to runtime roles.
import assert from 'node:assert/strict';
import type {Pool} from 'pg';
import {createHash} from 'node:crypto';
import {mkdir,writeFile,readFile,lstat,realpath,readdir,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {readPublishedWebGeneration,readWorkloadInstallation,bootstrapTenantContext,parseTenantInstallation,parseWorkloadInstallation} from '../lib/workspace/tenant-bootstrap';
import {readOwnedPrivateFile} from '../lib/workspace/owned-private-file';
import {createWorkloadPool} from '../lib/durable/workload-pool';
import {assertTenantPool} from '../lib/durable/tenant-pool';
import {inspectedWorkerArtifact} from './worker-artifact-enrollment.mjs';
import {validateInstalledProofConstruction} from './current-proof-source-registry.mjs';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
type Web=Awaited<ReturnType<typeof readPublishedWebGeneration>>['config'];
type Workload=Awaited<ReturnType<typeof readWorkloadInstallation>>['config'];
type Binding=Awaited<ReturnType<typeof assertTenantPool>>;
type Expectation={installation:string;schema:string;database:string;org:string;epoch:string;roles:Record<string,string>};
/** Supplied observations are consistency checks, never registration authority. */
export function validateInstalledAssemblyCoupling(expected:Expectation,web:Web,worker:Workload,scheduler:Workload,bindings:{web:Binding;worker:Binding;scheduler:Binding}){
 parseTenantInstallation(web);parseWorkloadInstallation(worker);parseWorkloadInstallation(scheduler);
 assert(/^[_a-zA-Z][_a-zA-Z0-9]{0,62}$/.test(expected.database));
 assert(/^[_a-zA-Z][_a-zA-Z0-9]{0,62}$/.test(expected.installation));assert(/^[_a-zA-Z][_a-zA-Z0-9]{0,62}$/.test(expected.schema));
 assert(/^[-_a-zA-Z0-9]{1,64}$/.test(expected.org));assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(expected.epoch));
 assert.equal(web.workloads.length,0);assert.equal(web.web.length,1);
 const entries=[web.web[0],worker.entries[0],scheduler.entries[0]],configs=[web,worker,scheduler],purposes=['web','worker','scheduler'] as const;
 assert.equal(worker.entries.length,1);assert.equal(scheduler.entries.length,1);
 assert.equal(new Set(entries.map(e=>e.role)).size,3);assert.equal(new Set(Object.values(bindings).map(b=>b.roleOid)).size,3);
 assert(!entries.some(e=>[web.broker.role,web.definer].includes(e.role)));
 const target=new URL(web.broker.url);
 for(let i=0;i<3;i++){
  const c=configs[i],entry=entries[i],purpose=purposes[i],binding=bindings[purpose];
  assert.equal(c.installation,expected.installation);assert.equal(c.schema,expected.schema);assert.equal(c.database,expected.database);
  assert.equal(c.transport?.mode,'verified-tls');assert.deepEqual(c.transport,web.transport);
  assert.equal(entry.org,expected.org);assert.equal(entry.epoch,expected.epoch);assert.equal(entry.purpose,purpose);
  for(const key of ['org','epoch','role','purpose'] as const)assert.equal(binding[key],entry[key]);
  assert.equal(binding.schema,expected.schema);assert(/^[1-9][0-9]*$/.test(binding.roleOid));assert(/^[1-9][0-9]*$/.test(binding.databaseOid));
  assert.equal(expected.roles[entry.role],binding.roleOid);assert.equal(binding.databaseOid,bindings.web.databaseOid);
  const u=new URL(entry.url);for(const key of ['protocol','hostname','port','pathname'] as const)assert.equal(u[key],target[key]);
 }
 return {contract:'installed-assembly-publication-coupling-1' as const,installation:expected.installation,schema:expected.schema,org:expected.org,epoch:expected.epoch};
}
type Docker=(...args:string[])=>string;
type ImageObservation={imageId:string;profile:'ack'|'quote';buildId:string;serviceHash:string;workflowHash:string;lockHash:string;constructionSha256:string};
/** This trusted source-owned callback must authenticate CI run/job/artifact or
 * same-job build provenance independently. Uploaded metadata/eligible booleans
 * cannot substitute. This preparer cannot establish release eligibility. */
type VerifyCurrentImage=(expectation:{imageId:string;constructionSha256:string})=>Promise<ImageObservation>;
type Input=Expectation&{sourceRoot:string;webFile:string;workerFile:string;schedulerFile:string;owner:Pool;
 named:{requester:string;reviewer:string;requesterToken:string;reviewerToken:string};imageId:string;docker:Docker;verifyCurrentImage:VerifyCurrentImage;output:string};
async function sealedWorkload(file:string){
 const configRead=await readOwnedPrivateFile(file,131072),readyRead=await readOwnedPrivateFile(join(dirname(file),'ready.json'),16384);
 const loaded=await readWorkloadInstallation(file);assert.deepEqual((await readdir(dirname(resolve(file)))).sort(),['ready.json','workloads.json']);
 assert.equal(JSON.parse(readyRead.bytes.toString('utf8')).workloadsSha256,hash(configRead.bytes));assert.deepEqual(JSON.parse(configRead.bytes.toString('utf8')),loaded.config);
 const assertStable=async()=>{await loaded.assertStable();await configRead.assertStable();await readyRead.assertStable();assert.deepEqual((await readdir(dirname(resolve(file)))).sort(),['ready.json','workloads.json']);};
 await assertStable();return {...loaded,configBytes:configRead.bytes,readyBytes:readyRead.bytes,assertStable};
}
export async function readInstalledAssemblyGenerations(files:{webFile:string;workerFile:string;schedulerFile:string}){
 const web=await readPublishedWebGeneration(files.webFile),worker=await sealedWorkload(files.workerFile),scheduler=await sealedWorkload(files.schedulerFile);
 return {web,worker,scheduler};
}
export function validateCurrentInspectedImage(imageId:string,constructionSha256:string,current:ImageObservation,inspected:{buildId:string;serviceHash:string;workflowHash:string;lockHash:string},profile:'ack'|'quote'='ack'){
 assert.deepEqual(Object.keys(current).sort(),['imageId','profile','buildId','serviceHash','workflowHash','lockHash','constructionSha256'].sort());
 assert.equal(current.imageId,imageId);assert(['ack','quote'].includes(profile));assert.equal(current.profile,profile);assert.equal(current.constructionSha256,constructionSha256);assert(/^[a-f0-9]{64}$/.test(constructionSha256));assert(new RegExp('^'+profile+'-[a-f0-9]{64}$').test(current.buildId));
 for(const key of ['serviceHash','workflowHash','lockHash'] as const)assert(/^[a-f0-9]{64}$/.test(current[key]));
 for(const key of ['buildId','serviceHash','workflowHash','lockHash'] as const)assert.equal(inspected[key],current[key],'Authenticated current image bytes differ');
}

export function assertNamedAssemblyActors(expected:{org:string;named:{requester:string;reviewer:string}},requester:{db:Pool;actor:{subject:string;orgId:string}},reviewer:{db:Pool;actor:{subject:string;orgId:string}}){
 assert.notEqual(expected.named.requester,expected.named.reviewer);assert.equal(requester.actor.subject,expected.named.requester);assert.equal(reviewer.actor.subject,expected.named.reviewer);assert.equal(requester.actor.orgId,expected.org);assert.equal(reviewer.actor.orgId,expected.org);assert.equal(requester.db,reviewer.db);
}
export async function prepareInstalledAssemblyPublication(input:Input){
 let allocated=false,outputIdentity:{dev:number;ino:number}|undefined,webRuntime:Awaited<ReturnType<typeof bootstrapTenantContext>>|undefined;
 let output='';const ownedPollers:Pool[]=[];const pollers={} as Record<'worker'|'scheduler',Pool>;
 try{
  output=resolve(input.output);
  assert.equal(typeof input.verifyCurrentImage,'function','Trusted authenticated image verifier required');assert(/^sha256:[a-f0-9]{64}$/.test(input.imageId));
  assert.equal(await realpath(input.sourceRoot),resolve(input.sourceRoot));validateInstalledProofConstruction(input.sourceRoot);
  const registryFile=join(input.sourceRoot,'scripts/current-installed-proof-sources.json'),registryBytes=await readFile(registryFile),constructionSha256=hash(registryBytes);
  const parent=await lstat(dirname(output));assert(parent.isDirectory()&&!parent.isSymbolicLink()&&parent.uid===process.getuid!()&&(parent.mode&0o077)===0);assert.equal(await realpath(dirname(output)),dirname(output));
  const {web,worker,scheduler}=await readInstalledAssemblyGenerations(input);
  assert.equal(web.config.transport?.mode,'verified-tls');
  assert(input.named.requester!==input.named.reviewer);for(const subject of [input.named.requester,input.named.reviewer])assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject));
  for(const token of [input.named.requesterToken,input.named.reviewerToken])assert(/^[a-zA-Z0-9_-]{32,128}$/.test(token));assert.notEqual(input.named.requesterToken,input.named.reviewerToken);
  webRuntime=await bootstrapTenantContext(input.webFile,false);
  for(const purpose of ['worker','scheduler'] as const){const file=purpose==='worker'?input.workerFile:input.schedulerFile,entry=(purpose==='worker'?worker:scheduler).config.entries[0];pollers[purpose]=await createWorkloadPool({LOOPLABS_WORKLOAD_INSTALLATION_FILE:file,LOOPLABS_DATABASE_URL:entry.url,LOOPLABS_WORKSPACE_ID:entry.org,LOOPLABS_RECOVERY_EPOCH:entry.epoch,LOOPLABS_TENANT_DATABASE_ROLE:entry.role,LOOPLABS_TENANT_DATABASE_SCHEMA:input.schema},purpose);ownedPollers.push(pollers[purpose]);}
  const requester=await webRuntime.context.member(input.named.requesterToken),reviewer=await webRuntime.context.member(input.named.reviewerToken);
  assertNamedAssemblyActors(input,requester,reviewer);
  const bindings={web:await assertTenantPool(requester.db,input.org),worker:await assertTenantPool(pollers.worker,input.org),scheduler:await assertTenantPool(pollers.scheduler,input.org)};
  const ownerTarget=(await input.owner.query('SELECT current_database() database,(SELECT oid::text FROM pg_database WHERE datname=current_database()) database_oid')).rows[0];assert.equal(ownerTarget?.database,input.database);assert.equal(ownerTarget?.database_oid,bindings.web.databaseOid);
  const coupling=validateInstalledAssemblyCoupling(input,web.config,worker.config,scheduler.config,bindings);
  const current=await input.verifyCurrentImage({imageId:input.imageId,constructionSha256});
  const inspected=await inspectedWorkerArtifact(input.imageId,input.docker,'ack');
  validateCurrentInspectedImage(input.imageId,constructionSha256,current,inspected);
  // Inspection is read-only with respect to admission. Only a separately
  // accepted offline operation may enroll these bytes; preparation never does.
  for(const p of [requester.db,pollers.worker,pollers.scheduler])await assertTenantPool(p,input.org);
  await web.assertStable();await worker.assertStable();await scheduler.assertStable();validateInstalledProofConstruction(input.sourceRoot);assert.equal(hash(await readFile(registryFile)),constructionSha256);
  for(const file of [input.webFile,input.workerFile,input.schedulerFile]){const dir=await realpath(dirname(file));assert(output!==dir&&!output.startsWith(dir+'/')&&!dir.startsWith(output+'/'),'Publication must be separate from installed inputs');}
  await mkdir(output,{mode:0o700});allocated=true;const own=await lstat(output);outputIdentity={dev:own.dev,ino:own.ino};
  for(const role of ['web','worker','scheduler'] as const){const dir=join(output,role);await mkdir(dir,{mode:0o700});
   const source=role==='web'?web:role==='worker'?worker:scheduler,filename=role==='web'?'web.json':'workloads.json';
   await writeFile(join(dir,filename),source.configBytes,{mode:0o600,flag:'wx'});await writeFile(join(dir,'ready.json'),source.readyBytes,{mode:0o600,flag:'wx'});
  }
  const publication=await readPublishedWebGeneration(join(output,'web','web.json')),wp=await sealedWorkload(join(output,'worker','workloads.json')),sp=await sealedWorkload(join(output,'scheduler','workloads.json'));
  validateInstalledAssemblyCoupling(input,publication.config,wp.config,sp.config,bindings);await publication.assertStable();await wp.assertStable();await sp.assertStable();await web.assertStable();await worker.assertStable();await scheduler.assertStable();
  for(const p of [requester.db,pollers.worker,pollers.scheduler])await assertTenantPool(p,input.org);
  const finalRequester=await webRuntime.context.member(input.named.requesterToken),finalReviewer=await webRuntime.context.member(input.named.reviewerToken);assertNamedAssemblyActors(input,finalRequester,finalReviewer);
  validateInstalledProofConstruction(input.sourceRoot);assert.equal(hash(await readFile(registryFile)),constructionSha256);
  for(const pool of ownedPollers)await pool.end();ownedPollers.length=0;await webRuntime.close();webRuntime=undefined;
  return {...coupling,preparedOnly:true,releaseAccepted:false,admissionEstablished:false,artifact:{imageId:input.imageId,profile:'ack' as const,buildId:inspected.buildId,serviceHash:inspected.serviceHash,workflowHash:inspected.workflowHash,lockHash:inspected.lockHash},constructionSha256,
   files:{web:join(output,'web','web.json'),worker:join(output,'worker','workloads.json'),scheduler:join(output,'scheduler','workloads.json')}};
 }catch{
  if(allocated&&outputIdentity){const own=await lstat(output);assert.equal(own.dev,outputIdentity.dev);assert.equal(own.ino,outputIdentity.ino);assert.equal(own.uid,process.getuid!());assert(!own.isSymbolicLink());await rm(output,{recursive:true});}
  throw Error('Installed assembly publication refused; no runtime or release authority granted.');
 }finally{const closed=await Promise.allSettled([...ownedPollers.map(p=>p.end()),...(webRuntime?[webRuntime.close()]:[])]);if(closed.some(r=>r.status==='rejected'))throw Error('Owned preparation pool quiescence unavailable; no runtime or release authority granted.');}
}
