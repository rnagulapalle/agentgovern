import {it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,symlink,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {privateJournalMetadata,readJournalWithFailureMetadata} from './staging-private-journal-metadata.mjs';
it('records missing/private/bad-mode/symlink metadata without reading bytes or returning paths',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ll-journal-metadata-'));
 try{
  const parent=join(root,'private');await mkdir(parent,{mode:0o700});const file=join(parent,'journal.json'),secret='secret-value-must-never-appear';
  const absent=await privateJournalMetadata(file);expect(absent.journal).toEqual({present:false,error:'ENOENT'});expect(absent.parent).toMatchObject({present:true,type:'directory',mode:0o700,uid:process.getuid()});
  await writeFile(file,secret,{mode:0o600});const existing=await privateJournalMetadata(file);expect(existing.journal).toMatchObject({present:true,type:'file',uid:process.getuid(),mode:0o600,links:1,size:secret.length});
  const unsafe=join(parent,'unsafe');await writeFile(unsafe,'bad-mode',{mode:0o644});expect((await privateJournalMetadata(unsafe)).journal.mode).toBe(0o644);
  const alias=join(parent,'alias');await symlink(file,alias);expect((await privateJournalMetadata(alias)).journal.type).toBe('symlink');
  const serialized=JSON.stringify([absent,existing,await privateJournalMetadata(alias)]);expect(serialized).not.toContain(secret);expect(serialized).not.toContain(root);expect(serialized).not.toContain(file);
 }finally{await rm(root,{recursive:true});}
});
it('does not record on success and rethrows identical reader failure even if recording fails',async()=>{
 const sentinel={bytes:Buffer.from('strict-reader-result')};let recorded=0;expect(await readJournalWithFailureMetadata('/missing/journal',async()=>sentinel,async()=>{recorded++;})).toBe(sentinel);expect(recorded).toBe(0);
 const error=Error('original private strict refusal'),results=[];await expect(readJournalWithFailureMetadata('/missing/journal',async()=>{throw error;},async value=>{results.push(value);})).rejects.toBe(error);expect(results).toHaveLength(1);expect(JSON.stringify(results)).not.toContain(error.message);
 await expect(readJournalWithFailureMetadata('/missing/journal',async()=>{throw error;},async()=>{throw Error('record failed');})).rejects.toBe(error);
});
import {validatePrivateJournalMetadata,retainPrivateJournalDiagnostic} from './staging-private-journal-metadata.mjs';
it('retains only validated fixed metadata before private source cleanup; absent output legitimate',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'ll-metadata-retain-')));try{const source=join(root,'application'),out=join(root,'evidence');await mkdir(source,{mode:0o700});await mkdir(out,{mode:0o700});expect(await retainPrivateJournalDiagnostic(source,out)).toBe(false);const value=await privateJournalMetadata(join(source,'missing'));await writeFile(join(source,'observer-private-journal-diagnostic.json'),JSON.stringify(value),{mode:0o600});expect(await retainPrivateJournalDiagnostic(source,out)).toBe(true);await rm(source,{recursive:true});const {readFile,stat}=await import('node:fs/promises');expect(JSON.parse(await readFile(join(out,'observer-private-journal-diagnostic.json'),'utf8'))).toEqual(value);expect((await stat(join(out,'observer-private-journal-diagnostic.json'))).mode&0o777).toBe(0o600);}finally{await rm(root,{recursive:true});}
});
it('refuses unknown metadata bytes, paths, messages and malformed integers',()=>{
 const base={version:1,processUid:1001,journal:{present:false,error:'ENOENT'},parent:{present:true,type:'directory',uid:1001,mode:448,links:2,size:4096}};
 for(const value of [{...base,path:'/private/secret'},{...base,journal:{...base.journal,bytes:'secret'}},{...base,parent:{...base.parent,mode:Infinity}},{...base,journal:{present:false,error:'raw-secret-message'}}])expect(()=>validatePrivateJournalMetadata(value)).toThrow();
});
it('malformed present diagnostic is not silently omitted or retained',async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'ll-metadata-malformed-')));try{await writeFile(join(root,'observer-private-journal-diagnostic.json'),JSON.stringify({secret:'never-copy'}),{mode:0o600});await expect(retainPrivateJournalDiagnostic(root,root)).rejects.toThrow();}finally{await rm(root,{recursive:true});}
});
