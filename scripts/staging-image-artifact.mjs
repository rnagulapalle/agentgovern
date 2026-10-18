// Image-only retention. Never exports containers, mounted credentials or database volumes.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {constants,createReadStream} from "node:fs";
import {mkdir,lstat,chmod,readFile,writeFile,rm,open,realpath} from "node:fs/promises";
import {isAbsolute,resolve,dirname} from "node:path";
import {inspectedWorkerArtifact} from "./worker-artifact-enrollment.mjs";
export const imageRoles2=Object.freeze(["web","worker","twin","quoteEmail","provisioner","quote"]);
const roles=["web","worker","twin","provisioner"];
const sha=/^[a-f0-9]{64}$/;
const imageId=/^sha256:[a-f0-9]{64}$/;
// Export is image-only bounded CI retention, never installed acceptance.
export function installedArtifactDestination2(directory,runner){
 if(directory===undefined)return undefined;
 assert.deepEqual(runner,{mode:'github-actions',ci:true,releaseAccepted:false},'Dedicated diagnostics cannot export an accepted-origin artifact');
 assert(typeof directory==='string'&&isAbsolute(directory)&&resolve(directory)===directory&&!directory.split('/').includes('..'),'Canonical private CI artifact destination required');
 return directory;
}
export const maxArchiveBytes=8*1024**3;
async function privateDirectory(path){
 assert(isAbsolute(path)&&resolve(path)===path,"Explicit absolute artifact directory required");
 const state=await lstat(path);
 assert(state.isDirectory()&&!state.isSymbolicLink()&&(state.mode&0o077)===0&&state.uid===process.getuid(),"Owned private artifact directory required");
}
/** Streaming owned archive validator. Archive bounds are distinct from the
 * 1 MiB credential/publication reader; no archive bytes enter an audit receipt. */
export async function digestOwnedPrivateArchive(path,limit=maxArchiveBytes){
 assert(Number.isSafeInteger(limit)&&limit>0&&limit<=maxArchiveBytes,"Bounded archive limit required");
 assert(isAbsolute(path)&&resolve(path)===path,"Canonical archive path required");
 const parent=dirname(path);await privateDirectory(parent);assert.equal(await realpath(path),path,"Archive path cannot traverse symlinks");
 const before=await lstat(path),uid=process.getuid();
 const regular=s=>s.isFile()&&!s.isSymbolicLink()&&s.uid===uid&&s.nlink===1&&(s.mode&0o7777)===0o600&&s.size>0&&s.size<=limit;
 const same=(a,b)=>["dev","ino","uid","mode","nlink","size","mtimeMs","ctimeMs"].every(k=>a[k]===b[k]);
 assert(regular(before),"Owned bounded regular archive required");
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const state=await handle.stat();assert(regular(state)&&same(state,before),"Archive changed before hashing");
  const hash=createHash("sha256");let bytes=0;let header=Buffer.alloc(0);
  for await(const chunk of handle.createReadStream({autoClose:false})){bytes+=chunk.length;assert(bytes<=limit,"Archive size limit exceeded");if(header.length<5)header=Buffer.concat([header,chunk]).subarray(0,5);hash.update(chunk);}
  assert.equal(bytes,state.size,"Archive changed during hashing");assert(same(state,await handle.stat()),"Archive changed during hashing");
  const assertStable=async()=>{await privateDirectory(parent);assert.equal(await realpath(path),path);assert(same(state,await lstat(path)),"Archive changed after hashing");};
  await assertStable();return {bytes,sha256:hash.digest("hex"),header:header.toString("ascii"),assertStable};
 }finally{await handle.close();}
}
async function digest(path,limit){
 const state=await lstat(path);
 assert(state.isFile()&&!state.isSymbolicLink()&&state.size>0&&state.size<=limit,"Bounded regular artifact required");
 const hash=createHash("sha256");let bytes=0;
 for await(const chunk of createReadStream(path)){bytes+=chunk.length;assert(bytes<=limit,"Artifact size limit exceeded");hash.update(chunk);}
 assert.equal(bytes,state.size,"Artifact changed during hashing");return {bytes,sha256:hash.digest("hex")};
}

