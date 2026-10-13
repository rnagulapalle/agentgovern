import {test,expect} from 'vitest';
import {mkdtemp,realpath,chmod,writeFile,rm,link,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {digestOwnedPrivateArchive,maxArchiveBytes} from './staging-image-artifact.mjs';
async function fixture(run){const root=await realpath(await mkdtemp(join(tmpdir(),'ll-owned-archive-')));await chmod(root,0o700);try{await run(root);}finally{await rm(root,{recursive:true,force:true});}}
test('owned archive streams more than credential-reader capacity with independently retained digest and stable namespace',()=>fixture(async root=>{
 const file=join(root,'approved.archive'),bytes=Buffer.alloc(2*1024**2,7);bytes.write('PGDMP');await writeFile(file,bytes,{mode:0o600});
 const result=await digestOwnedPrivateArchive(file);expect(result.bytes).toBe(bytes.length);expect(result.header).toBe('PGDMP');const {createHash}=await import('node:crypto');expect(result.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));await result.assertStable();
 await writeFile(file,Buffer.from('PGDMP changed'));await expect(result.assertStable()).rejects.toThrow();
}));
test('archive cannot use symlinks, hardlinks, loose ownership modes, unbounded limits or mutable parent',()=>fixture(async root=>{
 const file=join(root,'archive');await writeFile(file,'PGDMP fixture',{mode:0o600});
 for(const bound of [0,NaN,maxArchiveBytes+1,3])await expect(digestOwnedPrivateArchive(file,bound)).rejects.toThrow();
 await chmod(file,0o644);await expect(digestOwnedPrivateArchive(file)).rejects.toThrow();await chmod(file,0o600);
 const hard=join(root,'hard');await link(file,hard);await expect(digestOwnedPrivateArchive(file)).rejects.toThrow();await rm(hard);
 const soft=join(root,'soft');await symlink(file,soft);await expect(digestOwnedPrivateArchive(soft)).rejects.toThrow();
 const read=await digestOwnedPrivateArchive(file);await chmod(root,0o755);await expect(read.assertStable()).rejects.toThrow();
}));
