import {test,expect} from "vitest";
import {resolveCandidatePackageEntries,observeCandidatePackageOrigins,loadCandidatePackagesFromFile,readPrivateCandidateInput} from "./staging-candidate-package-files.mjs";
import {componentSteps} from "./staging-component-artifact.mjs";
import {mkdtemp,writeFile,chmod,symlink,rm} from "node:fs/promises";
import {resolve} from "node:path";
import {tmpdir} from "node:os";
function fixture(){
 const requests=[0,1].map(i=>({directory:`/isolated/package-${i}`,request:{runId:123+i,artifactId:456+i,workflowCommit:"a".repeat(40),publicBaseCommit:"b".repeat(40),overlaySha256:"c".repeat(64),manifestSha256:"d".repeat(64),archiveSha256:"e".repeat(64),receiptSha256:"f".repeat(64)}}));
 const observations={};
 for(const entry of requests){
  const r=entry.request,prefix="repos/rnagulapalle/sandbox/actions";
  observations[`${prefix}/runs/${r.runId}`]={id:r.runId,status:"completed",conclusion:"failure",head_sha:r.workflowCommit,head_branch:"codex/looplabs-platform-integration",event:"push",head_repository:{full_name:"rnagulapalle/sandbox"},path:".github/workflows/looplabs-platform-proof.yml"};
  observations[`${prefix}/runs/${r.runId}/jobs?per_page=100`]={total_count:1,jobs:[{run_id:r.runId,head_sha:r.workflowCommit,name:"assembled-platform",status:"completed",conclusion:"failure",steps:Object.values(componentSteps).map((name,i)=>({name,number:i+1,status:"completed",conclusion:name===componentSteps.quality?"failure":"success"}))}]};
  observations[`${prefix}/artifacts/${r.artifactId}`]={id:r.artifactId,name:`looplabs-candidate-platform-images-${r.runId}`,expired:false,size_in_bytes:1000,expires_at:"2030-01-01T00:00:00Z",workflow_run:{id:r.runId,head_sha:r.workflowCommit}};
 }
 const api=[],reads=[];return {requests,observations,api,reads,readMetadata:async path=>{api.push(path);return observations[path];},readReceipt:async path=>{reads.push(path);return Buffer.from("schema fixture only");}};
}
test("origins come from the fixed authenticated API observations before local receipt reads",async()=>{
 const f=fixture(),entries=await resolveCandidatePackageEntries(f.requests,f.readMetadata,f.readReceipt,0);
 expect(entries).toHaveLength(2);expect(f.api).toEqual(Object.keys(f.observations));
 expect(f.reads).toEqual(["/isolated/package-0/staging-platform-browser-proof.json","/isolated/package-1/staging-platform-browser-proof.json"]);
 expect(entries[0].run).toBe(f.observations[f.api[0]]);
});
test("pre-download observation validates both origins without reading receipts; second-origin refusal prevents all reads",async()=>{
 const f=fixture(),origins=await observeCandidatePackageOrigins(f.requests,f.readMetadata,0);
 expect(origins).toHaveLength(2);expect(origins.every(o=>!Object.hasOwn(o,"receiptBytes"))).toBe(true);expect(f.reads).toEqual([]);
 f.observations["repos/rnagulapalle/sandbox/actions/artifacts/457"].expired=true;
 await expect(resolveCandidatePackageEntries(f.requests,f.readMetadata,f.readReceipt,0)).rejects.toThrow();expect(f.reads).toEqual([]);
});
test("malformed identifiers, supplied origin metadata and duplicate origins refuse before any API call",async()=>{
 for(const mutate of [f=>f.requests[1].request.runId="123/other",f=>f.requests[1].request.artifactId=NaN,f=>f.requests[0].run={},f=>f.requests[0].request.releaseAccepted=true,f=>f.requests[1].directory=f.requests[0].directory,f=>f.requests[1].request.runId=f.requests[0].request.runId,f=>f.requests[0].request.overlaySha256="invalid"]){
  const f=fixture();mutate(f);await expect(resolveCandidatePackageEntries(f.requests,f.readMetadata,f.readReceipt,0)).rejects.toThrow();expect(f.api).toEqual([]);expect(f.reads).toEqual([]);
 }
});
test("incomplete job inventories, ambiguous jobs and failed component origins refuse before reading receipts",async()=>{
 for(const mutate of [o=>o.total_count=101,o=>o.total_count=2,o=>o.jobs=[],o=>{o.jobs.push({...o.jobs[0]});o.total_count=2;},o=>o.jobs[0].steps[0].conclusion="failure"]){
  const f=fixture();mutate(f.observations["repos/rnagulapalle/sandbox/actions/runs/123/jobs?per_page=100"]);
  await expect(resolveCandidatePackageEntries(f.requests,f.readMetadata,f.readReceipt,0)).rejects.toThrow();expect(f.reads).toEqual([]);
 }
 const f=fixture();await expect(resolveCandidatePackageEntries(f.requests,async()=>{throw Error("unavailable");},f.readReceipt,0)).rejects.toThrow();expect(f.reads).toEqual([]);
});
test("candidate file loader refuses ordinary local invocation before reading files or invoking Docker",async()=>{
 const old=process.env.LOOPLABS_STAGING_CANDIDATE_PACKAGE_PROOF;delete process.env.LOOPLABS_STAGING_CANDIDATE_PACKAGE_PROOF;let calls=0;
 try{await expect(loadCandidatePackagesFromFile("/missing-private-input",()=>{calls++;},[])).rejects.toThrow("Fresh isolated candidate package CI required");expect(calls).toBe(0);}
 finally{if(old!==undefined)process.env.LOOPLABS_STAGING_CANDIDATE_PACKAGE_PROOF=old;}
});
test("candidate inputs require owned private bounded regular files and refuse symlink substitution",async()=>{
 const root=await mkdtemp(resolve(tmpdir(),"looplabs-candidate-input-")),path=resolve(root,"request.json"),link=resolve(root,"linked.json");
 try{
  await writeFile(path,"synthetic",{mode:0o600});expect(await readPrivateCandidateInput(path,9)).toEqual(Buffer.from("synthetic"));
  await expect(readPrivateCandidateInput(path,8)).rejects.toThrow();
  await chmod(path,0o644);await expect(readPrivateCandidateInput(path,9)).rejects.toThrow();await chmod(path,0o600);
  await symlink(path,link);await expect(readPrivateCandidateInput(link,9)).rejects.toThrow();
  await expect(readPrivateCandidateInput(root,9)).rejects.toThrow();await expect(readPrivateCandidateInput("relative",9)).rejects.toThrow();
  await writeFile(path,"");await expect(readPrivateCandidateInput(path,9)).rejects.toThrow();
 }finally{await rm(root,{recursive:true,force:true});}
});
