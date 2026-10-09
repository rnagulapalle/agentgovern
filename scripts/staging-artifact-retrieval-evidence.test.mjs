// Association and freshness checks only; this does not replace actual retrieval.
import {test,expect} from "vitest";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
test("historical fresh-runner retrieval matches its preserved successful origin and exact current loader sources",async()=>{
 const origin=await readFile("docs/evidence/staging-platform-browser-before-dependency-proof.json");
 expect(createHash("sha256").update(origin).digest("hex")).toBe("63bf8c574b473a056b6dd4f79f0280321c11c69106982d8d40a261eb40cb1a97");
 const runtime=JSON.parse(origin);
 const retained=await readFile("docs/evidence/staging-artifact-retrieval-before-dependency-proof.json");
 expect(createHash("sha256").update(retained).digest("hex")).toBe("29c6379ddfc04c54a3fbfd5f0752bce12e8cbc263b7d1f19748a39745b69185e");
 const proof=JSON.parse(retained);
 expect(proof.passed).toBe(true);expect(proof.originRun).toBe(runtime.executionEvidence.runId);expect(proof.originCommit).toBe(runtime.executionEvidence.privateWorkflowCommit);
 expect(proof.scope).toBe("fresh runner private artifact retrieval and exact image/worker verification");
 expect(proof.images).toEqual(runtime.images);expect(proof.buildId).toBe(runtime.buildId);
 for(const key of ["manifestSha256","archiveSha256","archiveBytes"])expect(proof[key]).toBe(runtime.artifact[key]);
 expect(Number.isSafeInteger(proof.artifactId)&&proof.artifactId>0).toBe(true);
 expect(proof.imagesRemoved).toBe(true);expect(proof.servicesStarted).toBe(false);expect(proof.executionEvidence.productionChanged).toBe(false);
 expect(proof.executionEvidence.runId).not.toBe(proof.originRun);expect(proof.executionEvidence.workflowCommit).toMatch(/^[a-f0-9]{40}$/);
 expect(proof.notVerified).toEqual(["persistent staging","application rollout or rollback","live provider guarantees","production acceptance"]);
 expect(Object.keys(proof.sourceFingerprints).sort()).toEqual(["scripts/staging-artifact-retrieval.mjs","scripts/staging-image-artifact.mjs"]);
 for(const [file,digest] of Object.entries(proof.sourceFingerprints))expect(createHash("sha256").update(await readFile(file)).digest("hex"),file).toBe(digest);
});

test("current fresh-runner retrieval binds new custom artifact and all reviewed dependency identities",async()=>{
 const runtime=JSON.parse(await readFile("docs/evidence/staging-platform-browser-proof.json","utf8"));
 const proof=JSON.parse(await readFile("docs/evidence/staging-artifact-retrieval-proof.json","utf8"));
 const lock=JSON.parse(await readFile("config/staging-runtime-images.json","utf8"));
 expect(proof.passed).toBe(true);expect(proof.originRun).toBe(runtime.executionEvidence.runId);expect(proof.originCommit).toBe(runtime.executionEvidence.privateWorkflowCommit);
 expect(proof.scope).toBe("fresh runner private artifact retrieval and exact image/worker verification");
 expect(proof.images).toEqual(runtime.images);expect(proof.buildId).toBe(runtime.buildId);
 for(const key of ["manifestSha256","archiveSha256","archiveBytes"])expect(proof[key]).toBe(runtime.artifact[key]);
 expect(Number.isSafeInteger(proof.artifactId)&&proof.artifactId>0).toBe(true);
 expect(proof.imagesRemoved).toBe(true);expect(proof.servicesStarted).toBe(false);expect(proof.executionEvidence.productionChanged).toBe(false);
 expect(proof.dependencyImages).toEqual(lock);expect(proof.dependencyNewImagesRemoved).toBe(true);
 expect(runtime.dependencyImages).toEqual({...lock,runtimeBindings:3,schemaExecutions:6});
 expect(proof.executionEvidence.runId).not.toBe(proof.originRun);expect(proof.executionEvidence.workflowCommit).toMatch(/^[a-f0-9]{40}$/);
 expect(proof.notVerified).toEqual(["persistent staging","application rollout or rollback","live provider guarantees","production acceptance"]);
 expect(Object.keys(proof.sourceFingerprints).sort()).toEqual(["config/staging-runtime-images.json","scripts/staging-artifact-retrieval.mjs","scripts/staging-image-artifact.mjs","scripts/staging-runtime-images.mjs","scripts/staging-runtime-retrieval.mjs"]);
 for(const [file,digest] of Object.entries(proof.sourceFingerprints))expect(createHash("sha256").update(await readFile(file)).digest("hex"),file).toBe(digest);
});
