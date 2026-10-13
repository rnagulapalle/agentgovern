import {test,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import {writeFileSync} from 'node:fs';
import {readFile,access} from 'node:fs/promises';
import {withInspectedWorkerArtifact} from './worker-artifact-enrollment.mjs';
test('source-owned consumer sees genuine bounded raw extraction before exact owned cleanup; callback refusal still cleans',async()=>{
 const bytes={service:'inert service',workflow:'inert workflow',lock:'inert lock'},hash=createHash('sha256').update(bytes.service).update(bytes.workflow).update(bytes.lock).digest('hex');
 const files={'quote-temporal-manifest.json':JSON.stringify({version:1,artifactHash:hash,buildId:'quote-'+hash}),'quote-temporal-service.cjs':bytes.service,'quote-temporal-workflow.cjs':bytes.workflow,'pnpm-lock.yaml':bytes.lock},image='sha256:'+'a'.repeat(64);
 for(const fail of [false,true]){let owner,removed=false,rawDirectory;
 const docker=(...a)=>{if(a[0]==='image')return JSON.stringify([{Id:image,Os:'linux',Architecture:'amd64',Config:{}}]);if(a[0]==='create'){owner=a[a.indexOf('--label')+1].split('=')[1];return 'created';}if(a[0]==='inspect')return JSON.stringify([{Image:image,Config:{Labels:{'looplabs.artifact.owner':owner}},State:{Running:false}}]);if(a[0]==='cp'){writeFileSync(a[2],files[basename(a[2])]);return '';}if(a[0]==='rm'){removed=true;return '';}throw Error('Unexpected operation');};
 const consume=async(artifact,directory)=>{expect(removed).toBe(false);expect(artifact.buildId).toBe('quote-'+hash);expect(await readFile(directory+'/quote-temporal-service.cjs','utf8')).toBe(bytes.service);rawDirectory=directory;if(fail)throw Error('source consumer refused');return {rawBytesConsumed:true};};
 if(fail)await expect(withInspectedWorkerArtifact(image,docker,'quote',consume)).rejects.toThrow('source consumer refused');else expect(await withInspectedWorkerArtifact(image,docker,'quote',consume)).toEqual({rawBytesConsumed:true});expect(removed).toBe(true);await expect(access(rawDirectory)).rejects.toThrow();
 }
});
