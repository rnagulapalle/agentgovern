// Inspect an immutable image without running it; enroll only the extracted bytes.
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm,lstat,chmod} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {randomBytes,createHash} from "node:crypto";
export function workerArtifactProfile(profile="ack"){
 assert(["ack","quote"].includes(profile),"Explicit supported worker profile required");
 return {profile,prefix:profile==="quote"?"quote-temporal":"temporal"};
}
export function profileArtifactBytes(profile,manifest,service,workflow,lock){
 workerArtifactProfile(profile);
 assert.deepEqual(Object.keys(manifest).sort(),["artifactHash","buildId","version"]);
 for(const bytes of [service,workflow,lock])assert(Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=64*1024**2,"Bounded artifact bytes required");
 const digest=bytes=>createHash("sha256").update(bytes).digest("hex");
 const hash=createHash("sha256").update(service).update(workflow).update(lock).digest("hex");
 assert.equal(manifest.version,1);assert.equal(manifest.artifactHash,hash);assert.equal(manifest.buildId,`${profile}-${hash}`,"Mixed worker profile or compiled bytes");
 return {buildId:manifest.buildId,serviceHash:digest(service),workflowHash:digest(workflow),lockHash:digest(lock)};
}
async function profileArtifact(directory,profile){
 const {prefix}=workerArtifactProfile(profile);
 const [manifest,service,workflow,lock]=await Promise.all([
  readFile(resolve(directory,`${prefix}-manifest.json`),"utf8"),readFile(resolve(directory,`${prefix}-service.cjs`)),
  readFile(resolve(directory,`${prefix}-workflow.cjs`)),readFile(resolve(directory,"pnpm-lock.yaml"))]);
 return profileArtifactBytes(profile,JSON.parse(manifest),service,workflow,lock);
}
export async function inspectedWorkerArtifact(imageId,docker,profile="ack"){
 return withInspectedWorkerArtifact(imageId,docker,profile,async artifact=>artifact);
}
// Source-owned producer can consume the genuine extracted bytes while the exact
// non-running, labeled image container is still independently verified. The
// callback does not mint authority; enrollment continues to hash raw bytes.
export async function withInspectedWorkerArtifact(imageId,docker,profile,consume){
 assert.equal(typeof consume,"function");
 const {prefix}=workerArtifactProfile(profile);
 assert(typeof imageId==="string"&&/^sha256:[a-f0-9]{64}$/.test(imageId));
 assert.equal(typeof docker,"function");
 const name=`ll-artifact-${randomBytes(12).toString("hex")}`,owner=randomBytes(24).toString("hex");
 const dir=await mkdtemp(resolve(tmpdir(),"ll-artifact-"));await chmod(dir,0o700);
 let created=false;
 try{
  const image=JSON.parse(docker("image","inspect",imageId))[0];
  assert.equal(image.Id,imageId);assert.equal(image.Os,"linux");assert.equal(image.Architecture,"amd64");
  assert.equal(Object.keys(image.Config?.Volumes||{}).length,0,"Unexpected anonymous image volumes refuse before creation");
  docker("create","--name",name,"--label",`looplabs.artifact.owner=${owner}`,"--network","none","--memory","134217728","--pids-limit","64","--read-only","--cap-drop","ALL","--security-opt","no-new-privileges",imageId,"node","-e","process.exit(0)");created=true;
  const container=JSON.parse(docker("inspect",name))[0];
  assert.equal(container.Image,imageId);assert.equal(container.Config.Labels?.["looplabs.artifact.owner"],owner);assert.equal(container.State.Running,false);
  for(const [from,to] of [[`/app/.worker/${prefix}-manifest.json`,`${prefix}-manifest.json`],[`/app/.worker/${prefix}-service.cjs`,`${prefix}-service.cjs`],[`/app/.worker/${prefix}-workflow.cjs`,`${prefix}-workflow.cjs`],["/app/pnpm-lock.yaml","pnpm-lock.yaml"]]){
   const path=resolve(dir,to);docker("cp",`${name}:${from}`,path);
   const stat=await lstat(path);assert(stat.isFile()&&!stat.isSymbolicLink());assert(stat.size>0&&stat.size<=64*1024**2);await chmod(path,0o600);
  }
  const {buildId,serviceHash,workflowHash,lockHash}=await profileArtifact(dir,profile);
  const artifact={buildId,imageId,serviceHash,workflowHash,lockHash};
  const inspected=JSON.parse(docker("inspect",name))[0];assert.equal(inspected.Image,imageId);assert.equal(inspected.Config.Labels?.["looplabs.artifact.owner"],owner);assert.equal(inspected.State.Running,false);
  return await consume(artifact,dir);
 }finally{
  try{if(created){const c=JSON.parse(docker("inspect",name))[0];assert.equal(c.Config.Labels?.["looplabs.artifact.owner"],owner);assert.equal(c.State.Running,false);docker("rm",name);}}
  finally{await rm(dir,{recursive:true,force:true});}
 }
}
export async function enrollInspectedWorker(db,imageId,docker,profile="ack"){
 // Deliberately no API taking caller-supplied artifact metadata.
 return saveEnrollment(db,await inspectedWorkerArtifact(imageId,docker,profile));
}
// Private isolated provisioner only: host has already inspected the immutable image.
export async function enrollExtractedWorker(db,imageId,directory,profile="ack"){
 workerArtifactProfile(profile);
 assert.equal(process.env.LOOPLABS_STAGING_DRAIN_PROOF,"isolated");
 assert(/^sha256:[a-f0-9]{64}$/.test(imageId));
 const {buildId,serviceHash,workflowHash,lockHash}=await profileArtifact(directory,profile);
 return saveEnrollment(db,{buildId,imageId,serviceHash,workflowHash,lockHash});
}
async function saveEnrollment(db,artifact){
 const client=await db.connect();
 try{
  await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(68391204)");
  const ownership=(await client.query("SELECT pg_get_userbyid(relowner)=current_user AS owned FROM pg_class WHERE oid=to_regclass('ll_temporal_worker_builds')")).rows;
  assert(ownership.length===1&&ownership[0].owned===true,"Registry owner connection required");
  const digest=createHash("sha256").update(await readFile("lib/enquiries/worker-admission-schema.sql")).digest("hex");
  const applied=(await client.query("SELECT digest FROM ll_migrations WHERE version=14")).rows;
  assert(applied.length===1&&applied[0].digest===digest,"Exact admission migration required");
  await client.query("INSERT INTO ll_temporal_worker_builds(worker_build_id,image_id,service_sha256,workflow_sha256,lock_sha256) VALUES($1,$2,$3,$4,$5) ON CONFLICT(worker_build_id) DO NOTHING",[artifact.buildId,artifact.imageId,artifact.serviceHash,artifact.workflowHash,artifact.lockHash]);
  const saved=(await client.query("SELECT worker_build_id,image_id,service_sha256,workflow_sha256,lock_sha256,state FROM ll_temporal_worker_builds WHERE worker_build_id=$1 FOR UPDATE",[artifact.buildId])).rows[0];
  assert.deepEqual(saved,{worker_build_id:artifact.buildId,image_id:artifact.imageId,service_sha256:artifact.serviceHash,workflow_sha256:artifact.workflowHash,lock_sha256:artifact.lockHash,state:"active"},"Enrollment conflict or draining build cannot reactivate");
  await client.query("COMMIT");return artifact;
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
