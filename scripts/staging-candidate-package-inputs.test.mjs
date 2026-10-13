import {test,expect} from "vitest";
import {readFileSync} from "node:fs";
import {mkdtemp,writeFile,readFile,access,rm} from "node:fs/promises";
import {resolve} from "node:path";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";
import {componentSteps} from "./staging-component-artifact.mjs";
import {loadCandidatePackageInputs} from "./staging-candidate-package-inputs.mjs";
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
async function fixture(){
 const root=await mkdtemp(resolve(tmpdir(),"looplabs-component-package-test-")),sources={"approved-runtime.ts":"synthetic reviewed source"};
 const entries=[],mutations=[],loaded=new Set(),owned=[];
 for(let i=0;i<2;i++){
  const directory=await mkdtemp(resolve(root,"package-")),receipt=JSON.parse(readFileSync("docs/evidence/staging-platform-browser-proof.json","utf8"));
  const images=["web","worker","twin","provisioner"].map((role,n)=>({role,id:`sha256:${String(i*4+n+1).repeat(64)}`}));
  const archive=Buffer.from(`synthetic archive ${i}`),manifest={version:1,buildId:receipt.buildId,images,archive:{file:"images.tar",bytes:archive.length,sha256:hash(archive)}};
  const manifestBytes=Buffer.from(JSON.stringify(manifest));await writeFile(resolve(directory,"images.tar"),archive);await writeFile(resolve(directory,"manifest.json"),manifestBytes);
  const request={runId:123+i,artifactId:456+i,workflowCommit:"a".repeat(40),publicBaseCommit:"b".repeat(40),overlaySha256:"c".repeat(64),manifestSha256:hash(manifestBytes),archiveSha256:hash(archive),receiptSha256:""};
  receipt.images=images;receipt.sourceFingerprints={"approved-runtime.ts":hash(sources["approved-runtime.ts"])};
  receipt.artifact={...receipt.artifact,images,manifestSha256:request.manifestSha256,archiveSha256:request.archiveSha256,archiveBytes:archive.length};
  receipt.executionEvidence={...receipt.executionEvidence,runId:request.runId,privateWorkflowCommit:request.workflowCommit,publicBaseCommit:request.publicBaseCommit,exactCompressedOverlaySha256:request.overlaySha256,runUrl:`https://github.com/rnagulapalle/sandbox/actions/runs/${request.runId}`};
  const entry={directory,request,receipt,receiptBytes:null,
   run:{id:request.runId,status:"completed",conclusion:"failure",head_sha:request.workflowCommit,head_branch:"codex/looplabs-platform-integration",event:"push",head_repository:{full_name:"rnagulapalle/sandbox"},path:".github/workflows/looplabs-platform-proof.yml"},
   job:{run_id:request.runId,head_sha:request.workflowCommit,name:"assembled-platform",status:"completed",conclusion:"failure",steps:Object.values(componentSteps).map((name,n)=>({name,number:n+1,status:"completed",conclusion:name===componentSteps.quality?"failure":"success"}))},
   artifact:{id:request.artifactId,name:`looplabs-candidate-platform-images-${request.runId}`,expired:false,size_in_bytes:1000,expires_at:"2030-01-01T00:00:00Z",workflow_run:{id:request.runId,head_sha:request.workflowCommit}},manifest};
  entries.push(entry);
 }
 const seal=entry=>{entry.receiptBytes=Buffer.from(JSON.stringify(entry.receipt));entry.request.receiptSha256=hash(entry.receiptBytes);};entries.forEach(seal);
 const docker=(...args)=>{
  if(args[0]==="image"&&args[1]==="ls")return [...loaded].join("\n");
  if(args[0]==="image"&&args[1]==="load"){mutations.push("load");const entry=entries.find(e=>resolve(e.directory,"images.tar")===args[3]);expect(entry).toBeDefined();entry.manifest.images.forEach(image=>loaded.add(image.id));return "loaded";}
  if(args[0]==="image"&&args[1]==="inspect")return loaded.has(args[2])?args[2]:"absent";
  if(args[0]==="run"){mutations.push("manifest-read");expect(args).toContain("none");expect(args).toContain("--read-only");expect(args).toContain("--cap-drop");expect(args).not.toContain("--mount");expect(args.at(-1)).toContain("readFileSync('.worker/temporal-manifest.json'");return JSON.stringify({buildId:entries[0].manifest.buildId});}
  throw Error("Unexpected Docker mutation");
 };
 return {root,entries,sources,docker,owned,mutations,loaded,seal};
}
test("two verified component inputs reuse exact-byte loading, preserve non-release status and retire only validated downloads",async()=>{
 const f=await fixture();try{
  const result=await loadCandidatePackageInputs({...f,now:0});expect(result).toMatchObject({purpose:"isolated-staging-proof-input",releaseAccepted:false});
  expect(result.packages).toHaveLength(2);expect(result.origins.every(origin=>origin.releaseAccepted===false&&origin.qualityPassed===false)).toBe(true);
  expect(f.owned).toHaveLength(8);expect(f.mutations).toEqual(["load","manifest-read","load","manifest-read"]);
  for(const entry of f.entries){await expect(access(resolve(entry.directory,"images.tar"))).rejects.toThrow();expect(await readFile(resolve(entry.directory,"manifest.json"))).toBeDefined();}
 }finally{await rm(f.root,{recursive:true,force:true});}
});
test("foreign, incompatible, duplicate and unmeasured package pairs refuse before any image loading or ownership registration",async()=>{
 for(const mode of ["foreign","source","build","images","run","directory","malformed-inventory","existing-image"]){
  const f=await fixture();try{
   const second=f.entries[1];
   if(mode==="foreign")second.run.head_repository.full_name="attacker/repo";
   if(mode==="source")second.receipt.sourceFingerprints["approved-runtime.ts"]=hash("different source");
   if(mode==="build")second.receipt.buildId=`ack-${"f".repeat(64)}`;
   if(mode==="images")second.receipt.images=second.receipt.artifact.images=f.entries[0].receipt.images;
   if(mode==="run"){second.request.runId=second.run.id=second.job.run_id=123;second.artifact.name="looplabs-candidate-platform-images-123";second.artifact.workflow_run.id=123;}
   if(mode==="directory")second.directory=f.entries[0].directory;
   f.seal(second);
   const docker=mode==="malformed-inventory"?()=>"not an inventory":mode==="existing-image"?()=>f.entries[0].receipt.images[0].id:f.docker;
   await expect(loadCandidatePackageInputs({...f,docker,now:0}),mode).rejects.toThrow();expect(f.mutations).toEqual([]);expect(f.owned).toEqual([]);
  }finally{await rm(f.root,{recursive:true,force:true});}
 }
});
test("changed downloaded archive refuses before Docker load and preserves the download for diagnosis",async()=>{
 const f=await fixture();try{
  const archive=resolve(f.entries[0].directory,"images.tar");await writeFile(archive,"substituted bytes");
  await expect(loadCandidatePackageInputs({...f,now:0})).rejects.toThrow();expect(f.mutations).toEqual([]);
  expect(f.owned).toHaveLength(8);expect(await readFile(archive,"utf8")).toBe("substituted bytes");
 }finally{await rm(f.root,{recursive:true,force:true});}
});
