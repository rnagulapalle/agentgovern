// Inspect an immutable image without running it; enroll only the extracted bytes.
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm,lstat,chmod} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {randomBytes,createHash} from "node:crypto";
import {semanticArtifact} from "./temporal-semantic-replay.mjs";
export async function inspectedWorkerArtifact(imageId,docker){
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
  for(const [from,to] of [["/app/.worker/temporal-manifest.json","temporal-manifest.json"],["/app/.worker/temporal-service.cjs","temporal-service.cjs"],["/app/.worker/temporal-workflow.cjs","temporal-workflow.cjs"],["/app/pnpm-lock.yaml","pnpm-lock.yaml"]]){
   const path=resolve(dir,to);docker("cp",`${name}:${from}`,path);
   const stat=await lstat(path);assert(stat.isFile()&&!stat.isSymbolicLink());assert(stat.size>0&&stat.size<=64*1024**2);await chmod(path,0o600);
  }
  const {buildId,serviceHash,workflowHash,lockHash}=await semanticArtifact(dir);
  return {buildId,imageId,serviceHash,workflowHash,lockHash};
 }finally{
  try{if(created){const c=JSON.parse(docker("inspect",name))[0];assert.equal(c.Config.Labels?.["looplabs.artifact.owner"],owner);assert.equal(c.State.Running,false);docker("rm",name);}}
  finally{await rm(dir,{recursive:true,force:true});}
 }
}
export async function enrollInspectedWorker(db,imageId,docker){
 // Deliberately no API taking caller-supplied artifact metadata.
 return saveEnrollment(db,await inspectedWorkerArtifact(imageId,docker));
}
// Private isolated provisioner only: host has already inspected the immutable image.
export async function enrollExtractedWorker(db,imageId,directory){
 assert.equal(process.env.LOOPLABS_STAGING_DRAIN_PROOF,"isolated");
 assert(/^sha256:[a-f0-9]{64}$/.test(imageId));
 const {buildId,serviceHash,workflowHash,lockHash}=await semanticArtifact(directory);
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
