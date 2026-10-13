import {it,expect} from 'vitest';
import {mkdtemp,chmod,realpath,rm,readdir,stat,symlink,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {readOwnedPrivateFile} from '../lib/workspace/owned-private-file';
import {prepareRestoreOwnerAttachment} from './staging-restore-owner-attachment.mjs';
it('publishes exactly one private owner input and binds its sealed parent read-only',async()=>{const parent=await realpath(await mkdtemp(join(tmpdir(),'ll-restore-owner-')));try{await chmod(parent,0o700);const target={url:'postgresql://trial:private-fixture@trial-db:5432/trial',schema:'gateway_'+'a'.repeat(16),transport:{mode:'verified-tls'}};const result=await prepareRestoreOwnerAttachment(parent,target);expect(result.mount).toBe(`type=bind,src=${result.directory},dst=${result.directory},readonly`);expect((await stat(result.directory)).mode&0o7777).toBe(0o700);expect((await stat(result.file)).mode&0o7777).toBe(0o600);expect(await readdir(result.directory)).toEqual(['owner.json']);expect(JSON.parse((await readOwnedPrivateFile(result.file,16384)).bytes.toString())).toEqual(target);await expect(prepareRestoreOwnerAttachment(parent,target)).rejects.toMatchObject({code:'EEXIST'});}finally{await rm(parent,{recursive:true,force:true});}});
it('refuses parent symlink/permissive mode rather than weakening the private reader',async()=>{const parent=await realpath(await mkdtemp(join(tmpdir(),'ll-restore-owner-')));try{await chmod(parent,0o755);await expect(prepareRestoreOwnerAttachment(parent,{})).rejects.toThrow();await chmod(parent,0o700);const alias=join(parent,'alias');await symlink(parent,alias);await expect(prepareRestoreOwnerAttachment(alias,{})).rejects.toThrow();expect(await readdir(parent)).toEqual(['alias']);}finally{await rm(parent,{recursive:true,force:true});}});
it('refuses a preexisting sealed path without replacing it or exposing credentials',async()=>{const parent=await realpath(await mkdtemp(join(tmpdir(),'ll-restore-owner-')));try{await chmod(parent,0o700);await mkdir(join(parent,'restore-controller-owner'),{mode:0o700});await expect(prepareRestoreOwnerAttachment(parent,{})).rejects.toMatchObject({code:'EEXIST'});expect(await readdir(join(parent,'restore-controller-owner'))).toEqual([]);}finally{await rm(parent,{recursive:true,force:true});}});
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
it('constructor selector reaches both unchanged strict-reader controllers before any pool; sealed mounts remain wired',async()=>{
 const quote=await readFile('scripts/staging-quote-restore-controller.mjs','utf8'),ack=await readFile('scripts/staging-restore-controller.mjs','utf8'),producer=await readFile('scripts/staging-platform-proof.mjs','utf8');
 expect(quote).toContain("read(process.env.LOOPLABS_STAGING_CONTROLLER_OWNER_FILE,16384)");expect(quote).not.toContain("join(root,'restore-owner.json')");expect(ack).toContain('readOwnedPrivateFile(process.env.LOOPLABS_STAGING_CONTROLLER_OWNER_FILE,16384)');
 expect(quote.indexOf('const target=await read(')).toBeLessThan(quote.indexOf('const db=new pg.Pool'));expect(ack.indexOf('const owned=await readOwnedPrivateFile')).toBeLessThan(ack.indexOf('const db=new pg.Pool'));
 expect(producer).toContain('LOOPLABS_STAGING_CONTROLLER_OWNER_FILE=${restoreOwner.file}');expect(producer).toContain('restoreOwner.mount');expect(producer).toContain("[resolve(application,'observer.env'),restoreEnv]");
});
it('actual quote observer refuses missing wrong and insecure selector at inputs before database construction',async()=>{
 const parent=await realpath(await mkdtemp(join(tmpdir(),'ll-quote-restore-selector-')));try{
  const target={url:'postgresql://trial:private-fixture@trial-db:5432/trial',schema:'gateway_'+'a'.repeat(16),transport:{mode:'verified-tls'}};const attachment=await prepareRestoreOwnerAttachment(parent,target);
  for(const selector of [undefined,join(parent,'restore-owner.json'),attachment.file]){
   if(selector===attachment.file)await chmod(attachment.file,0o644);
   const env={NODE_ENV:"test" as const,PATH:process.env.PATH,HOME:parent,LOOPLABS_INSTALLED_ASSEMBLY_DIRECTORY:parent,LOOPLABS_STAGING_PLATFORM_PROOF:'isolated',...(selector?{LOOPLABS_STAGING_CONTROLLER_OWNER_FILE:selector}:{})};
   const child=spawnSync(process.execPath,['--import','tsx','scripts/staging-quote-restore-controller.mjs','restored'],{env,encoding:'utf8',timeout:15000});expect(child.status).toBe(1);const failure=JSON.parse(await readFile(join(parent,'quote-restore-private-failure.json'),'utf8'));expect(failure).toMatchObject({phase:'restored',checkpoint:'inputs'});expect(child.stderr).not.toContain('private-fixture');
  }
  await chmod(attachment.file,0o600);expect(JSON.parse((await readOwnedPrivateFile(attachment.file,16384)).bytes.toString())).toEqual(target);
  const wrong=join(parent,'wrong.json');await writeFile(wrong,'{}',{mode:0o600});await expect(readOwnedPrivateFile(join(parent,'missing.json'),16384)).rejects.toThrow();
 }finally{await rm(parent,{recursive:true,force:true});}
});
