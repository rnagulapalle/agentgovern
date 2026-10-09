// Freshness/consistency checks only. A receipt is not a signed audit record.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("tsx"))("esbuild");
export const gatewayProofFiles = [
  "scripts/gateway-bypass-proof.mjs", "scripts/gateway-bypass-record.mjs",
  "scripts/staging-browser-tls.mjs", "scripts/staging-owned-builder.mjs",
  "scripts/staging-fixture-source.mjs", "scripts/check-twin-dependencies.py",
  "scripts/check-connector-health.py", ".dockerignore", "Dockerfile.connector-twin",
  "scripts/connector-twin.py", "scripts/connector-twin-requirements.txt", "pnpm-lock.yaml",
  "lib/durable/recovery-schema.sql", "lib/durable/schema.sql", "lib/workspace/schema.sql", "lib/connectors/schema.sql",
  "lib/workflows/schema.sql", "lib/enquiries/schema.sql",
];
export const gatewayProofChecks = [
  "agentHasNoProviderOrDatabaseCredential", "agentOnlyFrontNetwork",
  "directProviderDnsAndIpDenied", "directDatabaseIpDenied", "agentPrivilegeOperationsDenied",
  "zeroEffectsBeforeApproval", "sameIdReplayAndSingleReservation", "independentNamedApproval",
  "controlOutageNoFailOpen", "heldStateSurvivesRestart", "lostResponseReconciledWithoutResend",
  "dependentEmailVerified", "exactlyTwoEffects", "providerEffectsSurviveSigkill",
  "revokedAgentDenied", "trustedTestCertificateVerifiedByNode", "externalRecoveryEpochEnforced", "completedRunReverifyRefusedWithoutNewEffects", "ownedResourcesRemoved",
];
export const gatewayProofLimits = [
  "customer network installation", "same-pod sidecar isolation", "cloud workload federation",
  "live providers", "production TLS", "persistent staging", "enterprise readiness",
];
export async function gatewaySourceFingerprints() {
  const files = new Set(gatewayProofFiles);
  for (const role of ["server", "agent", "controller"]) {
    const r = await build({ entryPoints: [`scripts/gateway-trial-${role}.ts`], bundle: true,
      platform: "node", format: "cjs", write: false, external: ["next/server", "pg-native"], metafile: true, logLevel: "silent" });
    for (const path of Object.keys(r.metafile.inputs)) if (!path.startsWith("node_modules/")) files.add(path);
  }
  return Object.fromEntries(await Promise.all([...files].sort().map(async p =>
    [p, createHash("sha256").update(await readFile(p)).digest("hex")])));
}
export function validateGatewayReceipt(receipt, currentSources) {
  assert(receipt && typeof receipt === "object" && !Array.isArray(receipt));
  assert.deepEqual(Object.keys(receipt).sort(), ["version", "completedUtc", "scope", "fixtureSource", "sourceFingerprints", "bundles", "imageIds", "checks", "notProved"].sort());
  assert.equal(receipt.version, 1);
  assert.equal(receipt.scope, "disposable Docker network/TLS/actual Next handlers/PostgreSQL/FetchSandbox twin");
  assert(Number.isFinite(Date.parse(receipt.completedUtc)));
  assert.deepEqual(Object.keys(receipt.checks).sort(), [...gatewayProofChecks].sort());
  for (const check of gatewayProofChecks) assert.equal(receipt.checks[check], true, check);
  assert.deepEqual(receipt.notProved, gatewayProofLimits);
  assert.deepEqual(Object.keys(receipt.bundles).sort(), ["agent", "controller", "server"]);
  for (const digest of Object.values(receipt.bundles)) assert(/^[a-f0-9]{64}$/.test(digest));
  assert.deepEqual(Object.keys(receipt.imageIds).sort(), ["agent", "db", "gateway", "twin"]);
  for (const id of Object.values(receipt.imageIds)) assert(/^sha256:[a-f0-9]{64}$/.test(id));
  assert.equal(receipt.imageIds.agent, receipt.imageIds.gateway);
  assert.notEqual(receipt.imageIds.twin, receipt.imageIds.agent);
  assert.notEqual(receipt.imageIds.db, receipt.imageIds.agent);
  const fixture = receipt.fixtureSource;
  assert.equal(fixture.version, 1);
  assert(/^[a-f0-9]{40}$/.test(fixture.commit));
  for (const field of ["archiveSha256", "hubspotSpecSha256"]) assert(/^[a-f0-9]{64}$/.test(fixture[field]));
  assert(Number.isSafeInteger(fixture.trackedFiles) && fixture.trackedFiles > 0);
  for (const path of gatewayProofFiles) assert(Object.hasOwn(currentSources, path), path);
  assert.deepEqual(receipt.sourceFingerprints, currentSources, "Missing, added or changed source requires fresh actual evidence");
  return receipt;
}
