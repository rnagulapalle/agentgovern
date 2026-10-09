// Association and freshness checks only; this does not replace actual retrieval.
import {test,expect} from "vitest";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
test("retained fresh-runner retrieval matches the successful runtime artifact and exact current loader sources",async()=>{
 const runtime=JSON.parse(await readFile("docs/evidence/staging-platform-browser-proof.json","utf8"));
 const proof=JSON.parse(await readFile("docs/evidence/staging-artifact-retrieval-proof.json","utf8"));
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
