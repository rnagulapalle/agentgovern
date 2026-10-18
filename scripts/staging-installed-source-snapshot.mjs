// Proof observation only. No uploaded freeze grants execution/release authority.
import assert from 'node:assert/strict';
import {readdir,readFile,lstat,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const omittedRoots=new Set(['node_modules','.next','.git','.local','.worker','coverage','certbot']);
export async function installedAssemblySourceSnapshot(root=process.cwd()){
 assert.equal(resolve(root),root);assert.equal(await realpath(root),root);
 const hashes={},fileModes={},directoryModes={};let total=0;
 const collect=async relative=>{const path=join(root,relative),before=await lstat(path);assert(!before.isSymbolicLink());assert.equal(await realpath(path),path);
  if(before.isDirectory()){assert.equal(before.mode&0o7777,0o755,'Credential-free nested repository directory must be traversable');directoryModes[relative]=before.mode&0o7777;for(const e of (await readdir(path)).sort()){assert(!e.startsWith('.env'));if(relative==='nginx'&&e==='certs')continue;await collect(relative+'/'+e);}return;}
  assert(before.isFile()&&before.nlink===1&&before.size<=32*1024**2,'Bounded regular source required');assert(Object.keys(hashes).length<4096);total+=before.size;assert(total<=256*1024**2);
  const bytes=await readFile(path),after=await lstat(path);for(const k of ['dev','ino','uid','mode','size','mtimeMs','ctimeMs','nlink'])assert.equal(after[k],before[k]);assert.equal(bytes.length,before.size);hashes[relative]=createHash('sha256').update(bytes).digest('hex');fileModes[relative]=before.mode&0o7777;};
 for(const relative of (await readdir(root)).sort()){if(omittedRoots.has(relative)||relative.startsWith('.env')||relative.endsWith('.tsbuildinfo')||relative==='.DS_Store')continue;if(relative==='docs'){const docs=await lstat(join(root,'docs'));assert(docs.isDirectory()&&!docs.isSymbolicLink()&&(docs.mode&0o7777)===0o755);directoryModes.docs=docs.mode&0o7777;for(const entry of ['docs/evidence','docs/LOOPLABS_CLAIM_AND_FUNNEL_AUDIT.md','docs/ENGINEERING_GATES.md']){try{await collect(entry);}catch(error){assert.equal(error.code,'ENOENT');}}continue;}await collect(relative);}
 assert(hashes['scripts/staging-platform-proof.mjs']&&hashes['scripts/staging-installed-source-snapshot.mjs']&&hashes['scripts/staging-installed-platform-lifecycle.mjs']);
 return {contract:'owned-installed-assembly-source-snapshot-3',sourceDirectoryModes:Object.fromEntries(Object.entries(directoryModes).sort(([a],[b])=>a.localeCompare(b))),sourceFileModes:Object.fromEntries(Object.entries(fileModes).sort(([a],[b])=>a.localeCompare(b))),sourceHashes:Object.fromEntries(Object.entries(hashes).sort(([a],[b])=>a.localeCompare(b))),fileCount:Object.keys(hashes).length};
}
