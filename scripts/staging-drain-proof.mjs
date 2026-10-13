// Full fresh-host execution, including the measured parent's original acceptance gates.
import assert from "node:assert/strict";
import {readFile,writeFile,rm} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {randomUUID,createHash} from "node:crypto";
import {resolve} from "node:path";
import {drainPlatform,drainHost,drainController,writeDrainController,drainAdmissionRefusal} from "./staging-drain-source.mjs";
import {typedReceipt} from "./staging-browser-record.mjs";
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const generatedFiles=[];let generated,owned=false;
try{
 assert(process.platform==="linux"&&process.arch==="x64"&&process.env.GITHUB_ACTIONS==="true"&&process.env.LOOPLABS_STAGING_SEMANTIC_PROOF==="isolated"&&process.env.LOOPLABS_STAGING_DRAIN_PROOF==="isolated");
 assert(process.env.LOOPLABS_STAGING_TYPED_PLANNER==="isolated"&&process.env.LOOPLABS_STAGING_BROWSER_PROOF==="isolated"&&!process.env.LOOPLABS_STAGING_IMAGE_ARTIFACT);
 const baseline=JSON.parse(await readFile("docs/evidence/staging-semantic-proof.json","utf8"));
 const additional=["lib/enquiries/worker-admission-schema.sql","scripts/worker-admission-setup.ts","scripts/worker-artifact-enrollment.mjs","scripts/staging-drain-owner.mjs","scripts/staging-drain-exercise.mjs","scripts/staging-drain-source.mjs","scripts/staging-drain-proof.mjs"];
 const files=[...Object.keys(baseline.sourceFingerprints),...additional].sort();
 assert.equal(new Set(files).size,files.length);
 const fingerprints=Object.fromEntries(await Promise.all(files.map(async f=>[f,hash(await readFile(f))])));
 for(const [f,digest] of Object.entries(baseline.sourceFingerprints))assert.equal(fingerprints[f],digest,"Measured baseline source changed");
 const id=randomUUID(),controllerFile=`.drain-controller-${id}.mjs`,hostFile=`.drain-host-${id}.mjs`;
 const controller=drainController(await readFile("scripts/staging-semantic-controller.mjs","utf8"));
 const host=drainHost(await readFile("scripts/staging-semantic-host.mjs","utf8"),`scripts/${controllerFile}`);
 for(const [file,content] of [[controllerFile,controller],[hostFile,host]]){const path=resolve("scripts",file);if(file===controllerFile)await writeDrainController(path,content);else await writeFile(path,content,{flag:"wx",mode:0o600});generatedFiles.push(path);}
 const source=drainPlatform(await readFile("scripts/staging-platform-proof.mjs","utf8"),hostFile);
 generated=resolve("scripts",`.drain-trial-${id}.mjs`);await writeFile(generated,source,{flag:"wx",mode:0o600});owned=true;

 const run=spawnSync(process.execPath,["--import","tsx",generated],{env:process.env,encoding:"utf8",timeout:30*60*1000,maxBuffer:4*1024*1024,stdio:["ignore","pipe","pipe"]});
 if(run.status!==0){
  const refused=drainAdmissionRefusal(run.stderr);if(refused)console.error(JSON.stringify(refused));
  const detail=/Semantic host refused at ([a-z-]+(?:\/[a-z-]+)?);/.exec(run.stderr||"")?.[1];
  const parent=/Complete isolated platform trial failed at ([a-z-]+)/.exec(run.stderr||"")?.[1];
  if(detail)console.error(`Verified semantic checkpoint ${detail} failed; no raw child output printed.`);
  if(parent)console.error(`Original runtime checkpoint ${parent} failed; no raw child output printed.`);
  throw Error("Complete semantic runtime did not pass");
 }
 const {semanticLifecycle,semanticAdmission,...runtime}=JSON.parse(run.stdout.trim());
 assert.deepEqual(semanticLifecycle.admissionFence,{passed:true,admissionFirstCommitted:true,drainFirstRefused:true,failedTransferRolledBack:true,existingTransfersIdempotent:true,additionalHeldRoute:1,noRetirementAuthorized:true});
 assert.equal(semanticAdmission.admitted,true);
 assert(semanticLifecycle?.passed===true&&semanticLifecycle.oldWorkerKilled===true&&semanticLifecycle.oldWorkerRecreated===true&&semanticLifecycle.newWorkerContinued===true&&semanticLifecycle.additionalWritersStopped===true);
 assert.equal(semanticLifecycle.heldEffects,0);assert.equal(semanticLifecycle.newWhileOldAbsentEffects,2);assert.equal(semanticLifecycle.finalEffects,4);
 assert.equal(semanticLifecycle.builds.length,2);assert.notEqual(...semanticLifecycle.builds);assert(semanticLifecycle.builds.every(b=>/^ack-[a-f0-9]{64}$/.test(b)));
 assert.equal(semanticLifecycle.images.length,2);assert.notEqual(...semanticLifecycle.images);assert(semanticLifecycle.images.every(b=>/^sha256:[a-f0-9]{64}$/.test(b)));
 assert.deepEqual(semanticLifecycle.replay.checks.map(x=>x.result),["compatible","nondeterminism-refused","compatible","nondeterminism-refused"]);
 const metadata={runId:Number(process.env.GITHUB_RUN_ID),privateWorkflowCommit:process.env.GITHUB_SHA,publicBaseCommit:process.env.LOOPLABS_SOURCE_BASE,exactCompressedOverlaySha256:process.env.LOOPLABS_SOURCE_OVERLAY_SHA256};
 const checked=typedReceipt(runtime,metadata,{});
 for(const [f,digest] of Object.entries(fingerprints))assert.equal(hash(await readFile(f)),digest,"Source changed during trial");
 assert(typeof process.env.LOOPLABS_STAGING_DRAIN_RECEIPT==="string"&&process.env.LOOPLABS_STAGING_DRAIN_RECEIPT.startsWith("/"));
 assert.equal(hash(await readFile(resolve("scripts",controllerFile))),hash(controller));
 assert.equal(hash(await readFile(resolve("scripts",hostFile))),hash(host));
 assert.equal(hash(await readFile(generated)),hash(source));
 const receipt={passed:true,scope:"Disposable authenticated worker admission/drain races with existing pinned histories and bounded private record twins",semanticLifecycle,semanticAdmission,runtime:checked,sourceFingerprints:fingerprints,generatedTrialSha256:hash(source),generatedControllerSha256:hash(controller),generatedHostSha256:hash(host),notVerified:["full retirement/reset fence", "migration14 archive restore/retention policy","long-term image and history retention","persistent remote operator acceptance","live providers","production cutover","enterprise production SLA"]};
 await writeFile(process.env.LOOPLABS_STAGING_DRAIN_RECEIPT,JSON.stringify(receipt,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log(JSON.stringify(receipt,null,2));
}catch{console.error("Full isolated drain proof refused; no raw child output, history or credentials printed.");process.exitCode=1;}
finally{if(owned)await rm(generated,{force:true});for(const path of generatedFiles)await rm(path,{force:true});}
