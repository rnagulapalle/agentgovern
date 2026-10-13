// Association and freshness checks only; this does not replace actual retrieval.
import {test,expect} from "vitest";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
const historicalLoaderSha256="cf78d67c833418417f2bb64bce784b96cf6fe682f92abd8f43fa6da0165cebd1";
function assertHistoricalLoader(bytes){expect(bytes.length).toBe(6043);expect(createHash("sha256").update(bytes).digest("hex")).toBe(historicalLoaderSha256);expect(createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest("hex")).toBe("cc91a99ce0cd0e3b97db463da1e5bd7be7adcb9a");return bytes;}
// Exact Git blob from88374581/d3f954eb. Data only: never import or execute the
// old loader, and never supply it to current release eligibility.
// Exact historical Git blob from d3f954eb; never executed or admitted as current.
function assertHistoricalRequest(bytes){expect(bytes.length).toBe(1621);expect(createHash("sha256").update(bytes).digest("hex")).toBe("a2bc73e4781decdd5d8830c18e63afd11dccbb5b1f3d313a6d1785c276b1272e");expect(createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest("hex")).toBe("59c7faa95a9b7d9f2004fa97a3b889d458584ff2");return bytes;}
async function historicalSource(file){if(file==="scripts/staging-image-artifact.mjs")return assertHistoricalLoader(await readFile("scripts/fixtures/historical-retrieval/staging-image-artifact.mjs.txt"));if(file==="scripts/staging-artifact-retrieval.mjs")return assertHistoricalRequest(await readFile("scripts/fixtures/historical-retrieval/staging-artifact-retrieval.mjs.txt"));return readFile(file);}

test("historical fresh-runner retrieval matches its preserved successful origin and exact recorded historical loader sources",async()=>{
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
 for(const [file,digest] of Object.entries(proof.sourceFingerprints))expect(createHash("sha256").update(await historicalSource(file)).digest("hex"),file).toBe(digest);
});

// Current accepted-image eligibility is enforced independently by release-gate.sh.
// Quality preserves this actual historical retrieval rather than rebinding it to
// a candidate whose accepted artifact cannot exist until quality succeeds.
test("historical dependency-aware retrieval keeps its exact successful origin and recorded historical loader identities",async()=>{
 const runtimeBytes=await readFile("docs/evidence/staging-platform-browser-before-chat-redesign-proof.json");
 expect(createHash("sha256").update(runtimeBytes).digest("hex")).toBe("a43562a4c2bc1172cc3a0e23403ac24e1cddc075036b991ab92d9eb03eba230d");
 const runtime=JSON.parse(runtimeBytes);
 const retrievalBytes=await readFile("docs/evidence/staging-artifact-retrieval-before-chat-redesign-proof.json");
 expect(createHash("sha256").update(retrievalBytes).digest("hex")).toBe("5266a30b1c9f666f0b3b97ff880cb8f364854359eb53e22b199a6afbdef442b5");
 const proof=JSON.parse(retrievalBytes);
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
 for(const [file,digest] of Object.entries(proof.sourceFingerprints))expect(createHash("sha256").update(await historicalSource(file)).digest("hex"),file).toBe(digest);
});

test("archived loader identity refuses truncation, alteration and substitution by the current loader",async()=>{const original=await readFile("scripts/fixtures/historical-retrieval/staging-image-artifact.mjs.txt");expect(()=>assertHistoricalLoader(original)).not.toThrow();for(const changed of [original.subarray(1),Buffer.concat([original,Buffer.from("\n")]),Buffer.from(original.toString().replace("const roles=", "let roles=")),await readFile("scripts/staging-image-artifact.mjs")])expect(()=>assertHistoricalLoader(changed)).toThrow();});

test("historical request validator identity refuses changed bytes and current v2 wrapper",async()=>{const original=await readFile("scripts/fixtures/historical-retrieval/staging-artifact-retrieval.mjs.txt");expect(()=>assertHistoricalRequest(original)).not.toThrow();for(const changed of [original.subarray(1),Buffer.concat([original,Buffer.from("\n")]),await readFile("scripts/staging-artifact-retrieval.mjs")])expect(()=>assertHistoricalRequest(changed)).toThrow();});
