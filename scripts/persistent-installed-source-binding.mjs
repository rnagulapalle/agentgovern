// Offline image-contained source observation against the genuine host freeze.
// This does not accept release lineage; trusted host verifies current images.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {installedAssemblySourceSnapshot} from './staging-installed-source-snapshot.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function inspectPersistentOfflineSource(sourceRoot,expectedFreezeSha256,imageRoot=process.cwd()){
 assert(typeof sourceRoot==='string'&&resolve(sourceRoot)===sourceRoot&&sourceRoot!==imageRoot);assert(/^[a-f0-9]{64}$/.test(expectedFreezeSha256));assert.equal(await realpath(imageRoot),imageRoot);
 const before=await installedAssemblySourceSnapshot(sourceRoot);assert.equal(hash(JSON.stringify(before,null,2)+'\n'),expectedFreezeSha256);
 const contained=Object.keys(before.sourceHashes).filter(f=>['package.json','pnpm-lock.yaml','install-order.json'].includes(f)||['lib/','runtime/','scripts/'].some(p=>f.startsWith(p)));assert(contained.length>0&&contained.includes('scripts/persistent-installed-owner-process.mjs'));
 for(const file of contained){const path=join(imageRoot,file),stat=await lstat(path);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1);assert.equal(await realpath(path),path);assert.equal(hash(await readFile(path)),before.sourceHashes[file],'Image-contained producer source differs from approved host source');}
 assert.deepEqual(await installedAssemblySourceSnapshot(sourceRoot),before);return {sourceBefore:before,imageContainedFiles:contained,assertStable:async()=>{const after=await inspectPersistentOfflineSource(sourceRoot,expectedFreezeSha256,imageRoot);assert.deepEqual(after.sourceBefore,before);}};
}
