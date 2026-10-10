// Synthetic API association fixtures only. These never create acceptance receipts.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { verifyStagingReleaseEvidence, releaseLoaderFiles } from "./staging-release-evidence.mjs";
const read = file => JSON.parse(readFileSync(file, "utf8"));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const runtime = read("docs/evidence/staging-platform-browser-proof.json");
  const retrieval = read("docs/evidence/staging-artifact-retrieval-proof.json");
  const metadata = runtime.executionEvidence;
  Object.assign(retrieval, { originRun: metadata.runId, originCommit: metadata.privateWorkflowCommit,
    images: runtime.images, buildId: runtime.buildId, ...Object.fromEntries(["manifestSha256", "archiveSha256", "archiveBytes"].map(key => [key, runtime.artifact[key]])) });
  const loaderSources = Object.fromEntries(releaseLoaderFiles.map(file => [file, readFileSync(file)]));
  retrieval.sourceFingerprints = Object.fromEntries(Object.entries(loaderSources).map(([file, bytes]) => [file, hash(bytes)]));
  const runtimeSources = Object.fromEntries(Object.keys(runtime.sourceFingerprints).map(file => [file, readFileSync(file)]));
  const run = { id: metadata.runId, head_sha: metadata.privateWorkflowCommit, status: "completed", conclusion: "success",
    event: "push", head_branch: "codex/looplabs-platform-integration", head_repository: { full_name: "rnagulapalle/sandbox" }, path: ".github/workflows/looplabs-platform-proof.yml" };
  const artifact = { id: retrieval.artifactId, name: `looplabs-tested-images-${run.id}`, expired: false,
    size_in_bytes: 1000, expires_at: "2099-01-01T00:00:00Z", workflow_run: { id: run.id, head_sha: run.head_sha } };
  const jobs = names => ({ total_count: 1, jobs: [{ status: "completed", conclusion: "success",
    steps: names.map(name => ({ name, status: "completed", conclusion: "success" })) }] });
  const originJobs = jobs(["Run actual assembled typed workflow", "Full unchanged quality gate",
    "Retain exact tested images only after full acceptance and regression gates", "Remove this job's owned quality fixture and temporary model input"]);
  const retrievalRun = { id: retrieval.executionEvidence.runId, head_sha: retrieval.executionEvidence.workflowCommit,
    status: "completed", conclusion: "success", event: "push", head_repository: run.head_repository,
    head_branch: "codex/looplabs-artifact-retrieval", path: ".github/workflows/looplabs-artifact-retrieval.yml" };
  const retrievalJobs = jobs(["Bind download to exact successful trial and separately retained digest",
    "Verify downloaded bytes and cold-load exact images without rebuilding", "Remove this job's downloaded image archive"]);
  return { runtime, retrieval, runtimeSources, expectedRuntimeFiles: Object.keys(runtimeSources), loaderSources,
    dependencyLock: read("config/staging-runtime-images.json"), run, artifact, originJobs, retrievalRun, retrievalJobs };
}
test("requires both successful observed CI inventories, exact retained artifact and all current runtime/loader bytes", () => {
  const input = fixture();
  expect(verifyStagingReleaseEvidence(input)).toMatchObject({ eligible: true, originRun: input.run.id, retrievalRun: input.retrievalRun.id });
});
test("refuses partial or candidate origins, expired artifacts, stale sources and weaker retrieval evidence", () => {
  const changes = [
    x => x.run.conclusion = "failure", x => x.run.status = "in_progress",
    x => x.artifact.name = `looplabs-candidate-platform-images-${x.run.id}`,
    x => x.artifact.expired = true, x => x.artifact.workflow_run.head_sha = "0".repeat(40),
    x => x.retrieval.originRun++, x => x.retrieval.archiveSha256 = "0".repeat(64),
    x => x.retrieval.imagesRemoved = false, x => x.retrieval.servicesStarted = true,
    x => x.retrieval.dependencyNewImagesRemoved = false, x => x.retrieval.unreviewed = true,
    x => x.runtimeSources["lib/connectors/service.ts"] = Buffer.from("changed"),
    x => delete x.runtimeSources["lib/connectors/service.ts"],
    x => x.expectedRuntimeFiles.pop(), x => x.loaderSources[releaseLoaderFiles[0]] = Buffer.from("changed"),
    x => x.originJobs.total_count++, x => x.originJobs.jobs[0].steps[1].conclusion = "skipped",
    x => x.originJobs.jobs[0].steps.pop(), x => x.originJobs.jobs[0].steps.push(x.originJobs.jobs[0].steps[1]),
    x => x.retrievalRun.conclusion = "cancelled", x => x.retrievalRun.head_repository.full_name = "different/repository",
    x => x.retrievalJobs.jobs[0].conclusion = "failure", x => x.retrievalJobs.jobs[0].steps[2].conclusion = "skipped",
    x => x.retrieval.executionEvidence.productionChanged = true,
    x => x.runtime.restoreContainment.restoredApprovalRefused = false,
  ];
  for (const change of changes) { const input = fixture(); change(input); expect(() => verifyStagingReleaseEvidence(input)).toThrow(); }
});
