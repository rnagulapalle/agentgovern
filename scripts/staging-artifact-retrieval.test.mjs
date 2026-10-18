import {test,expect} from "vitest";
import {verifyArtifactRequest} from "./staging-artifact-retrieval.mjs";
const request={runId:123,artifactId:456,workflowCommit:"a".repeat(40),manifestSha256:"b".repeat(64),archiveSha256:"c".repeat(64)};
const run={id:123,status:"completed",conclusion:"success",head_sha:request.workflowCommit,head_branch:"codex/looplabs-platform-integration",event:"push",head_repository:{full_name:"rnagulapalle/sandbox"},path:".github/workflows/looplabs-platform-proof.yml"};
const artifact={id:456,name:"looplabs-tested-images-123",expired:false,size_in_bytes:1000,expires_at:"2030-01-01T00:00:00Z",workflow_run:{id:123,head_sha:request.workflowCommit}};
test("binds retained private artifact to the exact successful reviewed trial and external digests",()=>{expect(verifyArtifactRequest(request,run,artifact,0)).toEqual({runId:123,artifactId:456,manifestSha256:request.manifestSha256,archiveSha256:request.archiveSha256});});
test("missing or malformed request and failed foreign or substituted run refuse",()=>{
 for(const change of [{runId:0},{artifactId:NaN},{workflowCommit:""},{manifestSha256:""},{archiveSha256:""},{secret:"private"}])expect(()=>verifyArtifactRequest({...request,...change},run,artifact,0)).toThrow();
 for(const change of [{id:124},{status:"in_progress"},{conclusion:"failure"},{head_sha:"f".repeat(40)},{head_branch:"main"},{event:"pull_request"},{head_repository:undefined},{head_repository:{full_name:"attacker/sandbox"}},{path:"other.yml"}])expect(()=>verifyArtifactRequest(request,{...run,...change},artifact,0)).toThrow();
});
test("expired unbound malformed and different artifacts refuse despite matching name",()=>{
 for(const change of [{id:457},{name:"other"},{expired:true},{size_in_bytes:0},{size_in_bytes:9*1024**3},{expires_at:"invalid"},{expires_at:"1970-01-01T00:00:00Z"},{workflow_run:undefined},{workflow_run:{id:124,head_sha:request.workflowCommit}},{workflow_run:{id:123,head_sha:"f".repeat(40)}}])expect(()=>verifyArtifactRequest(request,run,{...artifact,...change},1)).toThrow();
});
