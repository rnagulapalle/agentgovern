// Extend the measured trial scaffolding without editing/rebuilding the retained releases.
import assert from "node:assert/strict";
export function retainedPackageTrial(source){
 assert(typeof source==="string");
 function replace(before,after){assert.equal(source.split(before).length,2,"Measured trial anchor is missing or ambiguous");source=source.replace(before,after);}
 replace('const docker=(...args)=>',`import {loadPackageReleases} from "./staging-package-releases.mjs";
import {transitionRuntimePackage} from "./staging-package-transition.mjs";
import {withPendingPackageBrowser} from "./staging-package-browser.mjs";
const docker=(...args)=>`);
 replace('let schemaExecutions=0;',`let schemaExecutions=0;let packageReleases,pendingPackageBrowser;const packageTransitions=[];
assert(artifactDirectory===undefined,"This trial retrieves existing releases; never builds or exports a replacement artifact");`);
 const start=' stage="images";imageBuilder.start();';
 const end=' imageBuilder.close();\n const build=';
 assert.equal(source.split(start).length,2);assert.equal(source.split(end).length,2);
 const begin=source.indexOf(start),finish=source.indexOf(end,begin);
 assert(finish>begin);
 source=source.slice(0,begin)+` stage="retained-release-load";
 packageReleases=await loadPackageReleases(JSON.parse(await readFile(process.env.LOOPLABS_STAGING_PACKAGE_DIRECTORIES,"utf8")),docker,built);
 for(const role of ["web","worker","twin","provisioner"])images[role]=packageReleases.packages[0][role];
 Object.assign(env,{LOOPLABS_STAGING_WEB_IMAGE:images.web,LOOPLABS_STAGING_WORKER_IMAGE:images.worker,LOOPLABS_STAGING_TWIN_IMAGE:images.twin});
 const build=`+source.slice(finish+end.length);
 replace(' await checkpoint("held.json");',` await checkpoint("held.json");
 stage="pending-package-baseline";
 const pending=mode=>JSON.parse(runController(project+"-package-"+mode,project+"_application",images.worker,["node","/app/package-pending-controller.mjs",mode],["type=bind,src="+trial+",dst=/run/trial","type=bind,src="+resolve("scripts/staging-package-pending-controller.mjs")+",dst=/app/package-pending-controller.mjs,readonly","type=bind,src="+resolve("scripts/staging-package-pending.mjs")+",dst=/app/staging-package-pending.mjs,readonly"]));
 await until(()=>{try{return pending("baseline").passed===true;}catch{return false;}},"Started pending ownership baseline unavailable",30);
 const heldProvider=JSON.parse(docker("exec",container("connector-twin"),"cat","/state/connector-twin-state.json")).effects;assert.equal(Object.keys(heldProvider).length,0);
 const assertPending=async()=>{assert.equal(pending("compare").passed,true);assert(JSON.stringify(JSON.parse(docker("exec",container("connector-twin"),"cat","/state/connector-twin-state.json")).effects)===JSON.stringify(heldProvider),"Provider effects changed without approval");};
 const transitionDocker=(...args)=>{const options=typeof args.at(-1)==="object"?args.pop():undefined;return options?execFileSync("docker",args,{env:options.env,encoding:"utf8",timeout:180000,maxBuffer:4*1024*1024,stdio:["ignore","pipe","pipe"]}).trim():docker(...args);};
 const transitionReady=async(selected,services)=>until(()=>services.every(s=>{const id=selected("ps","-aq",s);return id&&docker("inspect","--format","{{.State.Health.Status}}",id)==="healthy";}),"Replacement roles unavailable",90);
 const contract=p=>({buildId:p.buildId,web:p.web,worker:p.worker});
 pendingPackageBrowser=await withPendingPackageBrowser(trial,async verifyUI=>{
 await verifyUI();
 for(const [from,to] of [[0,1],[1,0]]){
  stage=from===0?"pending-package-promotion":"pending-package-reversion";
  const switched=await transitionRuntimePackage({project,environment:env,current:contract(packageReleases.packages[from]),target:contract(packageReleases.packages[to]),docker:transitionDocker,assertPending,ready:transitionReady});
  Object.assign(env,switched.environment);packageTransitions.push(switched.evidence);await verifyUI();
 }
 });
 await assertPending();`);
 replace(' outcome={...result,restoreContainment,dependencyImages,',' outcome={...result,packageTransitions,pendingPackageBrowser,packageOrigins:packageReleases.origins,restoreContainment,dependencyImages,');
 replace('if(outcome&&!process.exitCode){',`if(outcome&&!process.exitCode){
 const remaining=docker("image","ls","--no-trunc","--quiet").split("\\n").filter(Boolean);
 assert(built.every(id=>!remaining.includes(id)),"Every loaded release image must be removed after the trial");`);
 assert(!source.includes('imageBuilder.start()')&&!source.includes('imageBuilder.build('),"Retained package trial must not rebuild");
 return source;
}
