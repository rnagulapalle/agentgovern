// Strict extension of the measured fresh-host parent; existing proof remains intact.
import assert from "node:assert/strict";
export function semanticPlatformTrial(source){
 assert(typeof source==="string");
 const replace=(before,after)=>{assert.equal(source.split(before).length,2,"Measured parent anchor missing or ambiguous");source=source.replace(before,after);};
 replace('const docker=(...args)=>','import {stagingSemanticLifecycle} from "./staging-semantic-host.mjs";\nconst docker=(...args)=>');
 replace('let schemaExecutions=0;','let schemaExecutions=0;let semanticLifecycle;const semanticImage=`${project}:incompatible`;\nassert(artifactDirectory===undefined,"Semantic trial does not export or replace accepted package artifacts");');
 replace(' imageBuilder.close();\n const build=',` imageBuilder.build("-f","Dockerfile.temporal-version-proof","--build-arg","LOOPLABS_VERSION_CASE=incompatible","-t",semanticImage,".");built.push(semanticImage);
 imageBuilder.close();
 const build=`);
 replace(' stage="databases";compose(',` // Separate peak: browser is closed and original web/poller/provider roles are stopped.
 // Web's 512MiB allocation covers the controller; provider's 256MiB covers its isolated twin.
 // One additional 768MiB worker is explicitly reserved. Keep the original browser admission intact.
 const semanticAdmission=stagingHostAdmission(inventory,{hostReserveBytes:1024**3,services:Object.entries(roles).map(([name,role])=>({role,memoryBytes:Number(topology.services[name].mem_limit)+(role==="worker"?768*1024**2:0)}))});
 assert.equal(semanticAdmission.admitted,true,"Fresh host must admit the separate bounded semantic phase");
 stage="databases";compose(`);
 replace(' stage="archive-restore-containment";',` stage="semantic-worker-lifecycle";
 for(const role of ["web","temporal-worker","temporal-scheduler","connector-twin"])compose("stop",role);
 for(const role of ["web","temporal-worker","temporal-scheduler","connector-twin"])assert.equal(docker("inspect","--format","{{.State.Running}}",container(role)),"false");
 semanticLifecycle=await stagingSemanticLifecycle({project,trial,privateDir,images:{baseline:images.worker,incompatible:semanticImage,twin:images.twin,controller:images.provisioner},database:container("application-db"),temporal:container("temporal"),docker});
 compose("start","web","connector-twin");await ready(["web","connector-twin"]);
 stage="archive-restore-containment";`);
 replace(' outcome={...result,restoreContainment,',' outcome={...result,semanticLifecycle,semanticAdmission,restoreContainment,');
 return source;
}
