// Isolated input loading only. Existing accepted-release retrieval stays unchanged.
import assert from "node:assert/strict";
import {isAbsolute,resolve} from "node:path";
import {verifyComponentArtifactRequest,verifyComponentReceipt} from "./staging-component-artifact.mjs";
import {loadAndRetireMeasuredArchive} from "./staging-package-releases.mjs";

export async function loadCandidatePackageInputs({entries,sources,docker,owned,now=Date.now()}){
 assert(Array.isArray(entries)&&entries.length===2&&Array.isArray(owned));
 const directories=entries.map(entry=>entry.directory);
 assert(directories.every(path=>typeof path==="string"&&isAbsolute(path)&&resolve(path)===path));
 assert.notEqual(directories[0],directories[1]);
 const origins=entries.map(entry=>verifyComponentArtifactRequest(entry.request,entry.run,entry.job,entry.artifact,now));
 assert.notEqual(origins[0].runId,origins[1].runId,"Two independently observed origins required");
 const receipts=entries.map((entry,i)=>verifyComponentReceipt(entry.receiptBytes,origins[i],sources));
 assert.deepEqual(receipts[0].sourceFingerprints,receipts[1].sourceFingerprints,"Compatible current runtime sources required");
 assert.equal(receipts[0].buildId,receipts[1].buildId,"Package trial requires the same controlled worker contract");
 const ids=receipts.flatMap(receipt=>receipt.images.map(image=>image.id));
 assert.equal(new Set(ids).size,8,"Eight distinct immutable candidate image identities required");
 const inventory=docker("image","ls","--no-trunc","--quiet").split("\n").filter(Boolean);
 assert(inventory.every(id=>/^sha256:[a-f0-9]{64}$/.test(id)),"Complete successful image inventory required");
 assert(ids.every(id=>!inventory.includes(id)),"Candidate images must be absent on this isolated host");
 // Register only validated initially absent IDs for caller-owned cleanup. Never prune.
 owned.push(...ids);
 const packages=[];
 for(let i=0;i<2;i++){
  const receipt=receipts[i];
  const loaded=await loadAndRetireMeasuredArchive(directories[i],{
   buildId:receipt.buildId,images:receipt.images,manifestSha256:receipt.artifact.manifestSha256,
   archiveSha256:receipt.artifact.archiveSha256,archiveBytes:receipt.artifact.archiveBytes,
  },docker);
  packages.push({buildId:loaded.buildId,...Object.fromEntries(loaded.images.map(image=>[image.role,image.id]))});
 }
 return {purpose:"isolated-staging-proof-input",releaseAccepted:false,packages,origins};
}
