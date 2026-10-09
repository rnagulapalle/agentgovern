// Actual fresh-host drill, using retained images and the existing complete trial.
import {readFile,writeFile,rm} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {createHash,randomUUID} from "node:crypto";
import {resolve} from "node:path";
import assert from "node:assert/strict";
import {retainedPackageTrial} from "./staging-package-trial-source.mjs";
import {typedReceipt} from "./staging-browser-record.mjs";
let generated;
try{
 assert(process.platform==="linux"&&process.arch==="x64"&&process.env.GITHUB_ACTIONS==="true"&&process.env.LOOPLABS_STAGING_PACKAGE_PROOF==="isolated","Fresh dedicated Linux/AMD64 CI required");
 assert(process.env.LOOPLABS_STAGING_TYPED_PLANNER==="isolated"&&process.env.LOOPLABS_STAGING_BROWSER_PROOF==="isolated"&&!process.env.LOOPLABS_STAGING_IMAGE_ARTIFACT,"Retained-package drill requires full typed/browser gates and no rebuild/export");
 const baseline=JSON.parse(await readFile("docs/evidence/staging-platform-browser-proof.json","utf8"));
 const original=await readFile("scripts/staging-platform-proof.mjs","utf8");
 assert.equal(createHash("sha256").update(original).digest("hex"),baseline.sourceFingerprints["scripts/staging-platform-proof.mjs"],"Measured parent source changed");
 const source=retainedPackageTrial(original);generated=resolve("scripts",`.package-trial-${randomUUID()}.mjs`);
 await writeFile(generated,source,{mode:0o600,flag:"wx"});
 const run=spawnSync(process.execPath,["--import","tsx",generated],{env:process.env,encoding:"utf8",timeout:20*60*1000,maxBuffer:4*1024*1024,stdio:["ignore","pipe","pipe"]});
 if(run.status!==0){
  // Parent emits only reviewed sanitized diagnostics; do not forward raw child output.
  const stage=/Complete isolated platform trial failed at ([a-z-]+)/.exec(run.stderr||"")?.[1];
  throw Error(stage?`Runtime checkpoint ${stage} failed`:"Runtime trial did not complete");
 }
 const result=JSON.parse(run.stdout.trim()),{packageTransitions,packageOrigins,...runtime}=result;
 assert(Array.isArray(packageTransitions)&&packageTransitions.length===2&&Array.isArray(packageOrigins)&&packageOrigins.length===2);
 const receipts=await Promise.all(["staging-platform-browser-before-dependency-proof.json","staging-platform-browser-proof.json"].map(async name=>JSON.parse(await readFile(`docs/evidence/${name}`,"utf8"))));
 const packages=receipts.map(r=>Object.fromEntries(r.images.map(x=>[x.role,x.id])));
 for(let i=0;i<2;i++){
  const from=packages[i],to=packages[1-i],r=receipts[i];
  assert.deepEqual(packageTransitions[i],{buildId:baseline.buildId,from:{web:from.web,worker:from.worker},to:{web:to.web,worker:to.worker},replacedRoles:3,retainedRoles:5,pendingAuthorityChecks:3});
  assert.deepEqual(packageOrigins[i],{runId:r.executionEvidence.runId,manifestSha256:r.artifact.manifestSha256,archiveSha256:r.artifact.archiveSha256,archiveBytes:r.artifact.archiveBytes});
 }
 const metadata={runId:Number(process.env.GITHUB_RUN_ID),privateWorkflowCommit:process.env.GITHUB_SHA,publicBaseCommit:process.env.LOOPLABS_SOURCE_BASE,exactCompressedOverlaySha256:process.env.LOOPLABS_SOURCE_OVERLAY_SHA256};
 // Existing complete typed/TLS/restore/effect acceptance is mandatory, not replaced.
 const checked=typedReceipt(runtime,metadata,{});
 const files=[...Object.keys(baseline.sourceFingerprints),"scripts/staging-package-transition.mjs","scripts/staging-package-pending.mjs","scripts/staging-package-pending-controller.mjs","scripts/staging-package-releases.mjs","scripts/staging-package-trial-source.mjs","scripts/staging-package-proof.mjs"];
 const sourceFingerprints=Object.fromEntries(await Promise.all(files.sort().map(async p=>[p,createHash("sha256").update(await readFile(p)).digest("hex")])));
 const receipt={passed:true,scope:"same-worker-build retained application package promotion/reversion with unapproved pending API work",packageTransitions,packageOrigins,releaseImagesRemoved:true,generatedTrialSha256:createHash("sha256").update(source).digest("hex"),runtime:checked,sourceFingerprints,notVerified:["pending-work UI across promotion/reversion","semantic worker-version upgrade","persistent staging and operator rollback acceptance","live providers and enterprise production SLA"]};
 assert(typeof process.env.LOOPLABS_STAGING_PACKAGE_RECEIPT==="string"&&process.env.LOOPLABS_STAGING_PACKAGE_RECEIPT.startsWith("/"));
 await writeFile(process.env.LOOPLABS_STAGING_PACKAGE_RECEIPT,JSON.stringify(receipt,null,2)+"\n",{mode:0o600,flag:"wx"});
 console.log(JSON.stringify(receipt,null,2));
}catch(error){
 const stage=error instanceof Error?/^Runtime checkpoint ([a-z-]+) failed$/.exec(error.message)?.[1]:undefined;
 console.error(`Retained package drill refused${stage?` at ${stage}`:""}; no raw runtime output, payload or credentials printed.`);process.exitCode=1;
}finally{if(generated)await rm(generated,{force:true});}
