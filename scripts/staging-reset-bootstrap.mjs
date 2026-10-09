// Host-side extraction and offline enrollment before the application's first archive.
import assert from 'node:assert/strict';
import {mkdir,lstat,chmod,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {parseEnv} from 'node:util';
import {semanticArtifact,semanticPair} from './temporal-semantic-replay.mjs';
export async function bootstrapResetAssembly({project,parent,images,ownerEnv,docker,runController}){
 assert.equal(process.env.LOOPLABS_STAGING_RESET_PROOF,'isolated');
 assert(/^ll-platform-[a-f0-9]{12}$/.test(project));
 assert(typeof parent==='string'&&parent.startsWith('/')&&!parent.includes('..')&&!/[\r\n\0,]/.test(parent));
 assert.equal(ownerEnv,resolve(parent,'owner.env'));
 assert(images&&Object.keys(images).sort().join()==='baseline,incompatible,provisioner');
 for(const image of Object.values(images))assert(new RegExp(`^${project}:[a-z-]+$`).test(image));
 assert.notEqual(images.baseline,images.incompatible);assert.equal(typeof docker,'function');assert.equal(typeof runController,'function');
 const dir=resolve(parent,project+'-reset-artifacts'),label=randomBytes(24).toString('hex');
 await mkdir(dir,{mode:0o700});const extracted=[],artifacts=[];
 try{
  for(const role of ['baseline','incompatible']){
   const image=JSON.parse(docker('image','inspect',images[role]))[0];assert(/^sha256:[a-f0-9]{64}$/.test(image.Id));assert.equal(image.Os,'linux');assert.equal(image.Architecture,'amd64');assert.equal(Object.keys(image.Config?.Volumes||{}).length,0);
   const name=project+'-reset-extract-'+role,path=resolve(dir,role);await mkdir(path,{mode:0o700});let created=false;
   try{
    docker('create','--name',name,'--label',`looplabs.reset.extract=${label}`,'--network','none','--memory','134217728','--pids-limit','64','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',image.Id,'node','-e','process.exit(0)');created=true;
    const c=JSON.parse(docker('inspect',name))[0];assert.equal(c.Image,image.Id);assert.equal(c.Config.Labels?.['looplabs.reset.extract'],label);assert.equal(c.State.Running,false);
    for(const [from,to] of [['/app/.worker/temporal-manifest.json','temporal-manifest.json'],['/app/.worker/temporal-service.cjs','temporal-service.cjs'],['/app/.worker/temporal-workflow.cjs','temporal-workflow.cjs'],['/app/pnpm-lock.yaml','pnpm-lock.yaml']]){
     const target=resolve(path,to);docker('cp',`${name}:${from}`,target);const stat=await lstat(target);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=64*1024**2);await chmod(target,0o600);
    }
    artifacts.push(await semanticArtifact(path));extracted.push(image.Id);
   }finally{if(created){const c=JSON.parse(docker('inspect',name))[0];assert.equal(c.Config.Labels?.['looplabs.reset.extract'],label);assert.equal(c.State.Running,false);docker('rm',name);}}
  }
  semanticPair(artifacts);assert.notEqual(extracted[0],extracted[1]);
  const owner=parseEnv(await readFile(ownerEnv,'utf8')),url=new URL(owner.LOOPLABS_STAGING_OWNER_URL);
  assert.equal(url.hostname,'application-db');assert.equal(url.username,'ll_stage_owner');assert.equal(url.pathname,'/looplabs_staging');assert(!url.search&&!url.hash&&url.password);
  const env=resolve(dir,'owner.env');assert(!/[\r\n\0]/.test(url.toString()));
  await writeFile(env,`LOOPLABS_MIGRATION_DATABASE_URL=${url}\nLOOPLABS_STAGING_RESET_PROOF=isolated\nLOOPLABS_STAGING_DRAIN_PROOF=isolated\n`,{flag:'wx',mode:0o600});
  // Reuses the parent's bounded bootstrap allocation, before runtime writers start.
  runController(project+'-reset-enroll',project+'_application',images.provisioner,['node','--import','tsx','scripts/staging-reset-enroll.mjs',...extracted],['baseline','incompatible'].map(role=>`type=bind,src=${resolve(dir,role)},dst=/run/${role},readonly`),[env]);
  return {builds:artifacts.map(a=>a.buildId),images:extracted,enrollmentCompleted:true};
 }finally{await rm(dir,{recursive:true,force:true});}
}
