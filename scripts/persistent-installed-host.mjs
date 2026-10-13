// Host observes exact current images; offline owner receives bytes, never socket.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {retainInstalledImageBytes} from './staging-installed-host-coordinator.mjs';
import {installedAssemblySourceSnapshot} from './staging-installed-source-snapshot.mjs';
import {validateCurrentInspectedImage} from './staging-installed-publication.ts';
const sha=b=>createHash('sha256').update(b).digest('hex');
/** Explicit offline preparation only. Caller runs one-shot and then calls verify
 * again before attaching runtimes. Accepted six-image release still separate. */
export async function preparePersistentOwnerTransport(input){
 assert(process.platform==='linux'&&process.arch==='x64');const {root,docker,verifiers,images,database,settings,membersFile,sourceFreezeSha256,sourceRoot}=input;
 assert(root?.startsWith('/')&&membersFile?.startsWith('/')&&typeof docker==='function');assert(typeof verifiers?.ack==='function'&&typeof verifiers?.quote==='function');
 const sourceBefore=await installedAssemblySourceSnapshot(sourceRoot);assert.equal(sha(JSON.stringify(sourceBefore,null,2)+'\n'),sourceFreezeSha256);const construction=sha(await readFile(join(sourceRoot,'scripts/current-installed-proof-sources.json')));
 const artifacts=[];
 for(const profile of ['ack','quote']){const observed=await retainInstalledImageBytes(images[profile],profile,docker,join(root,profile+'-artifact'));const current=await verifiers[profile]({imageId:images[profile],constructionSha256:construction});validateCurrentInspectedImage(images[profile],construction,current,observed,profile);artifacts.push({profile,imageId:observed.imageId,directory:observed.directory});}
 await writeFile(join(root,'retained-owner-input.json'),JSON.stringify({database,settings,images,membersFile,sourceFreezeSha256,sourceRoot,artifacts}),{mode:0o600,flag:'wx'});
 return {verifyAfterOwner:async()=>{assert.deepEqual(await installedAssemblySourceSnapshot(sourceRoot),sourceBefore);for(const profile of ['ack','quote'])await verifiers[profile]({imageId:images[profile],constructionSha256:construction});},releaseAccepted:false,ownerMustExit:true};
}
