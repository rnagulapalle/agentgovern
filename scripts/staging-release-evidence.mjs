// Source-bound artifact eligibility, not enterprise readiness or a signed attestation.
// Run/job/artifact observations must come from authenticated GitHub API reads.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyArtifactRequest } from "./staging-artifact-retrieval.mjs";
import { typedReceipt, typedSourceFiles, membershipAuthoritySourceFiles } from "./staging-browser-record.mjs";
import { currentPackageSources as packageSources, validateCurrentAcceptedPackageReceipt } from "./staging-package-record.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
export const releaseLoaderFiles = [
  "config/staging-runtime-images.json", "scripts/staging-artifact-retrieval.mjs",
  "scripts/staging-image-artifact.mjs", "scripts/staging-runtime-images.mjs",
  "scripts/staging-runtime-retrieval.mjs",
];
function successfulJobs(value, required) {
  assert(Number.isSafeInteger(value.total_count) && value.total_count > 0 && value.total_count <= 8);
  assert.equal(value.jobs.length, value.total_count, "Incomplete observed job inventory");
  for (const job of value.jobs) {
    assert.equal(job.status, "completed"); assert.equal(job.conclusion, "success");
    assert(Array.isArray(job.steps) && job.steps.length > 0);
    assert(job.steps.every(step => step.status === "completed" && ["success", "skipped"].includes(step.conclusion)));
  }
  const steps = value.jobs.flatMap(job => job.steps);
  for (const name of required) {
    const matched = steps.filter(step => step.name === name);
    assert.equal(matched.length, 1, `Missing or ambiguous observed step: ${name}`);
    assert.equal(matched[0].conclusion, "success", `Required observed step did not pass: ${name}`);
  }
}
export function verifyStagingReleaseEvidence({ runtime, retrieval, runtimeSources, expectedRuntimeFiles,
  loaderSources, dependencyLock, run, artifact, originJobs, retrievalRun, retrievalJobs }, now = Date.now()) {
  assert.equal(expectedRuntimeFiles.length, 106, "Complete reviewed runtime source registry required");
  assert(membershipAuthoritySourceFiles.every(file=>expectedRuntimeFiles.includes(file)), "Membership authority sources required");
  assert.deepEqual(Object.keys(runtimeSources).sort(), [...expectedRuntimeFiles].sort());
  assert.deepEqual(Object.keys(runtime.sourceFingerprints).sort(), [...expectedRuntimeFiles].sort());
  for (const file of expectedRuntimeFiles) assert.equal(hash(runtimeSources[file]), runtime.sourceFingerprints[file], `Current runtime source changed: ${file}`);
  const { executionEvidence, sourceFingerprints, ...result } = runtime;
  const { runId, privateWorkflowCommit, publicBaseCommit, exactCompressedOverlaySha256 } = executionEvidence;
  assert.deepEqual(typedReceipt(result, { runId, privateWorkflowCommit, publicBaseCommit, exactCompressedOverlaySha256 }, sourceFingerprints), runtime);
  assert(runtime.artifact, "Accepted runtime must retain exact image bytes");
  assert.deepEqual(Object.keys(retrieval).sort(), ["passed", "scope", "originRun", "originCommit", "artifactId",
    "manifestSha256", "archiveSha256", "archiveBytes", "buildId", "images", "imagesRemoved", "dependencyImages",
    "dependencyNewImagesRemoved", "servicesStarted", "sourceFingerprints", "notVerified", "executionEvidence"].sort());
  assert.equal(retrieval.passed, true);
  assert.equal(retrieval.scope, "fresh runner private artifact retrieval and exact image/worker verification");
  assert.equal(retrieval.originRun, runId); assert.equal(retrieval.originCommit, privateWorkflowCommit);
  const request = { runId, workflowCommit: privateWorkflowCommit, artifactId: retrieval.artifactId,
    manifestSha256: retrieval.manifestSha256, archiveSha256: retrieval.archiveSha256 };
  verifyArtifactRequest(request, run, artifact, now); // Still refuses candidate/failed origins.
  successfulJobs(originJobs, ["Run actual assembled typed workflow", "Full unchanged quality gate",
    "Retain exact tested images only after full acceptance and regression gates",
    "Remove this job's owned quality fixture and temporary model input"]);
  for (const key of ["manifestSha256", "archiveSha256", "archiveBytes"]) assert.equal(retrieval[key], runtime.artifact[key]);
  assert.deepEqual(retrieval.images, runtime.images); assert.equal(retrieval.buildId, runtime.buildId);
  assert.equal(retrieval.imagesRemoved, true); assert.equal(retrieval.servicesStarted, false);
  assert.equal(retrieval.dependencyNewImagesRemoved, true); assert.deepEqual(retrieval.dependencyImages, dependencyLock);
  assert.deepEqual(Object.keys(retrieval.sourceFingerprints).sort(), [...releaseLoaderFiles].sort());
  assert.deepEqual(Object.keys(loaderSources).sort(), [...releaseLoaderFiles].sort());
  for (const file of releaseLoaderFiles) assert.equal(hash(loaderSources[file]), retrieval.sourceFingerprints[file], `Current retrieval loader changed: ${file}`);
  assert.deepEqual(retrieval.notVerified, ["persistent staging", "application rollout or rollback", "live provider guarantees", "production acceptance"]);
  const origin = retrieval.executionEvidence;
  assert.equal(origin.productionChanged, false); assert.notEqual(origin.runId, runId);
  assert.equal(origin.runUrl, `https://github.com/rnagulapalle/sandbox/actions/runs/${origin.runId}`);
  assert.equal(retrievalRun.id, origin.runId); assert.equal(retrievalRun.head_sha, origin.workflowCommit);
  assert.equal(retrievalRun.status, "completed"); assert.equal(retrievalRun.conclusion, "success");
  assert.equal(retrievalRun.event, "push"); assert.equal(retrievalRun.head_repository?.full_name, "rnagulapalle/sandbox");
  assert.equal(retrievalRun.head_branch, "codex/looplabs-artifact-retrieval");
  assert.equal(retrievalRun.path, ".github/workflows/looplabs-artifact-retrieval.yml");
  successfulJobs(retrievalJobs, ["Bind download to exact successful trial and separately retained digest",
    "Verify downloaded bytes and cold-load exact images without rebuilding", "Remove this job's downloaded image archive"]);
  return { eligible: true, originRun: runId, retrievalRun: origin.runId, artifactId: retrieval.artifactId,
    scope: "current source-bound accepted staging artifact; no enterprise readiness claim" };
}

