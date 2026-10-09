// Image-only retention. Never exports containers, mounted credentials or database volumes.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {mkdir,lstat,chmod,readFile,writeFile,rm} from "node:fs/promises";
import {isAbsolute,resolve} from "node:path";
const roles=["web","worker","twin","provisioner"];
const sha=/^[a-f0-9]{64}$/;
const imageId=/^sha256:[a-f0-9]{64}$/;
export const maxArchiveBytes=8*1024**3;
async function privateDirectory(path){
 assert(isAbsolute(path)&&resolve(path)===path,"Explicit absolute artifact directory required");
 const state=await lstat(path);
 assert(state.isDirectory()&&!state.isSymbolicLink()&&(state.mode&0o077)===0&&state.uid===process.getuid(),"Owned private artifact directory required");
}
async function digest(path,limit){
 const state=await lstat(path);
 assert(state.isFile()&&!state.isSymbolicLink()&&state.size>0&&state.size<=limit,"Bounded regular artifact required");
 const hash=createHash("sha256");let bytes=0;
 for await(const chunk of createReadStream(path)){bytes+=chunk.length;assert(bytes<=limit,"Artifact size limit exceeded");hash.update(chunk);}
 assert.equal(bytes,state.size,"Artifact changed during hashing");
 return {bytes,sha256:hash.digest("hex")};
}
function validateManifest(value){
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
export async function exportTestedImages({directory,images,buildId,docker}){
 await privateDirectory(resolve(directory,".."));
 assert(isAbsolute(directory)&&resolve(directory)===directory);
 assert.deepEqual(Object.keys(images),roles,"Exactly the four built trial roles required");
 const identities=roles.map(role=>({role,id:docker("image","inspect",images[role],"--format","{{.Id}}")}));
 for(const item of identities)assert(imageId.test(item.id));
 // Exclusive destination: never overwrite another trial or release.
 await mkdir(directory,{mode:0o700});
 try{
  const path=resolve(directory,"images.tar");
  // Export the inspected immutable IDs, not mutable tags.
  docker("image","save","--output",path,...identities.map(x=>x.id));
  await chmod(path,0o600);
  const archive=await digest(path,maxArchiveBytes);
  const manifest=validateManifest({version:1,buildId,images:identities,archive:{file:"images.tar",...archive}});
  const encoded=JSON.stringify(manifest,null,2)+"\n";
  await writeFile(resolve(directory,"manifest.json"),encoded,{mode:0o600,flag:"wx"});
  return {manifestSha256:createHash("sha256").update(encoded).digest("hex"),archiveSha256:archive.sha256,archiveBytes:archive.bytes,images:identities};
 }catch(error){await rm(directory,{recursive:true,force:true});throw error;}
}
export async function loadTestedImages({directory,expectedManifestSha256,docker}){
 assert(sha.test(expectedManifestSha256),"Externally retained manifest digest required");
 await privateDirectory(directory);
 const path=resolve(directory,"manifest.json");await digest(path,65536);
 const encoded=await readFile(path);
 assert.equal(createHash("sha256").update(encoded).digest("hex"),expectedManifestSha256,"Manifest digest mismatch");
 const manifest=validateManifest(JSON.parse(encoded.toString("utf8")));
 const archive=await digest(resolve(directory,"images.tar"),maxArchiveBytes);
 assert.equal(archive.sha256,manifest.archive.sha256,"Archive digest mismatch");assert.equal(archive.bytes,manifest.archive.bytes);
 // Docker load adds images only; it must never start a workload or modify volumes.
 docker("image","load","--input",resolve(directory,"images.tar"));
 for(const image of manifest.images)assert.equal(docker("image","inspect",image.id,"--format","{{.Id}}"),image.id,"Loaded image identity mismatch");
 const worker=manifest.images.find(x=>x.role==="worker");
 const build=JSON.parse(docker("run","--rm","--network","none","--read-only","--cap-drop","ALL","--security-opt","no-new-privileges","--memory","128m","--pids-limit","64",worker.id,"node","-e","process.stdout.write(require('fs').readFileSync('.worker/temporal-manifest.json','utf8'))"));
 assert.equal(build.buildId,manifest.buildId,"Loaded worker build mismatch");
 return manifest;
}

export async function reloadAfterTrialRemoval({directory,artifact,docker}){
 const ids=artifact.images.map(x=>x.id);
 assert.equal(ids.length,4);assert.equal(new Set(ids).size,4);assert(ids.every(x=>imageId.test(x)));
 // An inspect RPC failure is not proof of absence. Require a successful inventory.
 const inventory=docker("image","ls","--no-trunc","--quiet").split("\n").filter(Boolean);
 assert(ids.every(id=>!inventory.includes(id)),"Original trial image must be absent before artifact reload proof");
 let loaded;
 try{loaded=await loadTestedImages({directory,expectedManifestSha256:artifact.manifestSha256,docker});}
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
