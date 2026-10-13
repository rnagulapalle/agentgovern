// Explicit one-shot retained owner process. Never invoked by runtime restart.
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {readOwnedPrivateFile} from '../lib/workspace/owned-private-file.ts';
import {readPersistentMembers} from './staging-installed-database-bootstrap.ts';
import {preparePersistentOwnerFromExtracted} from './persistent-installed-owner.ts';
const root=process.env.LOOPLABS_INSTALLED_ASSEMBLY_DIRECTORY;
assert(root?.startsWith('/')&&process.env.LOOPLABS_RETAINED_INSTALLATION==='explicit-offline');
const read=await readOwnedPrivateFile(join(root,'retained-owner-input.json'),65536),input=JSON.parse(read.bytes.toString('utf8'));
assert.deepEqual(Object.keys(input).sort(),['artifacts','database','images','membersFile','settings','sourceFreezeSha256','sourceRoot']);
const members=await readPersistentMembers(input.membersFile);await read.assertStable();await members.assertStable();
await preparePersistentOwnerFromExtracted(root,{sourceRoot:input.sourceRoot,database:input.database,images:input.images,settings:input.settings,sourceFreezeSha256:input.sourceFreezeSha256,members:members.members},input.artifacts);
await read.assertStable();await members.assertStable();
await writeFile(join(root,'retained-owner-stopped.json'),JSON.stringify({ownerPoolsClosed:true,releaseAccepted:false}),{mode:0o600,flag:'wx'});
