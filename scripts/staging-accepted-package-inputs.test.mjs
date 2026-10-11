import {createHash} from "node:crypto";
import {typedSourceFiles} from "./staging-browser-record.mjs";
// Synthetic provenance and mocked image RPCs only; these are not measured acceptance receipts.
import { test, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, chmod, readFile, rm, lstat, symlink } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { acceptedPackageTrial, acceptedOriginSteps, validateAcceptedPackageInputs, loadAcceptedPackageInputs, validateAcceptedInputEnvelope } from "./staging-accepted-package-inputs.mjs";
import { exportTestedImages } from "./staging-image-artifact.mjs";

function fixture() {
  const base = JSON.parse(readFileSync("docs/evidence/staging-platform-browser-proof.json", "utf8"));
  const sources = Object.fromEntries(typedSourceFiles(JSON.parse(readFileSync("docs/evidence/staging-platform-browser-prepared-proof.json","utf8")).sourceFingerprints).map(file => [file, readFileSync(file)]));
  const entries = [0, 1].map(index => {
    const receipt = structuredClone(base), runId = 9000 + index, workflowCommit = String(index + 1).repeat(40);
    receipt.sourceFingerprints=Object.fromEntries(Object.entries(sources).map(([file,bytes])=>[file,createHash("sha256").update(bytes).digest("hex")]));
    receipt.images = ["web", "worker", "twin", "provisioner"].map((role, i) => ({ role, id: `sha256:${String(index * 4 + i + 1).repeat(64)}` }));
    receipt.artifact.images = structuredClone(receipt.images);
    Object.assign(receipt.executionEvidence, { runId, privateWorkflowCommit: workflowCommit, runUrl: `https://github.com/rnagulapalle/sandbox/actions/runs/${runId}` });
    const request = { runId, workflowCommit, artifactId: 7000 + index, manifestSha256: receipt.artifact.manifestSha256, archiveSha256: receipt.artifact.archiveSha256 };
    const run = { id: runId, head_sha: workflowCommit, status: "completed", conclusion: "success", head_branch: "codex/looplabs-platform-integration", event: "push", head_repository: { full_name: "rnagulapalle/sandbox" }, path: ".github/workflows/looplabs-platform-proof.yml" };
    const artifact = { id: request.artifactId, name: `looplabs-tested-images-${runId}`, expired: false, size_in_bytes: 1000, expires_at: "2099-01-01T00:00:00Z", workflow_run: { id: runId, head_sha: workflowCommit } };
    const jobs = { total_count: 1, jobs: [{ run_id: runId, status: "completed", conclusion: "success", steps: acceptedOriginSteps.map(name => ({ name, status: "completed", conclusion: "success" })) }] };
    return { directory: `/tmp/accepted-${index}`, receipt, request, run, artifact, jobs };
  });
  return { entries, sources, expectedRuntimeFiles: Object.keys(sources) };
}
test("requires two strict accepted origins with current complete source identity", () => {
  const result = validateAcceptedPackageInputs(fixture());
  expect(result.ids).toHaveLength(8); expect(result.origins.map(origin => origin.runId)).toEqual([9000, 9001]);
});
test("file input accepts reviewed pins only and cannot supply purported observed job status or API paths", () => {
  const make = () => { const x = fixture(); return { version: 1, origins: x.entries.map(e => e.receipt), requests: x.entries.map(e => e.request), directories: x.entries.map(e => e.directory) }; };
  expect(validateAcceptedInputEnvelope(make()).version).toBe(1);
  for (const change of [x => x.observations = [], x => x.requests[0].jobs = { conclusion: "success" },
    x => x.requests[0].runId = "../../other", x => x.directories[0] = "relative", x => x.origins.pop()]) {
    const input = make(); change(input); expect(() => validateAcceptedInputEnvelope(input)).toThrow();
  }
});
test("refuses malformed associations, historical sources, failed gates, expired artifacts and image collisions", () => {
  const changes = [
    x => x.expectedRuntimeFiles[x.expectedRuntimeFiles.indexOf("lib/workspace/membership-authority-schema.sql")]="unreviewed-substitute.sql",
    x => x.expectedRuntimeFiles[x.expectedRuntimeFiles.indexOf("scripts/membership-authority-setup.ts")]="unreviewed-provisioner.ts",
    x => delete x.sources["scripts/membership-authority-setup.ts"],
    x => x.sources["scripts/membership-authority-setup.ts"] = Buffer.from("changed grant"),
    x => delete x.entries[0].receipt.sourceFingerprints["scripts/membership-authority-setup.ts"],
    x => x.entries[0].receipt.sourceFingerprints["scripts/membership-authority-setup.ts"] = "0".repeat(64),
    x => x.entries.pop(), x => x.entries[0].extra = true,
    x => x.entries[0].directory = "/tmp/../accepted", x => x.entries[1].directory = x.entries[0].directory,
    x => x.expectedRuntimeFiles.pop(), x => x.expectedRuntimeFiles[1] = x.expectedRuntimeFiles[0],
    x => delete x.sources["lib/connectors/service.ts"], x => x.sources["lib/connectors/service.ts"] = "changed",
    x => delete x.entries[0].receipt.sourceFingerprints["lib/connectors/service.ts"],
    x => x.entries[0].receipt.sourceFingerprints["lib/connectors/service.ts"] = "0".repeat(64),
    x => x.entries[0].receipt.actualProviderEffects = 3,
    x => x.entries[0].receipt.executionEvidence.productionChanged = true,
    x => delete x.entries[0].receipt.artifact,
    x => x.entries[0].request.archiveSha256 = "0".repeat(64), x => x.entries[0].request.runId++,
    x => x.entries[0].request.extra = true, x => x.entries[0].run.head_sha = "0".repeat(40),
    x => x.entries[0].run.conclusion = "failure", x => x.entries[0].run.status = "in_progress",
    x => x.entries[0].run.head_branch = "codex/looplabs-candidate-proof",
    x => x.entries[0].artifact.name = `looplabs-candidate-platform-images-${x.entries[0].run.id}`,
    x => x.entries[0].artifact.expired = true, x => x.entries[0].artifact.expires_at = "2000-01-01T00:00:00Z",
    x => x.entries[0].artifact.workflow_run.head_sha = "0".repeat(40),
    x => x.entries[0].jobs.total_count++, x => x.entries[0].jobs.jobs[0].run_id++, x => x.entries[0].jobs.jobs[0].conclusion = "failure",
    x => x.entries[0].jobs.jobs[0].steps[1].conclusion = "skipped",
    x => x.entries[0].jobs.jobs[0].steps.push(x.entries[0].jobs.jobs[0].steps[1]),
    x => x.entries[0].jobs.jobs[0].steps.pop(),
    x => { x.entries[1].receipt.images[0].id = x.entries[0].receipt.images[0].id; x.entries[1].receipt.artifact.images = structuredClone(x.entries[1].receipt.images); },
    x => { x.entries[1].receipt.buildId = `ack-${"0".repeat(64)}`; },
    x => { const e = x.entries[1]; e.request.artifactId = x.entries[0].request.artifactId; e.artifact.id = e.request.artifactId; },
    x => x.entries[1] = structuredClone(x.entries[0]),
  ];
  for (const change of changes) { const input = fixture(); change(input); expect(() => validateAcceptedPackageInputs(input)).toThrow(); }
});
async function archives(run) {
  const parent = await mkdtemp(resolve(tmpdir(), "ll-accepted-inputs-")); await chmod(parent, 0o700);
  try {
    const input = fixture(), calls = [];
    const docker = (...args) => {
      calls.push(args);
      if (args[1] === "save") writeFileSync(args[3], "isolated accepted fixture archive");
      if (args[1] === "inspect") return args[2];
      if (args[0] === "run") return JSON.stringify({ buildId: input.entries[0].receipt.buildId });
      return "";
    };
    for (let index = 0; index < 2; index++) {
      const entry = input.entries[index]; entry.directory = resolve(parent, `release-${index}`);
      const images = Object.fromEntries(entry.receipt.images.map(image => [image.role, image.id]));
      const artifact = await exportTestedImages({ directory: entry.directory, images, buildId: entry.receipt.buildId, docker });
      Object.assign(entry.receipt.artifact, artifact);
      Object.assign(entry.request, { manifestSha256: artifact.manifestSha256, archiveSha256: artifact.archiveSha256 });
    }
    calls.length = 0;
    await run(input, docker, calls);
  } finally { await rm(parent, { recursive: true, force: true }); }
}
test("cold-loads exact owned archives, preserves manifests and registers only initially absent IDs", () => archives(async (input, docker, calls) => {
  const owned = [], manifests = await Promise.all(input.entries.map(e => readFile(resolve(e.directory, "manifest.json"))));
  const result = await loadAcceptedPackageInputs({ ...input, docker, owned });
  expect(result.packages).toHaveLength(2); expect(owned).toHaveLength(8);
  for (let i = 0; i < 2; i++) {
    await expect(lstat(resolve(input.entries[i].directory, "images.tar"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(resolve(input.entries[i].directory, "manifest.json"))).toEqual(manifests[i]);
  }
  expect(calls.filter(c => c[1] === "load")).toHaveLength(2);
  expect(calls.some(c => ["prune", "build", "compose"].includes(c[0]) || c.includes("--force"))).toBe(false);
}));
test("refuses non-cold or malformed image inventories before claiming cleanup ownership", () => archives(async (input, docker) => {
  for (const inventory of [input.entries[0].receipt.images[0].id, "untrusted-tag"]) {
    const owned = [];
    await expect(loadAcceptedPackageInputs({ ...input, owned, docker: (...args) => args[1] === "ls" ? inventory : docker(...args) })).rejects.toThrow();
    expect(owned).toEqual([]);
  }
}));
test("preserves failed or symlinked archives and registers the validated IDs for caller cleanup", () => archives(async (input, docker) => {
  const archive = resolve(input.entries[0].directory, "images.tar"), before = await readFile(archive), owned = [];
  await expect(loadAcceptedPackageInputs({ ...input, owned, docker: (...args) => { if (args[1] === "load") throw Error("partial image load"); return docker(...args); } })).rejects.toThrow("partial image load");
  expect(owned).toHaveLength(8); expect(await readFile(archive)).toEqual(before);
  const link = resolve(input.entries[1].directory, "images.tar"); await rm(link); await symlink(archive, link);
  await expect(loadAcceptedPackageInputs({ ...input, owned: [], docker })).rejects.toThrow("Owned regular");
  expect((await lstat(link)).isSymbolicLink()).toBe(true);
}));


test("accepted drill preserves complete runtime and pending authority gates without rebuilding or candidate fallback", () => {
 const parent=readFileSync("scripts/staging-platform-proof.mjs","utf8"),source=acceptedPackageTrial(parent);
 expect(source).toContain("loadAcceptedPackagesFromFile(process.env.LOOPLABS_STAGING_ACCEPTED_PACKAGE_INPUT,docker,built)");
 expect(source).toContain('assert.equal(packageReleases.purpose,"accepted-source-bound-package-inputs")');
 for(const anchor of ['await stagingBrowserProof(trial,{typedPlanning})','stage="host-admission"','stage="archive-restore-containment"','assert.equal(Object.keys(provider.effects).length,4)','[[0,1],[1,0]]','await assertPending();','Every loaded release image must be removed'])expect(source).toContain(anchor);
 for(const forbidden of ['loadPackageReleases','loadCandidatePackages','LOOPLABS_STAGING_PACKAGE_DIRECTORIES','imageBuilder.build(','imageBuilder.start()'])expect(source).not.toContain(forbidden);
 expect(()=>acceptedPackageTrial(parent.replace('const docker=(...args)=>','changed'))).toThrow();
});