function validateManifest(value,version=1){
 if(version===2)return validateImageManifest2(value);
 assert.deepEqual(Object.keys(value).sort(),["archive","buildId","images","version"]);
 assert.equal(value.version,1);assert(typeof value.buildId==="string"&&value.buildId.length>0&&value.buildId.length<=256);
 assert.deepEqual(Object.keys(value.archive).sort(),["bytes","file","sha256"]);
 assert.equal(value.archive.file,"images.tar");assert(sha.test(value.archive.sha256));
 assert(Number.isSafeInteger(value.archive.bytes)&&value.archive.bytes>0&&value.archive.bytes<=maxArchiveBytes);
 assert.equal(value.images.length,4);
 assert.deepEqual(value.images.map(x=>x.role),roles);
 for(const image of value.images){assert.deepEqual(Object.keys(image).sort(),["id","role"]);assert(imageId.test(image.id));}
 assert.equal(new Set(value.images.map(x=>x.id)).size,4);
 return value;
}
export function validateImageManifest2(value){
 assert.deepEqual(Object.keys(value).sort(),['archive','images','version','workers']);assert.equal(value.version,2);
 assert.deepEqual(value.images.map(x=>x.role),imageRoles2);assert.equal(new Set(value.images.map(x=>x.id)).size,6);
 for(const image of value.images){assert.deepEqual(Object.keys(image).sort(),['id','role']);assert(imageId.test(image.id));}
 assert.deepEqual(Object.keys(value.archive).sort(),['bytes','file','sha256']);assert.equal(value.archive.file,'images.tar');assert(sha.test(value.archive.sha256));assert(Number.isSafeInteger(value.archive.bytes)&&value.archive.bytes>0&&value.archive.bytes<=maxArchiveBytes);
 assert.deepEqual(Object.keys(value.workers).sort(),['ack','quote']);for(const profile of ['ack','quote']){const worker=value.workers[profile];assert.deepEqual(Object.keys(worker).sort(),['buildId','imageId','lockHash','serviceHash','workflowHash']);assert(new RegExp('^'+profile+'-[a-f0-9]{64}$').test(worker.buildId));assert.equal(worker.imageId,value.images.find(x=>x.role===(profile==='ack'?'worker':'quote')).id);for(const key of ['serviceHash','workflowHash','lockHash'])assert(sha.test(worker[key]));}
 return value;
}
export async function exportTestedImages2({directory,images,docker}){
 assert.deepEqual(Object.keys(images),imageRoles2,'Exactly six current built roles required');
 return exportImages({directory,images,docker,version:2});
}
export async function exportTestedImages({directory,images,buildId,docker}){return exportImages({directory,images,buildId,docker,version:1});}
async function exportImages({directory,images,buildId,docker,version}){
 const selectedRoles=version===2?imageRoles2:roles;
 await privateDirectory(resolve(directory,".."));
 assert(isAbsolute(directory)&&resolve(directory)===directory);
 assert.deepEqual(Object.keys(images),selectedRoles,"Exact built trial roles required");
 const identities=selectedRoles.map(role=>({role,id:docker("image","inspect",images[role],"--format","{{.Id}}")}));
 for(const item of identities)assert(imageId.test(item.id));
 // Exclusive destination: never overwrite another trial or release.
 await mkdir(directory,{mode:0o700});
 try{
  const path=resolve(directory,"images.tar");
  // Export the inspected immutable IDs, not mutable tags.
  docker("image","save","--output",path,...identities.map(x=>x.id));
  await chmod(path,0o600);
  const ownedArchive=version===2?await digestOwnedPrivateArchive(path):null;
  const archive=ownedArchive?{bytes:ownedArchive.bytes,sha256:ownedArchive.sha256}:await digest(path,maxArchiveBytes);
  const workers=version===2?{}:undefined;
  if(workers)for(const profile of ['ack','quote'])workers[profile]=await inspectedWorkerArtifact(identities.find(i=>i.role===(profile==='ack'?'worker':'quote')).id,docker,profile);

  const manifest=validateManifest({version,...(version===2?{workers}:{buildId}),images:identities,archive:{file:"images.tar",...archive}},version);
  const encoded=JSON.stringify(manifest,null,2)+"\n";
  await writeFile(resolve(directory,"manifest.json"),encoded,{mode:0o600,flag:"wx"});
  return {...(version===2?{version:2,workers}:{}),manifestSha256:createHash("sha256").update(encoded).digest("hex"),archiveSha256:archive.sha256,archiveBytes:archive.bytes,images:identities};
 }catch(error){await rm(directory,{recursive:true,force:true});throw error;}
}
export async function loadTestedImages(input){return loadImages({...input,version:1});}
export async function loadTestedImages2(input){return loadImages({...input,version:2});}
async function loadImages({directory,expectedManifestSha256,docker,version}){
 assert(sha.test(expectedManifestSha256),"Externally retained manifest digest required");
 await privateDirectory(directory);
 const path=resolve(directory,"manifest.json");await digest(path,65536);
 const encoded=await readFile(path);
 assert.equal(createHash("sha256").update(encoded).digest("hex"),expectedManifestSha256,"Manifest digest mismatch");
 const manifest=validateManifest(JSON.parse(encoded.toString("utf8")),version);
 const ownedArchive=version===2?await digestOwnedPrivateArchive(resolve(directory,"images.tar")):null;
 const archive=ownedArchive?{bytes:ownedArchive.bytes,sha256:ownedArchive.sha256}:await digest(resolve(directory,"images.tar"),maxArchiveBytes);
 assert.equal(archive.sha256,manifest.archive.sha256,"Archive digest mismatch");assert.equal(archive.bytes,manifest.archive.bytes);
 // Docker load adds images only; it must never start a workload or modify volumes.
 if(ownedArchive)await ownedArchive.assertStable();
 docker("image","load","--input",resolve(directory,"images.tar"));
 for(const image of manifest.images)assert.equal(docker("image","inspect",image.id,"--format","{{.Id}}"),image.id,"Loaded image identity mismatch");
 if(version===2){for(const profile of ['ack','quote'])assert.deepEqual(await inspectedWorkerArtifact(manifest.workers[profile].imageId,docker,profile),manifest.workers[profile],'Loaded pinned worker bytes changed');}
 else{
 const worker=manifest.images.find(x=>x.role==="worker");
 const build=JSON.parse(docker("run","--rm","--network","none","--read-only","--cap-drop","ALL","--security-opt","no-new-privileges","--memory","128m","--pids-limit","64",worker.id,"node","-e","process.stdout.write(require('fs').readFileSync('.worker/temporal-manifest.json','utf8'))"));
 assert.equal(build.buildId,manifest.buildId,"Loaded worker build mismatch");
 }
 return manifest;
}