function checkedEnvelope(envelope) {
  assert.deepEqual(Object.keys(envelope).sort(), ["version", "receipt", "origins", "requests"].sort());
  assert.equal(envelope.version, 1);
  assert(Array.isArray(envelope.origins) && Array.isArray(envelope.requests));
  assert.equal(envelope.origins.length, 2); assert.equal(envelope.requests.length, 2);
  for (const request of envelope.requests) {
    assert.deepEqual(Object.keys(request).sort(), ["runId", "workflowCommit", "artifactId", "manifestSha256", "archiveSha256"].sort());
    for (const key of ["runId", "artifactId"]) assert(Number.isSafeInteger(request[key]) && request[key] > 0);
    assert(/^[a-f0-9]{40}$/.test(request.workflowCommit));
    for (const key of ["manifestSha256", "archiveSha256"]) assert(/^[a-f0-9]{64}$/.test(request[key]));
  }
  return envelope;
}
export function verifyAcceptedPackageReleaseEvidence({ envelope, expectedRuntimeFiles, sources,
  currentRuntime, observations, packageRun, packageJobs }, now = Date.now()) {
  checkedEnvelope(envelope);
  assert.equal(observations.length, 2);
  assert.deepEqual(envelope.origins[1], currentRuntime, "Current accepted runtime must be the second package origin");
  assert.deepEqual(Object.keys(sources).sort(), [...expectedRuntimeFiles, ...packageSources].sort());
  validateCurrentAcceptedPackageReceipt(envelope.receipt, envelope.origins, sources, expectedRuntimeFiles);
  for (let i = 0; i < 2; i++) {
    const origin = envelope.origins[i], request = envelope.requests[i], observed = observations[i];
    assert.equal(request.runId, origin.executionEvidence.runId);
    assert.equal(request.workflowCommit, origin.executionEvidence.privateWorkflowCommit);
    for (const key of ["manifestSha256", "archiveSha256"]) assert.equal(request[key], origin.artifact[key]);
    verifyArtifactRequest(request, observed.run, observed.artifact, now);
    successfulJobs(observed.jobs, ["Run actual assembled typed workflow", "Full unchanged quality gate",
      "Retain exact tested images only after full acceptance and regression gates",
      "Remove this job's owned quality fixture and temporary model input"]);
  }
  const execution = envelope.receipt.runtime.executionEvidence;
  assert.equal(packageRun.id, execution.runId); assert.equal(packageRun.head_sha, execution.privateWorkflowCommit);
  assert.equal(packageRun.status, "completed"); assert.equal(packageRun.conclusion, "success");
  assert.equal(packageRun.event, "push"); assert.equal(packageRun.head_repository?.full_name, "rnagulapalle/sandbox");
  assert.equal(packageRun.head_branch, "codex/looplabs-package-proof");
  assert.equal(packageRun.path, ".github/workflows/looplabs-package-proof.yml");
  assert(!envelope.requests.some(request => request.runId === packageRun.id), "Independent package trial required");
  successfulJobs(packageJobs, ["Run actual accepted-package promotion and reversion", "Full unchanged quality gate",
    "Retain measured package receipt only after full regression gates",
    "Remove this job's owned quality fixture and temporary model input"]);
  return { acceptedPackage: true, runId: packageRun.id, currentOriginRun: currentRuntime.executionEvidence.runId,
    scope: "source-bound accepted-image transitions; no enterprise SLA claim" };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const runtime = JSON.parse(await readFile("docs/evidence/staging-platform-browser-proof.json", "utf8"));
    const retrieval = JSON.parse(await readFile("docs/evidence/staging-artifact-retrieval-proof.json", "utf8"));
    const prior = JSON.parse(await readFile("docs/evidence/staging-platform-browser-prepared-proof.json", "utf8"));
    const expectedRuntimeFiles = typedSourceFiles(prior.sourceFingerprints);
    const runtimeSources = Object.fromEntries(await Promise.all(expectedRuntimeFiles.map(async file => [file, await readFile(file)])));
    const loaderSources = Object.fromEntries(await Promise.all(releaseLoaderFiles.map(async file => [file, await readFile(file)])));
    const api = path => JSON.parse(execFileSync("gh", ["api", `repos/rnagulapalle/sandbox/${path}`], { encoding: "utf8", timeout: 30000, maxBuffer: 2 * 1024 ** 2, stdio: ["ignore", "pipe", "pipe"] }));
    const id = runtime.executionEvidence.runId, retrieved = retrieval.executionEvidence.runId;
    const result = verifyStagingReleaseEvidence({ runtime, retrieval, runtimeSources, expectedRuntimeFiles, loaderSources,
      dependencyLock: JSON.parse(await readFile("config/staging-runtime-images.json", "utf8")),
      run: api(`actions/runs/${id}`), artifact: api(`actions/artifacts/${retrieval.artifactId}`),
      originJobs: api(`actions/runs/${id}/jobs?per_page=100`), retrievalRun: api(`actions/runs/${retrieved}`),
      retrievalJobs: api(`actions/runs/${retrieved}/jobs?per_page=100`) });
    const envelope = checkedEnvelope(JSON.parse(await readFile("docs/evidence/staging-release-package-proof.json", "utf8")));
    const sources = Object.fromEntries(await Promise.all([...expectedRuntimeFiles, ...packageSources].map(async file => [file, await readFile(file, "utf8")])));
    const observations = envelope.requests.map(request => ({ run: api(`actions/runs/${request.runId}`),
      artifact: api(`actions/artifacts/${request.artifactId}`), jobs: api(`actions/runs/${request.runId}/jobs?per_page=100`) }));
    const packageId = envelope.receipt.runtime.executionEvidence.runId;
    const acceptedPackage = verifyAcceptedPackageReleaseEvidence({ envelope, expectedRuntimeFiles, sources, currentRuntime: runtime, observations,
      packageRun: api(`actions/runs/${packageId}`), packageJobs: api(`actions/runs/${packageId}/jobs?per_page=100`) });
    console.log(JSON.stringify({ ...result, ...acceptedPackage }));
  } catch {
    console.error("Release blocked: current accepted CI artifacts, exact cold retrieval/package transitions, source identity or authenticated provenance is missing or invalid. No raw account output printed.");
    process.exitCode = 1;
  }
}
