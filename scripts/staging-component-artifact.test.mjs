import {test,expect} from "vitest";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {componentSteps,verifyComponentArtifactRequest,verifyComponentReceipt} from "./staging-component-artifact.mjs";
import {verifyArtifactRequest} from "./staging-artifact-retrieval.mjs";
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
function fixture(){
 // Schema fixture only; copying these values is not new execution evidence.
 const receipt=JSON.parse(readFileSync("docs/evidence/staging-platform-browser-proof.json","utf8"));
 const sources={"approved-runtime.ts":"synthetic reviewed source"};
 const request={runId:123,artifactId:456,workflowCommit:"a".repeat(40),publicBaseCommit:"b".repeat(40),overlaySha256:"c".repeat(64),manifestSha256:receipt.artifact.manifestSha256,archiveSha256:receipt.artifact.archiveSha256,receiptSha256:""};
 receipt.sourceFingerprints=Object.fromEntries(Object.entries(sources).map(([f,bytes])=>[f,hash(bytes)]));
 expect(receipt.sourceCommit).toBe("08372aadbaa6fb8f37368c6900323b8619c10f2c");
 receipt.executionEvidence={...receipt.executionEvidence,runId:123,privateWorkflowCommit:request.workflowCommit,publicBaseCommit:request.publicBaseCommit,exactCompressedOverlaySha256:request.overlaySha256,runUrl:"https://github.com/rnagulapalle/sandbox/actions/runs/123"};
 const encoded=Buffer.from(JSON.stringify(receipt));request.receiptSha256=hash(encoded);
 const run={id:123,status:"completed",conclusion:"failure",head_sha:request.workflowCommit,head_branch:"codex/looplabs-platform-integration",event:"push",head_repository:{full_name:"rnagulapalle/sandbox"},path:".github/workflows/looplabs-platform-proof.yml"};
 const job={run_id:123,head_sha:request.workflowCommit,name:"assembled-platform",status:"completed",conclusion:"failure",steps:Object.values(componentSteps).map((name,i)=>({name,number:i+1,status:"completed",conclusion:name===componentSteps.quality?"failure":"success"}))};
 const artifact={id:456,name:"looplabs-candidate-platform-images-123",expired:false,size_in_bytes:1000,expires_at:"2030-01-01T00:00:00Z",workflow_run:{id:123,head_sha:request.workflowCommit}};
 return {request,run,job,artifact,receipt,encoded,sources};
}
test("a completed component may supply isolated test inputs while quality fails, but cannot authorize release",()=>{
 const f=fixture(),origin=verifyComponentArtifactRequest(f.request,f.run,f.job,f.artifact,0);
 expect(origin).toMatchObject({purpose:"isolated-staging-proof-input",qualityPassed:false,releaseAccepted:false});
 expect(verifyComponentReceipt(f.encoded,origin,f.sources)).toEqual(f.receipt);
 const {receiptSha256,overlaySha256,publicBaseCommit,...releaseRequest}=f.request;expect([receiptSha256,overlaySha256,publicBaseCommit]).toHaveLength(3);
 expect(()=>verifyArtifactRequest(releaseRequest,f.run,{...f.artifact,name:"looplabs-tested-images-123"},0)).toThrow();
 f.run.conclusion=f.job.conclusion="success";f.job.steps.find(s=>s.name===componentSteps.quality).conclusion="success";
 expect(verifyComponentArtifactRequest(f.request,f.run,f.job,f.artifact,0)).toMatchObject({qualityPassed:true,releaseAccepted:false});
});
test("unfinished trials, substituted origins and expired or mislabeled archives refuse",()=>{
 const f=fixture(),verify=(r=f.run,j=f.job,a=f.artifact,q=f.request)=>verifyComponentArtifactRequest(q,r,j,a,0);
 for(const change of [{id:124},{status:"in_progress"},{conclusion:"cancelled"},{conclusion:"timed_out"},{head_sha:"f".repeat(40)},{head_branch:"main"},{event:"pull_request"},{head_repository:{full_name:"attacker/sandbox"}},{path:"other.yml"}])expect(()=>verify({...f.run,...change})).toThrow();
 for(const change of [{run_id:124},{head_sha:"f".repeat(40)},{name:"other"},{status:"in_progress"},{conclusion:"success"}])expect(()=>verify(f.run,{...f.job,...change})).toThrow();
 for(const change of [{id:0},{name:"looplabs-tested-images-123"},{expired:true},{size_in_bytes:0},{size_in_bytes:9*1024**3},{expires_at:"invalid"},{expires_at:"1970-01-01T00:00:00Z"},{workflow_run:{id:124,head_sha:f.request.workflowCommit}},{workflow_run:{id:123,head_sha:"f".repeat(40)}}])expect(()=>verify(f.run,f.job,{...f.artifact,...change})).toThrow();
 for(const change of [{runId:NaN},{artifactId:0},{workflowCommit:""},{publicBaseCommit:""},{overlaySha256:""},{receiptSha256:""},{manifestSha256:""},{archiveSha256:""},{releaseAccepted:true}])expect(()=>verify(f.run,f.job,f.artifact,{...f.request,...change})).toThrow();
});
test("every critical stage must succeed in order and unrelated failures cannot hide behind quality failure",()=>{
 for(const name of Object.values(componentSteps))for(const mode of ["absent","duplicate","unfinished","wrong-order","failed"]){
  if(name===componentSteps.quality&&mode==="failed")continue;
  const f=fixture(),step=f.job.steps.find(s=>s.name===name);
  if(mode==="absent")f.job.steps=f.job.steps.filter(s=>s!==step);
  if(mode==="duplicate")f.job.steps.push({...step});
  if(mode==="unfinished")step.status="in_progress";
  if(mode==="wrong-order")step.number=1;
  if(mode==="failed")step.conclusion="failure";
  if(name===componentSteps.trial&&mode==="wrong-order")step.number=100;
  expect(()=>verifyComponentArtifactRequest(f.request,f.run,f.job,f.artifact,0),`${name}: ${mode}`).toThrow();
 }
 for(const conclusion of ["failure","cancelled","timed_out","neutral"]){
  const f=fixture();f.job.steps.push({name:"Unrelated check",number:6,status:"completed",conclusion});
  expect(()=>verifyComponentArtifactRequest(f.request,f.run,f.job,f.artifact,0)).toThrow();
 }
});
test("receipt byte substitution, missing or changed sources and altered execution claims refuse",()=>{
 const f=fixture(),origin=verifyComponentArtifactRequest(f.request,f.run,f.job,f.artifact,0);
 for(const bytes of [Buffer.alloc(0),Buffer.alloc(2*1024**2+1),Buffer.from("{}"),Buffer.concat([f.encoded,Buffer.from(" ")])])expect(()=>verifyComponentReceipt(bytes,origin,f.sources)).toThrow("receipt refused");
 for(const sources of [{},{...f.sources,"unmeasured.ts":"extra"},{"approved-runtime.ts":"changed"}])expect(()=>verifyComponentReceipt(f.encoded,origin,sources)).toThrow("receipt refused");
 expect(()=>verifyComponentReceipt(f.encoded,{...origin,releaseAccepted:true},f.sources)).toThrow();
 for(const mutate of [r=>r.sourceCommit="f".repeat(40),r=>r.sourceCommit=origin.publicBaseCommit,r=>r.executionEvidence.productionChanged=true,r=>r.executionEvidence.privateWorkflowCommit="f".repeat(40),r=>r.browser.planning.typedRequest=false,r=>r.actualProviderEffects=0,r=>r.artifact.reloadedAfterRemoval=false,r=>r.artifact.archiveSha256="f".repeat(64)]){
  const receipt=structuredClone(f.receipt);mutate(receipt);const bytes=Buffer.from(JSON.stringify(receipt));
  expect(()=>verifyComponentReceipt(bytes,{...origin,receiptSha256:hash(bytes)},f.sources)).toThrow("receipt refused");
 }
});