export async function reloadAfterTrialRemoval(input){return reloadImages({...input,version:1});}
export async function reloadAfterTrialRemoval2(input){return reloadImages({...input,version:2});}
async function reloadImages({directory,artifact,docker,version}){
 if(version===2){assert.deepEqual(Object.keys(artifact).sort(),["version","workers","manifestSha256","archiveSha256","archiveBytes","images"].sort());assert.equal(artifact.version,2);await privateDirectory(directory);const path=resolve(directory,"manifest.json");await digest(path,65536);const bytes=await readFile(path);assert.equal(createHash("sha256").update(bytes).digest("hex"),artifact.manifestSha256);const manifest=validateImageManifest2(JSON.parse(bytes));assert.deepEqual(manifest.images,artifact.images);assert.deepEqual(manifest.workers,artifact.workers);assert.equal(manifest.archive.sha256,artifact.archiveSha256);assert.equal(manifest.archive.bytes,artifact.archiveBytes);}
 const ids=artifact.images.map(x=>x.id);
 const count=version===2?6:4;assert.equal(ids.length,count);assert.equal(new Set(ids).size,count);assert(ids.every(x=>imageId.test(x)));
 // An inspect RPC failure is not proof of absence. Require a successful inventory.
 const inventory=docker("image","ls","--no-trunc","--quiet").split("\n").filter(Boolean);
 assert(ids.every(id=>!inventory.includes(id)),"Original trial image must be absent before artifact reload proof");
 let loaded;
 try{loaded=await loadImages({directory,expectedManifestSha256:artifact.manifestSha256,docker,version});}
 finally{
  // Even a partial load or worker-manifest refusal must clean only the IDs which
  // were explicitly absent before this isolated reload. Never force or prune.
  const present=docker("image","ls","--no-trunc","--quiet").split("\n").filter(Boolean);
  for(const id of ids)if(present.includes(id))docker("image","rm",id);
  const retained=docker("image","ls","--no-trunc","--quiet").split("\n").filter(Boolean);
  assert(ids.every(id=>!retained.includes(id)),"Loaded validation images must be removed");
 }
 return loaded;
}
