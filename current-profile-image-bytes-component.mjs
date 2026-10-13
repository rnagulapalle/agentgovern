// Private CI-only component: real image bytes/owner enrollment, never execution or release authority.
import assert from 'node:assert/strict';
import {readFile,mkdir,lstat,realpath,writeFile,chmod} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,dirname,parse,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createInstalledTenantFixture} from './lib/workspace/installed-tenant-fixture.ts';
import {applyQuoteExecutionMigrations} from './lib/workspace/quote-execution-migrations.ts';
import {inspectedWorkerArtifact,enrollInspectedWorker,profileArtifactBytes} from './scripts/worker-artifact-enrollment.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',timeout:120000,maxBuffer:2*1024**2,stdio:['ignore','pipe','pipe']}).trim();
export const requiredSources=Object.freeze(['Dockerfile.temporal','scripts/build-temporal-worker.mjs','scripts/temporal-service.ts','scripts/worker-artifact-enrollment.mjs','lib/enquiries/dispatch.ts','lib/quotes/worker-admission-schema.sql','lib/workspace/quote-execution-migrations.ts','lib/workspace/installed-tenant-fixture.ts','lib/workspace/tenant-installer.ts','lib/workspace/tenant-bootstrap.ts','lib/durable/pg-transport.ts','lib/durable/tenant-pool.ts','lib/durable/tenant-boundary-prototype-schema.sql','pnpm-lock.yaml']);
export function validateFreeze(freeze){assert(freeze&&typeof freeze==='object'&&!Array.isArray(freeze)&&freeze.sourceHashes&&typeof freeze.sourceHashes==='object'&&!Array.isArray(freeze.sourceHashes));for(const[file,hash]of Object.entries(freeze.sourceHashes)){assert(file&&!file.startsWith('/')&&!file.includes('\\')&&!/[\x00-\x1f\x7f]/.test(file)&&file.split('/').every(p=>p&&p!=='.'&&p!=='..'));assert(/^[a-f0-9]{64}$/.test(hash));}for(const file of requiredSources)assert(Object.hasOwn(freeze.sourceHashes,file),'Required measured build/installation source absent');return freeze.sourceHashes;}
export function validateSelectedImage(facts,imageId,profile,freezeSha){
 assert(/^sha256:[a-f0-9]{64}$/.test(imageId));assert(['ack','quote'].includes(profile));assert(/^[a-f0-9]{64}$/.test(freezeSha));assert.equal(facts.Id,imageId);assert.equal(facts.Os,'linux');assert.equal(facts.Architecture,'amd64');assert.equal(facts.Config.User,'node');assert.equal(Object.keys(facts.Config.Volumes||{}).length,0);
 assert.equal(facts.Config.Labels?.['looplabs.worker.profile'],profile);assert.equal(facts.Config.Labels?.['looplabs.worker.target'],profile==='quote'?'quote-runtime':'runner');assert.equal(facts.Config.Labels?.['looplabs.source-manifest-sha256'],freezeSha);
 assert.deepEqual(facts.Config.Cmd,profile==='quote'?['node','.worker/quote-temporal-service.cjs','worker','quote']:['node','.worker/temporal-service.cjs','worker']);
}
async function exportActualBytes(imageId,profile,artifact,out){
 const dir=join(out,profile);await mkdir(dir,{mode:0o700});const prefix=profile==='ack'?'temporal':'quote-temporal',name='ll-current-bytes-'+randomBytes(12).toString('hex'),owner=randomBytes(24).toString('hex'),label='looplabs.profile.bytes.owner='+owner;let attempted=false;
 try{
  attempted=true;docker('create','--name',name,'--label',label,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','134217728','--pids-limit','64',imageId,'node','-e','process.exit(0)');
  const verify=()=>{const rows=JSON.parse(docker('inspect',name));assert.equal(rows.length,1);assert.equal(rows[0].Image,imageId);assert.equal(rows[0].Config.Labels['looplabs.profile.bytes.owner'],owner);assert.equal(rows[0].State.Running,false);};
  for(const file of [`${prefix}-manifest.json`,`${prefix}-service.cjs`,`${prefix}-workflow.cjs`,'pnpm-lock.yaml']){verify();docker('cp',name+':/app/'+(file==='pnpm-lock.yaml'?'':'.worker/')+file,join(dir,file));const st=await lstat(join(dir,file));assert(st.isFile()&&!st.isSymbolicLink()&&st.nlink===1&&st.size>0&&st.size<=64*1024**2);await chmod(join(dir,file),0o600);}
  const manifestBytes=await readFile(join(dir,`${prefix}-manifest.json`));assert(manifestBytes.length<=16384);const manifest=JSON.parse(manifestBytes),service=await readFile(join(dir,`${prefix}-service.cjs`)),workflow=await readFile(join(dir,`${prefix}-workflow.cjs`)),lock=await readFile(join(dir,'pnpm-lock.yaml'));
  const actual=profileArtifactBytes(profile,manifest,service,workflow,lock);for(const field of ['buildId','serviceHash','workflowHash','lockHash'])assert.equal(actual[field],artifact[field]);
  return {...artifact,manifestHash:sha(manifestBytes),directory:profile};
 }finally{if(attempted){const listed=docker('ps','-a','--filter','label='+label,'--format','{{.Names}}');if(listed){assert.equal(listed,name);const rows=JSON.parse(docker('inspect',name));assert.equal(rows.length,1);assert.equal(rows[0].Image,imageId);assert.equal(rows[0].Config.Labels['looplabs.profile.bytes.owner'],owner);assert.equal(rows[0].State.Running,false);docker('rm',name);}assert.equal(docker('ps','-a','--filter','label='+label,'--format','{{.ID}}'),'');}}
}
async function canonical(path){assert(resolve(path)===path);for(let current=path;;current=dirname(current)){assert(!(await lstat(current)).isSymbolicLink());if(current===parse(current).root)break;}assert.equal(await realpath(path),path);}
async function main(){
 assert(process.env.GITHUB_ACTIONS==='true'&&process.platform==='linux'&&process.arch==='x64');
 assert(process.env.NODE_ENV==='test'&&process.env.LOOPLABS_TEST_DATABASE_URL,'Dedicated installed test database required');
 const [ack,quote,freezeFile,freezeSha,out]=process.argv.slice(2);assert(process.argv.length===7);
 assert([ack,quote].every(v=>/^sha256:[a-f0-9]{64}$/.test(v))&&ack!==quote,'Two distinct immutable images required');
 assert(/^[a-f0-9]{64}$/.test(freezeSha));await canonical(freezeFile);const rawFreeze=await readFile(freezeFile);assert.equal(sha(rawFreeze),freezeSha);
 const freeze=JSON.parse(rawFreeze);validateFreeze(freeze);
 const currentHashes={};for(const [file,hash]of Object.entries(freeze.sourceHashes)){
  assert(!file.startsWith('/')&&!file.split('/').includes('..')&&/^[a-f0-9]{64}$/.test(hash));const path=resolve(file);await canonical(path);const actual=sha(await readFile(path));assert.equal(actual,hash,'Frozen source changed');currentHashes[file]=actual;
 }

 await canonical(process.env.RUNNER_TEMP);assert(resolve(out)===out&&out.startsWith(process.env.RUNNER_TEMP+'/'));await canonical(dirname(out));await mkdir(out,{mode:0o700});
 let fixture;const images=[];let cleanupVerified=false;
 try{
  fixture=await createInstalledTenantFixture({tenants:['one'],salesOrg:'one',seed:async()=>{}});await applyQuoteExecutionMigrations(fixture.owner);
  for(const [profile,imageId,target]of [['ack',ack,'runner'],['quote',quote,'quote-runtime']]){
   const facts=JSON.parse(docker('image','inspect',imageId));assert.equal(facts.length,1);validateSelectedImage(facts[0],imageId,profile,freezeSha);assert.equal(facts[0].Config.Labels?.['looplabs.profile.component.run'],process.env.GITHUB_RUN_ID);
   const artifact=await inspectedWorkerArtifact(imageId,docker,profile);
   const repeated=await Promise.all([enrollInspectedWorker(fixture.owner,imageId,docker,profile),enrollInspectedWorker(fixture.owner,imageId,docker,profile)]);assert(repeated.every(row=>JSON.stringify(row)===JSON.stringify(artifact)));
   // Reuse the exact installed SQL admission function, with actual enrolled image identity.
   await fixture.owner.query(`CREATE TABLE ${profile}_admission_probe(worker_build_id text)`);await fixture.owner.query(`CREATE TRIGGER admission BEFORE INSERT ON ${profile}_admission_probe FOR EACH ROW EXECUTE FUNCTION ll_record_worker_admission()`);
   await fixture.owner.query(`INSERT INTO ${profile}_admission_probe VALUES($1)`,[artifact.buildId]);
   await fixture.owner.query("UPDATE ll_temporal_worker_builds SET state='draining',draining_at=clock_timestamp() WHERE worker_build_id=$1",[artifact.buildId]);
   let refused=false;try{await fixture.owner.query(`INSERT INTO ${profile}_admission_probe VALUES($1)`,[artifact.buildId]);}catch(e){assert.equal(e.code,'23514');refused=true;}assert(refused);
   await assert.rejects(()=>enrollInspectedWorker(fixture.owner,imageId,docker,profile),/cannot reactivate/);
   assert.equal((await fixture.owner.query(`SELECT count(*)::integer n FROM ${profile}_admission_probe`)).rows[0].n,1);
   images.push({profile,target,...await exportActualBytes(imageId,profile,artifact,out)});
  }
  await fixture.close();fixture=undefined;cleanupVerified=true;
 }finally{await fixture?.close();}
 for(const [file,digest]of Object.entries(currentHashes))assert.equal(sha(await readFile(file)),digest,'Source changed during actual component proof');
 const receipt={contract:'worker-profile-image-bytes-component-2',candidateOnly:true,releaseAccepted:false,runId:Number(process.env.GITHUB_RUN_ID),privateWorkflowCommit:process.env.GITHUB_SHA,componentHelperSha256:sha(await readFile(process.argv[1])),sourceManifestSha256:freezeSha,sourceHashes:currentHashes,images,extraction:{ownedStoppedContainersAbsent:true,rawFilesPerProfile:4},installation:{migrations:[25,26,27],actualInspectedEnrollment:true,idempotent:true,drainingRefused:true,fixtureCleanupVerified:cleanupVerified},notVerified:['quote background graph execution','typed model/browser experience','full quality acceptance','production deployment']};
 assert(Number.isSafeInteger(receipt.runId)&&receipt.runId>0&&/^[a-f0-9]{40}$/.test(receipt.privateWorkflowCommit));
 await writeFile(resolve(out,'component-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log('Actual profile image component recorded; no release acceptance.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('Profile image component refused; no acceptance confirmed.');process.exitCode=1;});
