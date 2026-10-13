// Sealed proof observer input only. No database mutation or runtime authority.
import assert from 'node:assert/strict';
import {mkdir,lstat,realpath,writeFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {readOwnedPrivateFile} from '../lib/workspace/owned-private-file.ts';
export async function prepareRestoreOwnerAttachment(parent,target){
 assert(typeof parent==='string'&&resolve(parent)===parent&&await realpath(parent)===parent);
 const stat=await lstat(parent);assert(stat.isDirectory()&&!stat.isSymbolicLink()&&stat.uid===process.getuid()&&(stat.mode&0o7777)===0o700);
 const directory=join(parent,'restore-controller-owner');await mkdir(directory,{mode:0o700});
 const file=join(directory,'owner.json');await writeFile(file,JSON.stringify(target),{mode:0o600,flag:'wx'});
 const observed=await readOwnedPrivateFile(file,16384);assert.deepEqual(JSON.parse(observed.bytes.toString('utf8')),target);assert.deepEqual(await readdir(directory),['owner.json']);await observed.assertStable();
 // Mount the sealed parent, not just its file: Docker otherwise invents a
 // root-owned0755 parent and the unchanged private reader correctly refuses.
 return {file,directory,mount:`type=bind,src=${directory},dst=${directory},readonly`};
}
