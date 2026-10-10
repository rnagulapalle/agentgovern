// Observed successful accepted origins only. This loader does not confer release eligibility.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, lstat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { verifyArtifactRequest } from "./staging-artifact-retrieval.mjs";
import { typedReceipt, typedSourceFiles } from "./staging-browser-record.mjs";
import { loadAndRetireMeasuredArchive } from "./staging-package-releases.mjs";
import { retainedPackageTrial } from "./staging-package-trial-source.mjs";

// Keep the historical and candidate scaffolds unchanged. Only explicit accepted
// inputs can enter this complete runtime/HTTPS/restore/transition drill.
export function acceptedPackageTrial(parent) {
  let source = retainedPackageTrial(parent);
  const replacements = [
    ['import {loadPackageReleases} from "./staging-package-releases.mjs";', 'import {loadAcceptedPackagesFromFile} from "./staging-accepted-package-inputs.mjs";'],
    ['packageReleases=await loadPackageReleases(JSON.parse(await readFile(process.env.LOOPLABS_STAGING_PACKAGE_DIRECTORIES,"utf8")),docker,built);', 'packageReleases=await loadAcceptedPackagesFromFile(process.env.LOOPLABS_STAGING_ACCEPTED_PACKAGE_INPUT,docker,built);assert.equal(packageReleases.purpose,"accepted-source-bound-package-inputs");'],
  ];
  for (const [before, after] of replacements) {
    assert.equal(source.split(before).length, 2, "Accepted trial anchor is missing or ambiguous");
    source = source.replace(before, after);
  }
  assert(!source.includes("loadPackageReleases") && !source.includes("LOOPLABS_STAGING_PACKAGE_DIRECTORIES"));
  return source;
}

export const acceptedOriginSteps = [
  "Run actual assembled typed workflow", "Full unchanged quality gate",
  "Retain exact tested images only after full acceptance and regression gates",
  "Remove this job's owned quality fixture and temporary model input",
];
function successfulJobs(value, runId) {
  assert(value && Number.isSafeInteger(value.total_count) && value.total_count > 0 && value.total_count <= 8);
  assert(Array.isArray(value.jobs) && value.jobs.length === value.total_count, "Complete observed job inventory required");
  for (const job of value.jobs) {
    assert.equal(job.run_id, runId, "Observed job belongs to a different origin");
    assert.equal(job.status, "completed"); assert.equal(job.conclusion, "success");
    assert(Array.isArray(job.steps) && job.steps.length > 0 && job.steps.length <= 100);
    assert(job.steps.every(step => step.status === "completed" && ["success", "skipped"].includes(step.conclusion)));
  }
  const steps = value.jobs.flatMap(job => job.steps);
  for (const name of acceptedOriginSteps) {
    const matches = steps.filter(step => step.name === name);
    assert.equal(matches.length, 1, `Missing or ambiguous required step: ${name}`);
    assert.equal(matches[0].conclusion, "success", `Required step did not pass: ${name}`);
  }
}
export function validateAcceptedPackageInputs({ entries, sources, expectedRuntimeFiles }, now = Date.now()) {
  assert(Array.isArray(entries) && entries.length === 2, "Exactly two accepted origins required");
  assert(Array.isArray(expectedRuntimeFiles) && expectedRuntimeFiles.length === 99 && new Set(expectedRuntimeFiles).size === 99,
    "Complete reviewed 99-file runtime registry required");
  assert(expectedRuntimeFiles.every(file => typeof file === "string" && !isAbsolute(file) && !file.split("/").includes("..")));
  assert.deepEqual(Object.keys(sources).sort(), [...expectedRuntimeFiles].sort());
  const origins = [], receipts = [];
  for (const entry of entries) {
    assert.deepEqual(Object.keys(entry).sort(), ["directory", "receipt", "request", "run", "artifact", "jobs"].sort());
    assert(typeof entry.directory === "string" && isAbsolute(entry.directory) && resolve(entry.directory) === entry.directory);
    const receipt = entry.receipt;
    assert(receipt && receipt.artifact, "Exact accepted image retention required");
    assert.deepEqual(Object.keys(receipt.sourceFingerprints).sort(), [...expectedRuntimeFiles].sort());
    for (const file of expectedRuntimeFiles) {
      assert(typeof sources[file] === "string" || Buffer.isBuffer(sources[file]), "Runtime source bytes required");
      assert.equal(createHash("sha256").update(sources[file]).digest("hex"), receipt.sourceFingerprints[file], `Current runtime source changed: ${file}`);
    }
    const { executionEvidence, sourceFingerprints, ...result } = receipt;
    const { runId, privateWorkflowCommit, publicBaseCommit, exactCompressedOverlaySha256 } = executionEvidence;
    assert.deepEqual(typedReceipt(result, { runId, privateWorkflowCommit, publicBaseCommit, exactCompressedOverlaySha256 }, sourceFingerprints), receipt);
    assert.equal(entry.request.runId, runId); assert.equal(entry.request.workflowCommit, privateWorkflowCommit);
    for (const key of ["manifestSha256", "archiveSha256"]) assert.equal(entry.request[key], receipt.artifact[key]);
    const origin = verifyArtifactRequest(entry.request, entry.run, entry.artifact, now);
    successfulJobs(entry.jobs, runId);
    origins.push({ ...origin, archiveBytes: receipt.artifact.archiveBytes }); receipts.push(receipt);
  }
  assert.notEqual(entries[0].directory, entries[1].directory, "Distinct downloaded directories required");
  assert.notEqual(origins[0].runId, origins[1].runId, "Two independently observed origins required");
  assert.notEqual(origins[0].artifactId, origins[1].artifactId, "Distinct accepted artifacts required");
  assert.equal(receipts[0].buildId, receipts[1].buildId, "Same controlled worker contract required");
  assert.deepEqual(receipts[0].sourceFingerprints, receipts[1].sourceFingerprints);
  const ids = receipts.flatMap(receipt => receipt.images.map(image => image.id));
  assert.equal(new Set(ids).size, 8, "Eight distinct immutable accepted image identities required");
  return { receipts, origins, ids };
}

