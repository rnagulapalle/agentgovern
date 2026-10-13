// CI-only candidate test inputs. API observations are never supplied by the archive.
import assert from "node:assert/strict";
import {readFile,lstat} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {resolve,isAbsolute} from "node:path";
import {typedSourceFiles} from "./staging-browser-record.mjs";
import {verifyComponentArtifactRequest} from "./staging-component-artifact.mjs";
import {loadCandidatePackageInputs} from "./staging-candidate-package-inputs.mjs";

export async function observeCandidatePackageOrigins(requests,readMetadata,now=Date.now()){
 assert(Array.isArray(requests)&&requests.length===2);
 for(const entry of requests){
  assert.deepEqual(Object.keys(entry).sort(),["directory","request"]);
  assert(typeof entry.directory==="string"&&isAbsolute(entry.directory)&&resolve(entry.directory)===entry.directory);
  assert.deepEqual(Object.keys(entry.request).sort(),["archiveSha256","artifactId","manifestSha256","overlaySha256","publicBaseCommit","receiptSha256","runId","workflowCommit"].sort());
  for(const key of ["runId","artifactId"])assert(Number.isSafeInteger(entry.request[key])&&entry.request[key]>0);
  for(const key of ["publicBaseCommit","workflowCommit"])assert(/^[a-f0-9]{40}$/.test(entry.request[key]));
  for(const key of ["archiveSha256","manifestSha256","overlaySha256","receiptSha256"])assert(/^[a-f0-9]{64}$/.test(entry.request[key]));
 }
 assert.notEqual(requests[0].directory,requests[1].directory);
 assert.notEqual(requests[0].request.runId,requests[1].request.runId);
 const entries=[];
 for(const entry of requests){
  const prefix="repos/rnagulapalle/sandbox/actions",id=entry.request.runId;
  const run=await readMetadata(`${prefix}/runs/${id}`);
  const jobs=await readMetadata(`${prefix}/runs/${id}/jobs?per_page=100`);
  assert(Array.isArray(jobs.jobs)&&Number.isSafeInteger(jobs.total_count)&&jobs.total_count===jobs.jobs.length&&jobs.total_count<=100,"Complete bounded job inventory required");
  const matching=jobs.jobs.filter(job=>job.name==="assembled-platform");assert.equal(matching.length,1);
  const job=matching[0],artifact=await readMetadata(`${prefix}/artifacts/${entry.request.artifactId}`);
  verifyComponentArtifactRequest(entry.request,run,job,artifact,now);
  entries.push({...entry,run,job,artifact});
 }
 return entries;
}

export async function resolveCandidatePackageEntries(requests,readMetadata,readReceipt,now=Date.now()){
 const origins=await observeCandidatePackageOrigins(requests,readMetadata,now);
 const entries=[];
 for(const origin of origins){
  const receiptBytes=await readReceipt(resolve(origin.directory,"staging-platform-browser-proof.json"));
  entries.push({...origin,receiptBytes});
 }
 return entries;
}

export async function readPrivateCandidateInput(path,limit){
 assert(typeof path==="string"&&isAbsolute(path)&&resolve(path)===path);
 const before=await lstat(path);
 assert(before.isFile()&&!before.isSymbolicLink()&&before.uid===process.getuid()&&(before.mode&0o077)===0&&before.size>0&&before.size<=limit,"Owned bounded private input required");
 const bytes=await readFile(path),after=await lstat(path);
 for(const key of ["dev","ino","uid","mode","size","mtimeMs","ctimeMs"])assert.equal(after[key],before[key],"Candidate input changed during read");
 assert.equal(bytes.length,before.size);return bytes;
}

export async function loadCandidatePackagesFromFile(path,docker,owned){
 assert(process.platform==="linux"&&process.arch==="x64"&&process.env.GITHUB_ACTIONS==="true"&&process.env.LOOPLABS_STAGING_CANDIDATE_PACKAGE_PROOF==="isolated","Fresh isolated candidate package CI required");
 assert(process.env.LOOPLABS_STAGING_PACKAGE_PROOF==="isolated"&&process.env.LOOPLABS_STAGING_TYPED_PLANNER==="isolated"&&process.env.LOOPLABS_STAGING_BROWSER_PROOF==="isolated"&&!process.env.LOOPLABS_STAGING_IMAGE_ARTIFACT);
 const requests=JSON.parse((await readPrivateCandidateInput(path,65536)).toString("utf8"));
 const entries=await resolveCandidatePackageEntries(requests,endpoint=>{
  try{return JSON.parse(execFileSync("gh",["api",endpoint],{encoding:"utf8",timeout:30000,maxBuffer:2*1024**2,stdio:["ignore","pipe","pipe"]}));}
  catch{throw Error("Authenticated candidate origin observation unavailable; no archive accepted.");}
 },file=>readPrivateCandidateInput(file,2*1024**2));
 const prior=JSON.parse(await readFile("docs/evidence/staging-platform-browser-prepared-proof.json","utf8"));
 const files=typedSourceFiles(prior.sourceFingerprints);
 assert(files.every(file=>typeof file==="string"&&!isAbsolute(file)&&!file.split("/").includes("..")),"Repository-owned source list required");
 const sources=Object.fromEntries(await Promise.all(files.map(async file=>[file,await readFile(file)])));
 const loaded=await loadCandidatePackageInputs({entries,sources,docker,owned});
 return {...loaded,origins:loaded.origins.map((origin,i)=>({...origin,archiveBytes:JSON.parse(entries[i].receiptBytes.toString("utf8")).artifact.archiveBytes}))};
}
