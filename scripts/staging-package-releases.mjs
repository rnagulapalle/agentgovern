// Cold-load the two measured releases; provenance is checked by the private CI download gate.
import assert from "node:assert/strict";
import {readFile,lstat,unlink} from "node:fs/promises";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {loadTestedImages} from "./staging-image-artifact.mjs";
const roles=["web","worker","twin","provisioner"];
export async function loadAndRetireMeasuredArchive(directory,expected,docker){
 const archive=resolve(directory,"images.tar"),before=await lstat(archive);
 assert(before.isFile()&&!before.isSymbolicLink()&&before.uid===process.getuid(),"Owned regular downloaded archive required");
 const loaded=await loadTestedImages({directory,expectedManifestSha256:expected.manifestSha256,docker});
 assert.equal(loaded.buildId,expected.buildId);assert.deepEqual(loaded.images,expected.images);
 assert.equal(loaded.archive.sha256,expected.archiveSha256);assert.equal(loaded.archive.bytes,expected.archiveBytes);
 const after=await lstat(archive);
 assert(after.isFile()&&!after.isSymbolicLink(),"Downloaded archive replaced after load");
 for(const key of ["dev","ino","uid","size","mtimeMs","ctimeMs"])assert.equal(after[key],before[key],"Downloaded archive changed after load");
 // Delete only this validated local download, never its directory, remote artifact,
 // manifest, other files or Docker layers. The next release needs this disk space.
 await unlink(archive);
 return loaded;
}
export async function loadPackageReleases(directories,docker,owned){
 let phase="directories";
 try{
 assert(Array.isArray(directories)&&directories.length===2&&directories.every(p=>typeof p==="string"&&p.startsWith("/"))&&directories[0]!==directories[1]);
 phase="retained-receipts";
 const receipts=await Promise.all(["staging-platform-browser-before-dependency-proof.json","staging-platform-browser-proof.json"].map(async name=>JSON.parse(await readFile(`docs/evidence/${name}`,"utf8"))));
 assert.deepEqual(receipts.map(r=>r.executionEvidence.runId),[37877500571,37881876443]);
 assert(receipts.every(r=>r.passed===true&&r.browser.passed===true&&r.artifact.reloadedAfterRemoval===true));
 assert.equal(receipts[0].buildId,receipts[1].buildId);
 const expected=receipts.map(r=>r.artifact.images);
 for(const list of expected){assert(Array.isArray(list)&&list.length===4);assert.deepEqual(list.map(x=>x.role),roles);for(const i of list)assert(typeof i.id==="string"&&/^sha256:[a-f0-9]{64}$/.test(i.id));}
 const ids=expected.flat().map(x=>x.id);assert.equal(new Set(ids).size,8,"Different retained packages required");
 // Current application/worker source must still match the measured release.
 // Only the three historical proof/Compose dependency changes may differ.
 const historicalChanges=new Set(["docker-compose.temporal-platform.yml","scripts/staging-browser-record.mjs","scripts/staging-platform-proof.mjs"]);
 phase="source-fingerprints";
 for(const [file,digest] of Object.entries(receipts[1].sourceFingerprints)){
  assert.equal(createHash("sha256").update(await readFile(file)).digest("hex"),digest,"Retained release source no longer matches this trial");
  if(file in receipts[0].sourceFingerprints&&!historicalChanges.has(file))assert.equal(receipts[0].sourceFingerprints[file],digest,"Retained application compatibility changed");
 }
 phase="image-inventory";
 const inventory=docker("image","ls","--no-trunc","--quiet").split("\n").filter(Boolean);
 assert(inventory.every(id=>/^sha256:[a-f0-9]{64}$/.test(id)),"Successful complete Docker image inventory required");
 assert(ids.every(id=>!inventory.includes(id)),"Release images must be absent on this fresh trial host");
 // Register only initially absent, explicitly reviewed IDs before any partial load.
 owned.push(...ids);
 const loaded=[];
 for(let i=0;i<2;i++){
  phase=`package-load-${i}`;
  const r=receipts[i],m=await loadAndRetireMeasuredArchive(directories[i],{buildId:r.buildId,images:r.images,manifestSha256:r.artifact.manifestSha256,archiveSha256:r.artifact.archiveSha256,archiveBytes:r.artifact.archiveBytes},docker);
  loaded.push({buildId:m.buildId,...Object.fromEntries(m.images.map(x=>[x.role,x.id]))});
 }
 return {packages:loaded,origins:receipts.map(r=>({runId:r.executionEvidence.runId,manifestSha256:r.artifact.manifestSha256,archiveSha256:r.artifact.archiveSha256,archiveBytes:r.artifact.archiveBytes}))};
 }catch(error){
  const diagnostic=error?.stderr?.toString()||"";
  const storage=/no space left on device|ENOSPC/i.test(diagnostic);
  console.error(`Package release input refused at ${phase}${storage?" with storage exhaustion":""}; no raw artifact or Docker error printed.`);
  throw error;
 }
}
