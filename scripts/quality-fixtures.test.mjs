import {test,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {validateFixtureManifest,validateArchiveListing,verifyFixtureInventory,restoreProviderGitStructure} from './quality-fixtures.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifest={contract:'private-quality-fixtures-1',region:'us-west-2',bucket:'looplabs-m7-code-962639302232-f08cb8f0',key:'quality-fixtures/'+'a'.repeat(64)+'.tar.gz',sha256:'a'.repeat(64),inventorySha256:'b'.repeat(64),providerCommit:'08372aadbaa6fb8f37368c6900323b8619c10f2c',files:300};
test('manifest binds one reviewed private object and provider commit',()=>{expect(validateFixtureManifest(manifest)).toBe(manifest);for(const change of [{bucket:'public'},{key:'other.tar.gz'},{providerCommit:'0'.repeat(40)},{sha256:'wrong'},{files:0},{credentials:'never'}])expect(()=>validateFixtureManifest({...manifest,...change})).toThrow();});
test('archive traversal, duplicate, absolute, symlink and special members refuse before extraction',()=>{validateArchiveListing('fixtures/\nfixtures/a\n','drwx fixture\n-rw fixture\n');for(const [names,types]of [['/fixtures/\nfixtures/a','drwx\n-rw'],['fixtures/\nfixtures/../escape','drwx\n-rw'],['fixtures/\nfixtures/a\nfixtures/a','drwx\n-rw\n-rw'],['fixtures/\nfixtures/a','drwx\nlrwx'],['fixtures/\nfixtures/a','drwx\nbrwx']])expect(()=>validateArchiveListing(names,types)).toThrow();});
test('fixture byte changes, extras and missing files cannot become authenticated prerequisites',async()=>{const dir=await mkdtemp(join(tmpdir(),'ll-quality-inventory-'));try{await mkdir(join(dir,'provider'));await writeFile(join(dir,'provider/a'),'actual fixture bytes');const inventory={contract:manifest.contract,providerCommit:manifest.providerCommit,files:{'provider/a':hash('actual fixture bytes')}};const bytes=JSON.stringify(inventory);await writeFile(join(dir,'inventory.json'),bytes);const pinned={...manifest,files:1,inventorySha256:hash(bytes)};await verifyFixtureInventory(dir,pinned);await writeFile(join(dir,'provider/a'),'changed');await expect(verifyFixtureInventory(dir,pinned)).rejects.toThrow();await writeFile(join(dir,'provider/a'),'actual fixture bytes');await writeFile(join(dir,'extra'),'unknown');await expect(verifyFixtureInventory(dir,pinned)).rejects.toThrow();await rm(join(dir,'extra'));await rm(join(dir,'provider/a'));await expect(verifyFixtureInventory(dir,pinned)).rejects.toThrow();}finally{await rm(dir,{recursive:true,force:true});}});

test('file-only fixture restoration recreates required empty Git refs without inventing objects',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ll-quality-git-'));
 const git=args=>execFileSync('git',['-C',dir,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 try{
  git(['init']);await writeFile(join(dir,'source.txt'),'reviewed source');git(['add','source.txt']);
  git(['-c','user.name=Fixture test','-c','user.email=fixture@example.invalid','commit','-m','fixture']);
  const commit=git(['rev-parse','HEAD']).trim();await writeFile(join(dir,'.git/HEAD'),commit+'\n');
  await rm(join(dir,'.git/refs'),{recursive:true});
  expect(()=>git(['ls-tree',commit])).toThrow();
  await restoreProviderGitStructure(dir,commit);
  expect(git(['ls-tree','--name-only',commit]).trim()).toBe('source.txt');
  await expect(restoreProviderGitStructure(dir,'0'.repeat(40))).rejects.toThrow();
  await expect(restoreProviderGitStructure(dir,'not-a-commit')).rejects.toThrow();
 }finally{await rm(dir,{recursive:true,force:true});}
});
