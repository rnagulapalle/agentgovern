import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {mkdtemp,stat,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {drainController,drainHost,drainPlatform,writeDrainController} from './staging-drain-source.mjs';
const sources=['controller','host','platform'].map(n=>readFileSync(`scripts/staging-${n==='platform'?'platform-proof':`semantic-${n}`}.mjs`,'utf8'));
test('strict drain extensions preserve real authority, pinned recovery, replay, original peak and archive/UI gates',()=>{
 const derived=[drainController(sources[0]),drainHost(sources[1],'scripts/.drain-controller-abc.mjs'),drainPlatform(sources[2],'.drain-host-abc.mjs')];
 for(const s of derived)expect(spawnSync(process.execPath,['--check','--input-type=module'],{input:s,encoding:'utf8'}).status).toBe(0);
 for(const value of ['control.review(reviewer','replaySemanticPair'])expect(derived[0]).toContain(value);
 expect(derived[0]).toContain('exerciseDrain({db,owner,runs,artifacts,token,mark,checkpoint})');
 expect(derived[1]).toContain('assert.deepEqual([old.Image,next.Image],extractedImages)');expect(derived[1]).toContain('const ownerFile=resolve(trial,"..",project+"-registry-owner.env")');expect(derived[1]).not.toContain('const ownerFile=resolve(dir,');expect(derived[1]).toContain('hardened(256*1024**2)');
 for(const value of ['stage="runtime-crash"','stage="approved-archive"','stage="restored-packaged-role-refusal"','stage="browser-https"','hostReserveBytes:(browserEnabled?2:1)*1024**3'])expect(derived[2]).toContain(value);
 expect(derived[2]).toContain('role==="worker"?768*1024**2:0');
});
test('missing or ambiguous anchors and injected generated paths refuse',()=>{
 expect(()=>drainController(sources[0]+sources[0])).toThrow();expect(()=>drainHost(sources[1],'scripts/../x.mjs')).toThrow();expect(()=>drainPlatform(sources[2],'../x.mjs')).toThrow();
 expect(()=>drainHost(sources[1].replace('  phase="workers";',''), 'scripts/.drain-controller-abc.mjs')).toThrow();
});
test('drain proof and owner refuse without explicit isolated opt-in before private inputs',()=>{
 for(const [file,message] of [['scripts/staging-drain-proof.mjs','Full isolated drain proof refused; no raw child output, history or credentials printed.'],['scripts/staging-drain-owner.mjs','Isolated drain owner refused; no raw database, Docker or credentials printed.']]){
  const r=spawnSync(process.execPath,['--import','tsx',file],{env:{PATH:process.env.PATH},encoding:'utf8',timeout:10000});
  expect(r.status).toBe(1);expect(r.stdout).toBe('');expect(r.stderr.trim()).toBe(message);
 }
});

test('generated controller source remains readable after root COPY; occupied files and symlinks are never replaced',async()=>{
 const dir=await mkdtemp(resolve(tmpdir(),'ll-drain-source-'));
 try{
  const file=resolve(dir,'.drain-controller-abc.mjs'),source=drainController(sources[0]);
  await writeDrainController(file,source);
  expect((await stat(file)).mode&0o777).toBe(0o644);expect(await readFile(file,'utf8')).toBe(source);
  await expect(writeDrainController(file,'replacement')).rejects.toThrow();expect(await readFile(file,'utf8')).toBe(source);
  const link=resolve(dir,'.drain-controller-def.mjs');await symlink(file,link);
  await expect(writeDrainController(link,'replacement')).rejects.toThrow();expect(await readFile(file,'utf8')).toBe(source);
  await expect(writeDrainController(resolve(dir,'worker.env'),'secret')).rejects.toThrow();
 }finally{await rm(dir,{recursive:true,force:true});}
});
