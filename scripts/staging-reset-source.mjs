// Add reset enrollment without editing the accepted drain/semantic sources.
import assert from 'node:assert/strict';
import {drainPlatform} from './staging-drain-source.mjs';
export function resetPlatform(source,hostFile){
 let out=drainPlatform(source,hostFile);
 const replace=(before,after)=>{assert.equal(out.split(before).length,2,'Reset assembly anchor missing or ambiguous');out=out.replace(before,after);};
 replace('const docker=(...args)=>','import {bootstrapResetAssembly} from "./staging-reset-bootstrap.mjs";\nconst docker=(...args)=>');
 replace(' const database=resolve(application,"database");',` stage="reset-assembly-enrollment";
 const resetAssembly=await bootstrapResetAssembly({project,parent,images:{baseline:images.worker,incompatible:semanticImage,provisioner:images.provisioner},ownerEnv:resolve(parent,"owner.env"),docker,runController});
 const database=resolve(application,"database");`);
 replace(' outcome={...result,semanticLifecycle,',' outcome={...result,resetAssembly,semanticLifecycle,');
 return out;
}
