import {it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {installedAssemblySourceSnapshot} from './staging-installed-source-snapshot.mjs';
import {inspectPersistentOfflineSource} from './persistent-installed-source-binding.mjs';
it('actual regular subset reads require exact full host freeze and every copied producer byte, not full image-root repository',async()=>{
 const directory=await realpath(await mkdtemp(join(tmpdir(),'ll-persistent-source-'))),source=join(directory,'source'),image=join(directory,'image');await mkdir(source,{mode:0o700});await mkdir(image,{mode:0o700});
 try{
  const files={'scripts/staging-platform-proof.mjs':'// platform\n','scripts/staging-installed-source-snapshot.mjs':'// snapshot\n','scripts/staging-installed-platform-lifecycle.mjs':'// lifecycle\n','scripts/persistent-installed-owner-process.mjs':'// owner\n','lib/owned.ts':'export const owned=1;\n','package.json':'{}\n','pnpm-lock.yaml':'lockfileVersion: 9\n','install-order.json':'[]\n','app/page.tsx':'// not copied by provisioner\n','Dockerfile.staging-provisioner':'COPY lib ./lib\n'};
  for(const [file,bytes]of Object.entries(files)){for(const root of [source,...(file.startsWith('app/')||file.startsWith('Dockerfile')?[]:[image])]){await mkdir(join(root,file.split('/').slice(0,-1).join('/')),{recursive:true,mode:0o755});await writeFile(join(root,file),bytes,{mode:0o644});}}
  const freeze=await installedAssemblySourceSnapshot(source),sha=createHash('sha256').update(JSON.stringify(freeze,null,2)+'\n').digest('hex');const observed=await inspectPersistentOfflineSource(source,sha,image);expect(observed.imageContainedFiles).toContain('lib/owned.ts');expect(observed.imageContainedFiles).not.toContain('app/page.tsx');await observed.assertStable();
  await expect(inspectPersistentOfflineSource(source,'a'.repeat(64),image)).rejects.toThrow();await writeFile(join(image,'lib/owned.ts'),'export const owned=2;\n');await expect(inspectPersistentOfflineSource(source,sha,image)).rejects.toThrow(/Image-contained/);await writeFile(join(image,'lib/owned.ts'),files['lib/owned.ts']);await rm(join(image,'scripts/persistent-installed-owner-process.mjs'));await expect(inspectPersistentOfflineSource(source,sha,image)).rejects.toThrow();await writeFile(join(image,'scripts/persistent-installed-owner-process.mjs'),files['scripts/persistent-installed-owner-process.mjs']);await writeFile(join(source,'app/page.tsx'),'changed host source\n');await expect(inspectPersistentOfflineSource(source,sha,image)).rejects.toThrow();
  expect((await readFile(join(image,'package.json'),'utf8')).trim()).toBe('{}');
 }finally{await rm(directory,{recursive:true,force:true});}
});
