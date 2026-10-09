import { beforeAll, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { gatewaySourceFingerprints, gatewayProofChecks, gatewayProofLimits, validateGatewayReceipt } from "./gateway-bypass-record.mjs";
let current;
beforeAll(async () => { current = await gatewaySourceFingerprints(); });
// Synthetic parser fixture only. It is never retained as runtime acceptance.
const fixture = () => ({ version: 1, completedUtc: "2026-10-09T00:00:00Z",
  scope: "disposable Docker network/TLS/actual Next handlers/PostgreSQL/FetchSandbox twin",
  fixtureSource: { version: 1, commit: "a".repeat(40), archiveSha256: "b".repeat(64), hubspotSpecSha256: "c".repeat(64), trackedFiles: 1 },
  sourceFingerprints: current, bundles: { agent: "a".repeat(64), controller: "b".repeat(64), server: "c".repeat(64) },
  imageIds: { agent: `sha256:${"a".repeat(64)}`, gateway: `sha256:${"a".repeat(64)}`, db: `sha256:${"b".repeat(64)}`, twin: `sha256:${"c".repeat(64)}` },
  checks: Object.fromEntries(gatewayProofChecks.map(c => [c, true])), notProved: gatewayProofLimits,
});
it("binds consistency to all compiled route sources and complete fixture construction inputs", () => {
  const r = fixture(); expect(validateGatewayReceipt(r, current)).toBe(r);
  expect(current).toHaveProperty("app/api/durable/connectors/route.ts");
  expect(current).toHaveProperty("lib/connectors/service.ts");
  expect(Object.keys(current)).toContain("lib/durable/recovery-schema.sql");
  expect(Object.keys(current)).toContain(".dockerignore");
  expect(Object.keys(current)).toContain("scripts/check-connector-health.py");
});
it("refuses every missing or failed runtime assertion and omitted limitations", () => {
  for (const key of gatewayProofChecks) {
    for (const value of [false, undefined]) {
      const r = structuredClone(fixture()); r.checks[key] = value;
      expect(() => validateGatewayReceipt(r, current)).toThrow();
    }
  }
  const r = structuredClone(fixture()); r.notProved = []; expect(() => validateGatewayReceipt(r, current)).toThrow();
});
it("refuses source drift, reduced construction coverage, unknown fields and invalid provenance", () => {
  for (const mutate of [r => delete r.sourceFingerprints["scripts/check-connector-health.py"],
    r => r.sourceFingerprints["lib/connectors/service.ts"] = "0".repeat(64),
    r => r.sourceFingerprints["extra-source"] = "0".repeat(64), r => r.token = "unreviewed",
    r => r.bundles.agent = "invalid", r => r.imageIds.db = r.imageIds.agent,
    r => r.fixtureSource.commit = "branch", r => r.fixtureSource.trackedFiles = 0]) {
    const r = structuredClone(fixture()); mutate(r); expect(() => validateGatewayReceipt(r, current)).toThrow();
  }
  expect(() => validateGatewayReceipt(fixture(), {})).toThrow();
});

it("retains actual CI acceptance tied to every current source and all three compiled byte hashes", async () => {
  const r = JSON.parse(await readFile("docs/evidence/gateway-bypass-proof.json", "utf8"));
  validateGatewayReceipt(r, current);
  const require = createRequire(import.meta.url), { build } = createRequire(require.resolve("tsx"))("esbuild");
  for (const role of ["server", "agent", "controller"]) {
    const output = await build({ entryPoints: [`scripts/gateway-trial-${role}.ts`], bundle: true, platform: "node", format: "cjs", write: false, outfile: `/tmp/ll-gateway-freshness/${role}.cjs`, external: ["next/server", "pg-native"], logLevel: "silent" });
    expect(createHash("sha256").update(output.outputFiles[0].contents).digest("hex")).toBe(r.bundles[role]);
  }
});
