// Validate private GitHub retention evidence before retrieval. No signing claim.
import assert from "node:assert/strict";
export function verifyArtifactRequest(request,run,artifact,now=Date.now()){
 assert.deepEqual(Object.keys(request).sort(),["archiveSha256","artifactId","manifestSha256","runId","workflowCommit"].sort());
 for(const key of ["runId","artifactId"])assert(Number.isSafeInteger(request[key])&&request[key]>0);
 assert(/^[a-f0-9]{40}$/.test(request.workflowCommit));
 for(const key of ["manifestSha256","archiveSha256"])assert(/^[a-f0-9]{64}$/.test(request[key]));
 assert.equal(run.id,request.runId);assert.equal(run.status,"completed");assert.equal(run.conclusion,"success");assert.equal(run.head_sha,request.workflowCommit);
 assert.equal(run.head_branch,"codex/looplabs-platform-integration");assert.equal(run.event,"push");
 assert.equal(run.head_repository?.full_name,"rnagulapalle/sandbox");assert.equal(run.path,".github/workflows/looplabs-platform-proof.yml");
 assert.equal(artifact.id,request.artifactId);assert.equal(artifact.name,`looplabs-tested-images-${request.runId}`);assert.equal(artifact.expired,false);
 assert(Number.isSafeInteger(artifact.size_in_bytes)&&artifact.size_in_bytes>0&&artifact.size_in_bytes<=8*1024**3+65536);
 assert(Number.isFinite(Date.parse(artifact.expires_at))&&Date.parse(artifact.expires_at)>now);
 assert.equal(artifact.workflow_run?.id,request.runId);assert.equal(artifact.workflow_run?.head_sha,request.workflowCommit);
 return {runId:request.runId,artifactId:request.artifactId,manifestSha256:request.manifestSha256,archiveSha256:request.archiveSha256};
}
