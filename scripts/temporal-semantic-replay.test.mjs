import {test,expect} from "vitest";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {semanticArtifact,semanticPair,completedSemanticHistory} from "./temporal-semantic-replay.mjs";
const hash=s=>createHash("sha256").update(s).digest("hex");
test("retained artifact bytes determine identity; corruption, label substitution and extra manifest data refuse",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"semantic-artifact-"));
 try{
  for(const [file,bytes] of [["temporal-service.cjs","service"],["temporal-workflow.cjs","workflow"],["pnpm-lock.yaml","lock"]])await writeFile(join(dir,file),bytes);
  const artifactHash=hash("serviceworkflowlock"),m={version:1,artifactHash,buildId:`ack-${artifactHash}`};
  const manifest=join(dir,"temporal-manifest.json");await writeFile(manifest,JSON.stringify(m));
  const a=await semanticArtifact(dir);expect(a.buildId).toBe(m.buildId);
  await writeFile(join(dir,"temporal-workflow.cjs"),"untrusted replacement");expect(a.code).toBe("workflow");
  await writeFile(join(dir,"temporal-workflow.cjs"),"workflow");
  for(const invalid of [{...m,buildId:`ack-${"0".repeat(64)}`},{...m,version:2},{...m,trust:true}]){
   await writeFile(manifest,JSON.stringify(invalid));await expect(semanticArtifact(dir)).rejects.toThrow();
  }
  await writeFile(manifest,JSON.stringify(m));await writeFile(join(dir,"temporal-workflow.cjs"),(await readFile(join(dir,"temporal-workflow.cjs"),"utf8"))+"modified");
  await expect(semanticArtifact(dir)).rejects.toThrow();
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("same-code relabeling and simultaneous authority/dependency changes cannot satisfy the semantic pair",()=>{
 const old={buildId:`ack-${hash("old")}`,serviceHash:hash("service"),workflowHash:hash("old"),code:"old",lockHash:hash("lock"),codePath:"/old/bundle.cjs"};
 const next={...old,buildId:`ack-${hash("next")}`,workflowHash:hash("next"),code:"next",codePath:"/next/bundle.cjs"};
 expect(semanticPair([old,next])).toEqual([old,next]);
 for(const pair of [[old,old],[old,{...next,workflowHash:old.workflowHash}],[old,{...next,serviceHash:hash("changed")}],[old,{...next,lockHash:hash("changed")}],[old,{...next,buildId:"version-2"}],[old,{...next,code:"mutated after verification"}],[old]])expect(()=>semanticPair(pair)).toThrow();
});
test("failed, truncated, reordered or activity-free histories cannot pass as completed replay evidence",()=>{
 const events=Array.from({length:7},(_,i)=>({eventId:i+1,eventType:i===0?1:i===6?2:i===4?12:5,...(i===0?{workflowExecutionStartedEventAttributes:{workflowType:{name:"pinnedAcknowledgement"}}}:{})}));
 expect(completedSemanticHistory({events}).events).toBe(7);
 for(const history of [{events:events.slice(1)},{events:[...events.slice(0,-1),{eventId:7,eventType:3}]},{events:events.map(e=>({...e,eventId:e.eventId===3?4:e.eventId}))},{events:events.map(e=>({...e,eventType:e.eventType===12?11:e.eventType}))},{events:events.map(e=>({...e,...(e.eventId===1?{workflowExecutionStartedEventAttributes:{workflowType:{name:"other"}}}:{})}))},{}])expect(()=>completedSemanticHistory(history)).toThrow();
});
test("calibration requires explicit isolated invocation before starting any service",()=>{
 const r=spawnSync(process.execPath,["scripts/temporal-semantic-calibration.mjs"],{env:{PATH:process.env.PATH},encoding:"utf8",timeout:10000});
 expect(r.status).toBe(1);expect(r.stdout).toBe("");expect(r.stderr.trim()).toBe("Semantic replay calibration refused; no raw input, history or SDK error printed.");
});

test("actual lifecycle controller refuses before reading authority without its isolated opt-in",()=>{
 const r=spawnSync(process.execPath,["--import","tsx","scripts/staging-semantic-controller.mjs"],{env:{PATH:process.env.PATH},encoding:"utf8",timeout:10000});
 expect(r.status).toBe(1);expect(r.stdout).toBe("");expect(r.stderr.trim()).toBe("Staged semantic lifecycle controller failed; no raw authority, payload or SDK error printed.");
});