export async function loadAcceptedPackageInputs({ entries, sources, expectedRuntimeFiles, docker, owned, now = Date.now() }) {
  assert(typeof docker === "function" && Array.isArray(owned));
  const { receipts, origins, ids } = validateAcceptedPackageInputs({ entries, sources, expectedRuntimeFiles }, now);
  assert(!ids.some(id => owned.includes(id)), "Accepted image IDs already registered for cleanup");
  const output = docker("image", "ls", "--no-trunc", "--quiet");
  assert.equal(typeof output, "string", "Successful complete image inventory required");
  const inventory = output.split("\n").filter(Boolean);
  assert(inventory.every(id => /^sha256:[a-f0-9]{64}$/.test(id)), "Complete successful image inventory required");
  assert(ids.every(id => !inventory.includes(id)), "Accepted images must be absent on this isolated host");
  // Caller cleanup owns only reviewed IDs proved absent before any partial load.
  owned.push(...ids);
  const packages = [];
  for (let i = 0; i < 2; i++) {
    const receipt = receipts[i];
    const loaded = await loadAndRetireMeasuredArchive(entries[i].directory, {
      buildId: receipt.buildId, images: receipt.images, manifestSha256: receipt.artifact.manifestSha256,
      archiveSha256: receipt.artifact.archiveSha256, archiveBytes: receipt.artifact.archiveBytes,
    }, docker);
    packages.push({ buildId: loaded.buildId, ...Object.fromEntries(loaded.images.map(image => [image.role, image.id])) });
  }
  return { purpose: "accepted-source-bound-package-inputs", packages,
    origins: origins.map(({ runId, manifestSha256, archiveSha256, archiveBytes }) =>
      ({ runId, manifestSha256, archiveSha256, archiveBytes })) };
}

export function validateAcceptedInputEnvelope(value) {
  assert(value && typeof value === "object" && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), ["version", "origins", "requests", "directories"].sort());
  assert.equal(value.version, 1);
  for (const key of ["origins", "requests", "directories"]) assert(Array.isArray(value[key]) && value[key].length === 2);
  for (let i = 0; i < 2; i++) {
    const request = value.requests[i];
    assert(request && typeof request === "object" && !Array.isArray(request));
    assert.deepEqual(Object.keys(request).sort(), ["runId", "workflowCommit", "artifactId", "manifestSha256", "archiveSha256"].sort());
    for (const key of ["runId", "artifactId"]) assert(Number.isSafeInteger(request[key]) && request[key] > 0);
    assert(/^[a-f0-9]{40}$/.test(request.workflowCommit));
    for (const key of ["manifestSha256", "archiveSha256"]) assert(/^[a-f0-9]{64}$/.test(request[key]));
    const directory = value.directories[i];
    assert(typeof directory === "string" && isAbsolute(directory) && resolve(directory) === directory);
  }
  assert.notEqual(value.directories[0], value.directories[1]);
  return value;
}

// The file supplies receipts and reviewed archive pins, never observed CI status.
// Run/artifact/job inventories are fetched independently through authenticated gh.
export async function loadAcceptedPackagesFromFile(file, docker, owned) {
  assert(typeof file === "string" && isAbsolute(file) && resolve(file) === file);
  const state = await lstat(file);
  assert(state.isFile() && !state.isSymbolicLink() && state.uid === process.getuid()
    && state.size > 0 && state.size <= 2 * 1024 ** 2, "Owned bounded input file required");
  const encoded = await readFile(file);
  assert.equal(encoded.length, state.size, "Input file changed while reading");
  const input = validateAcceptedInputEnvelope(JSON.parse(encoded));
  const prior = JSON.parse(await readFile("docs/evidence/staging-platform-browser-prepared-proof.json", "utf8"));
  const expectedRuntimeFiles = typedSourceFiles(prior.sourceFingerprints);
  const sources = Object.fromEntries(await Promise.all(expectedRuntimeFiles.map(async path => [path, await readFile(path)])));
  const api = path => JSON.parse(execFileSync("gh", ["api", `repos/rnagulapalle/sandbox/${path}`], {
    encoding: "utf8", timeout: 30000, maxBuffer: 2 * 1024 ** 2, stdio: ["ignore", "pipe", "pipe"],
  }));
  const entries = input.requests.map((request, i) => ({ directory: input.directories[i], receipt: input.origins[i], request,
    run: api(`actions/runs/${request.runId}`), artifact: api(`actions/artifacts/${request.artifactId}`),
    jobs: api(`actions/runs/${request.runId}/jobs?per_page=100`),
  }));
  return loadAcceptedPackageInputs({ entries, sources, expectedRuntimeFiles, docker, owned });
}
