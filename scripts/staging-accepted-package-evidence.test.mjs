import {typedSourceFiles} from "./staging-browser-record.mjs";
// Synthetic association fixtures, never retained as runtime acceptance.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { currentPackageSources as packageSources } from "./staging-package-record.mjs";
import { acceptedPackageTrial } from "./staging-accepted-package-inputs.mjs";
import { typedReceipt } from "./staging-browser-record.mjs";
import { verifyAcceptedPackageReleaseEvidence } from "./staging-release-evidence.mjs";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const read = file => JSON.parse(readFileSync(file, "utf8"));
function fixture() {
  const base = read("docs/evidence/staging-platform-browser-proof.json");
  const expectedRuntimeFiles = typedSourceFiles(read("docs/evidence/staging-platform-browser-prepared-proof.json").sourceFingerprints);
  const sources = Object.fromEntries([...expectedRuntimeFiles, ...packageSources].map(file => [file, readFileSync(file, "utf8")]));
  const origins = [0, 1].map(index => {
    const origin = structuredClone(base), runId = 8001 + index;
    origin.sourceFingerprints=Object.fromEntries(expectedRuntimeFiles.map(file=>[file,hash(sources[file])]));
    origin.images = origin.images.map((image, role) => ({ ...image, id: `sha256:${"abcdef12"[index * 4 + role].repeat(64)}` }));
    origin.artifact.images = origin.images;
    origin.artifact.manifestSha256 = String(index + 3).repeat(64);
    origin.artifact.archiveSha256 = String(index + 5).repeat(64);
    origin.artifact.archiveBytes = 1001 + index;
    Object.assign(origin.executionEvidence, { runId, runUrl: `https://github.com/rnagulapalle/sandbox/actions/runs/${runId}`, privateWorkflowCommit: String(index + 7).repeat(40) });
    return origin;
  });
  const receipt = read("docs/evidence/staging-package-proof.json");
  receipt.packageOrigins = origins.map(origin => ({ runId: origin.executionEvidence.runId,
    ...Object.fromEntries(["manifestSha256", "archiveSha256", "archiveBytes"].map(key => [key, origin.artifact[key]])) }));
  const images = origins.map(origin => Object.fromEntries(origin.images.map(image => [image.role, image.id])));
  receipt.packageTransitions = origins.map((origin, i) => ({ buildId: origin.buildId,
    from: { web: images[i].web, worker: images[i].worker }, to: { web: images[1 - i].web, worker: images[1 - i].worker },
    replacedRoles: 3, retainedRoles: 5, pendingAuthorityChecks: 3 }));
  receipt.sourceFingerprints = Object.fromEntries(Object.entries(sources).map(([file, bytes]) => [file, hash(bytes)]));
  receipt.generatedTrialSha256 = hash(acceptedPackageTrial(sources["scripts/staging-platform-proof.mjs"]));
  const { executionEvidence: ignoredExecution, sourceFingerprints: ignoredSources, artifact: ignoredArtifact, ...runtime } = origins[0];
  void ignoredExecution; void ignoredSources; void ignoredArtifact;
  receipt.runtime = typedReceipt(runtime, { runId: 8003, privateWorkflowCommit: "c".repeat(40),
    publicBaseCommit: base.executionEvidence.publicBaseCommit, exactCompressedOverlaySha256: base.executionEvidence.exactCompressedOverlaySha256 }, {});
  const requests = origins.map((origin, i) => ({ runId: origin.executionEvidence.runId, workflowCommit: origin.executionEvidence.privateWorkflowCommit,
    artifactId: 9001 + i, manifestSha256: origin.artifact.manifestSha256, archiveSha256: origin.artifact.archiveSha256 }));
  const jobs = names => ({ total_count: 1, jobs: [{ status: "completed", conclusion: "success",
    steps: names.map(name => ({ name, status: "completed", conclusion: "success" })) }] });
  const observations = requests.map(request => ({
    run: { id: request.runId, head_sha: request.workflowCommit, status: "completed", conclusion: "success", event: "push",
      head_repository: { full_name: "rnagulapalle/sandbox" }, head_branch: "codex/looplabs-platform-integration", path: ".github/workflows/looplabs-platform-proof.yml" },
    artifact: { id: request.artifactId, name: `looplabs-tested-images-${request.runId}`, expired: false, size_in_bytes: 1000,
      expires_at: "2099-01-01T00:00:00Z", workflow_run: { id: request.runId, head_sha: request.workflowCommit } },
    jobs: jobs(["Run actual assembled typed workflow", "Full unchanged quality gate", "Retain exact tested images only after full acceptance and regression gates", "Remove this job's owned quality fixture and temporary model input"]),
  }));
  return { envelope: { version: 1, receipt, origins, requests }, expectedRuntimeFiles, sources, currentRuntime: origins[1], observations,
    packageRun: { id: 8003, head_sha: "c".repeat(40), status: "completed", conclusion: "success", event: "push",
      head_repository: { full_name: "rnagulapalle/sandbox" }, head_branch: "codex/looplabs-package-proof", path: ".github/workflows/looplabs-package-proof.yml" },
    packageJobs: jobs(["Run actual accepted-package promotion and reversion", "Full unchanged quality gate", "Retain measured package receipt only after full regression gates", "Remove this job's owned quality fixture and temporary model input"]),
  };
}
test("requires current source-bound transitions between two distinct fully accepted packages and an independent successful trial", () => {
  expect(verifyAcceptedPackageReleaseEvidence(fixture())).toMatchObject({ acceptedPackage: true, runId: 8003, currentOriginRun: 8002 });
});
test("refuses candidate origins, stale transitions, missing authority checks, altered bytes, failed jobs and missing cleanup", () => {
  const changes = [
    x => x.expectedRuntimeFiles[x.expectedRuntimeFiles.indexOf("lib/workspace/membership-authority-schema.sql")]="unreviewed-substitute.sql",
    x => x.observations[0].run.conclusion = "failure", x => x.observations[1].run.status = "in_progress",
    x => x.observations[0].artifact.name = "candidate", x => x.observations[1].artifact.expired = true,
    x => x.envelope.requests[0].workflowCommit = "0".repeat(40), x => x.envelope.requests[1].manifestSha256 = "0".repeat(64),
    x => x.envelope.receipt.packageTransitions.pop(), x => x.envelope.receipt.pendingPackageBrowser.noSelfApproval = false,
    x => x.envelope.receipt.packageTransitions[0].pendingAuthorityChecks = 2,
    x => x.sources["scripts/staging-package-browser.mjs"] += "\n// drift",
    x => x.sources["scripts/staging-artifact-retrieval.mjs"] += "\n// drift",
    x => delete x.sources["scripts/staging-accepted-package-inputs.mjs"],
    x => delete x.sources["runtime/temporal/admission.ts"], x => x.envelope.receipt.runtime.restoreContainment.restoredApprovalRefused = false,
    x => x.envelope.receipt.releaseImagesRemoved = false, x => x.envelope.receipt.generatedTrialSha256 = "0".repeat(64),
    x => x.packageRun.conclusion = "failure", x => x.packageRun.head_repository.full_name = "other/repo",
    x => x.packageJobs.total_count = 2, x => x.packageJobs.jobs[0].steps[1].conclusion = "skipped",
    x => x.packageJobs.jobs[0].steps[3].conclusion = "skipped", x => x.observations[0].jobs.jobs[0].steps.pop(),
    x => x.envelope.extra = true, x => x.envelope.origins[0] = x.envelope.origins[1],
  ];
  for (const change of changes) { const input = fixture(); change(input); expect(() => verifyAcceptedPackageReleaseEvidence(input)).toThrow(); }
});
