// Strict extensions: preserve measured sources, never silently accept moved anchors.
import assert from 'node:assert/strict';
import {semanticPlatformTrial} from './staging-semantic-trial-source.mjs';
function editor(source){assert(typeof source==='string');return (before,after)=>{assert.equal(source.split(before).length,2,'Drain source anchor missing or ambiguous');source=source.replace(before,after);return source;};}
export function drainController(source){
 const replace=editor(source);let out;
 out=replace('const dir="/run/trial"','import {exerciseDrain} from "./staging-drain-exercise.mjs";\nconst dir="/run/trial"');
 out=replace(' const [old,next]=runs;',' const [old,next]=runs;\n phase="drain-admission";\n const admissionFence=await exerciseDrain({db,owner,runs,artifacts,token,mark,checkpoint});');
 out=replace('await mark("replay-completed",{passed:true,replay,actualEffects:4,','await mark("replay-completed",{passed:true,replay,admissionFence,actualEffects:4,');
 return out;
}
export function drainHost(source,controllerFile){
 assert(/^scripts\/\.drain-controller-[a-f0-9-]+\.mjs$/.test(controllerFile));
 const replace=editor(source);let out;
 out=replace('let networkOwned=false,volumeOwned=false,child,exit=null,phase="inputs";','let networkOwned=false,volumeOwned=false,child,ownerChild,ownerExit=null,exit=null,phase="inputs";');
 out=replace('  const artifacts=[];','  const artifacts=[],extractedImages=[];');
 out=replace('   for(const [from,to] of [["/app/.worker/temporal-manifest.json"','   extractedImages.push(inspect(name).Image);\n   for(const [from,to] of [["/app/.worker/temporal-manifest.json"');
 out=replace('  phase="workers";',`  phase="registry-owner";
  assert.equal(input.ownerEnv,resolve(trial,"..","owner.env"));
  const ownerValues=parseEnv(await readFile(input.ownerEnv,"utf8"));
  const ownerURL=ownerValues.LOOPLABS_STAGING_OWNER_URL;assert.equal(new URL(ownerURL).hostname,"application-db");
  assert(!/[\\r\\n\\0]/.test(ownerURL));
  const ownerFile=resolve(trial,"..",project+"-registry-owner.env");
  await writeFile(ownerFile,"LOOPLABS_MIGRATION_DATABASE_URL="+ownerURL+"\\nLOOPLABS_STAGING_DRAIN_PROOF=isolated\\n",{flag:"wx",mode:0o600});
  await mark("inspected-images",extractedImages);
  const ownerName=project+"-drain-owner";names.push(ownerName);
  // Uses the explicitly reserved, stopped original scheduler's 256MiB allocation.
  ownerChild=spawn("docker",["run","--rm","--name",ownerName,...hardened(256*1024**2),"--user",uid,"--env-file",ownerFile,"--mount",\`type=bind,src=\${trial},dst=/run/trial\`,...[["baseline","/run/baseline"],["incompatible","/run/incompatible"]].flatMap(([role,dst])=>["--mount",\`type=bind,src=\${resolve(dir,role)},dst=\${dst},readonly\`]),images.controller,"node","--import","tsx","scripts/staging-drain-owner.mjs"],{stdio:["ignore","ignore","pipe"]});
  ownerChild.stderr.resume();ownerChild.on("exit",code=>{ownerExit=code??127;});ownerChild.on("error",()=>{ownerExit=127;});
  await until(async()=>{if(ownerExit!==null)throw Error("Registry owner exited before enrollment");try{await access(resolve(dir,"registry-ready.json"));return true;}catch{return false;}});
  bound(ownerName,256*1024**2,images.controller);
  phase="workers";`);
 out=replace('  phase="controller";','  assert.deepEqual([old.Image,next.Image],extractedImages);\n  phase="controller";');
 out=replace('"--env","LOOPLABS_SEMANTIC_LIFECYCLE=isolated",','"--env","LOOPLABS_SEMANTIC_LIFECYCLE=isolated","--env","LOOPLABS_STAGING_DRAIN_PROOF=isolated",');
 out=replace('"scripts/staging-semantic-controller.mjs"',JSON.stringify(controllerFile));
 out=replace('  phase="writer-containment";','  await until(()=>ownerExit!==null);assert.equal(ownerExit,0);\n  assert.deepEqual(receipt.admissionFence,{passed:true,admissionFirstCommitted:true,drainFirstRefused:true,failedTransferRolledBack:true,existingTransfersIdempotent:true,additionalHeldRoute:1,noRetirementAuthorized:true});\n  phase="writer-containment";');
 out=replace('  return {passed:true,builds:','  return {admissionFence:receipt.admissionFence,passed:true,builds:');
 out=replace('  child?.kill("SIGTERM");','  child?.kill("SIGTERM");ownerChild?.kill("SIGTERM");');
 return out;
}
export function drainPlatform(source,hostFile){
 assert(/^\.drain-host-[a-f0-9-]+\.mjs$/.test(hostFile));
 let out=semanticPlatformTrial(source);
 const replace=editor(out);
 out=replace('from "./staging-semantic-host.mjs"',`from "./${hostFile}"`);
 out=replace('database:container("application-db"),temporal:container("temporal"),docker});','database:container("application-db"),temporal:container("temporal"),ownerEnv:resolve(parent,"owner.env"),docker});');
 return out;
}
