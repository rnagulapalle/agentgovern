// Actual isolated candidate package drill. Its output cannot authorize a release.
import {readFile,writeFile,rm} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {createHash,randomUUID} from "node:crypto";
import {resolve,isAbsolute} from "node:path";
import assert from "node:assert/strict";
import {candidatePackageTrial} from "./staging-package-trial-source.mjs";
import {typedReceipt,typedSourceFiles} from "./staging-browser-record.mjs";
let generated;
try{
 assert(process.platform==="linux"&&process.arch==="x64"&&process.env.GITHUB_ACTIONS==="true"&&process.env.LOOPLABS_STAGING_CANDIDATE_PACKAGE_PROOF==="isolated","Fresh isolated candidate package CI required");
 assert(process.env.LOOPLABS_STAGING_PACKAGE_PROOF==="isolated"&&process.env.LOOPLABS_STAGING_TYPED_PLANNER==="isolated"&&process.env.LOOPLABS_STAGING_BROWSER_PROOF==="isolated"&&!process.env.LOOPLABS_STAGING_IMAGE_ARTIFACT);
 const output=process.env.LOOPLABS_STAGING_CANDIDATE_PACKAGE_RECEIPT;
 assert(typeof process.env.RUNNER_TEMP==="string"&&isAbsolute(process.env.RUNNER_TEMP));
 assert(typeof output==="string"&&isAbsolute(output)&&resolve(output)===output&&output.startsWith(resolve(process.env.RUNNER_TEMP)+"/"),"Separate owned candidate output required");
 const original=await readFile("scripts/staging-platform-proof.mjs","utf8"),source=candidatePackageTrial(original);
 generated=resolve("scripts",`.candidate-package-trial-${randomUUID()}.mjs`);await writeFile(generated,source,{mode:0o600,flag:"wx"});
 const run=spawnSync(process.execPath,["--import","tsx",generated],{env:process.env,encoding:"utf8",timeout:20*60*1000,maxBuffer:4*1024*1024,stdio:["ignore","pipe","pipe"]});
 assert.equal(run.status,0,"Candidate runtime trial did not complete");
 const {packageTransitions,packageOrigins,pendingPackageBrowser,candidatePackageInputs,...runtime}=JSON.parse(run.stdout.trim());
 assert.deepEqual(Object.keys(candidatePackageInputs).sort(),["packages","purpose","releaseAccepted"]);
 assert.equal(candidatePackageInputs.purpose,"isolated-staging-proof-input");assert.equal(candidatePackageInputs.releaseAccepted,false);
 const packages=candidatePackageInputs.packages;
 assert(Array.isArray(packages)&&packages.length===2&&Array.isArray(packageOrigins)&&packageOrigins.length===2&&Array.isArray(packageTransitions)&&packageTransitions.length===2);
 assert.notEqual(packageOrigins[0].runId,packageOrigins[1].runId);
 const roles=["web","worker","twin","provisioner"];
 for(const p of packages){assert.deepEqual(Object.keys(p).sort(),["buildId",...roles].sort());assert.equal(p.buildId,runtime.buildId);for(const role of roles)assert(/^sha256:[a-f0-9]{64}$/.test(p[role]));}
 assert.equal(new Set(packages.flatMap(p=>roles.map(role=>p[role]))).size,8);
 assert.deepEqual(runtime.images,roles.map(role=>({role,id:packages[0][role]})));
 for(let i=0;i<2;i++){
  const origin=packageOrigins[i];assert.equal(origin.purpose,"isolated-staging-proof-input");assert.equal(origin.releaseAccepted,false);assert(typeof origin.qualityPassed==="boolean");
  assert.deepEqual(packageTransitions[i],{buildId:runtime.buildId,from:{web:packages[i].web,worker:packages[i].worker},to:{web:packages[1-i].web,worker:packages[1-i].worker},replacedRoles:3,retainedRoles:5,pendingAuthorityChecks:3});
 }
 assert.deepEqual(pendingPackageBrowser,{trustedHTTPS:true,namedFormSession:true,sameSession:true,savedPendingReloads:3,sameActionHashes:true,heldWithoutApproval:true,noSelfApproval:true,mobileWidth:390,noHorizontalOverflow:true});
 const metadata={runId:Number(process.env.GITHUB_RUN_ID),privateWorkflowCommit:process.env.GITHUB_SHA,publicBaseCommit:process.env.LOOPLABS_SOURCE_BASE,exactCompressedOverlaySha256:process.env.LOOPLABS_SOURCE_OVERLAY_SHA256};
 const checked=typedReceipt(runtime,metadata,{});
 const prior=JSON.parse(await readFile("docs/evidence/staging-platform-browser-prepared-proof.json","utf8"));
 const additional=["scripts/staging-component-artifact.mjs","scripts/staging-candidate-package-inputs.mjs","scripts/staging-candidate-package-files.mjs","scripts/staging-candidate-package-proof.mjs",...["transition","pending","pending-controller","releases","trial-source","browser"].map(name=>`scripts/staging-package-${name}.mjs`)];
 const files=[...new Set([...typedSourceFiles(prior.sourceFingerprints),...additional])].sort();
 const sourceFingerprints=Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash("sha256").update(await readFile(file)).digest("hex")])));
 const receipt={passed:true,purpose:"isolated-staging-proof-input",releaseAccepted:false,scope:"candidate package promotion/reversion with pending exact authority and complete typed runtime checks",packageTransitions,packageOrigins,pendingPackageBrowser,releaseImagesRemoved:true,generatedTrialSha256:createHash("sha256").update(source).digest("hex"),runtime:checked,sourceFingerprints,notVerified:["full regression gate acceptance","persistent staging and operator rollback acceptance","live providers and enterprise production SLA"]};
 await writeFile(output,JSON.stringify(receipt,null,2)+"\n",{mode:0o600,flag:"wx"});console.log(JSON.stringify(receipt));
}catch{
 console.error("Candidate package drill refused; no release authority, raw runtime output or credentials printed.");process.exitCode=1;
}finally{if(generated)await rm(generated,{force:true});}
