import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { it, expect } from "vitest";
import evidence from "../../docs/evidence/connector-proof-20261013-script-navigation.json";
it("publishes only recorded passing proof for the exact connector implementation", async () => {
  expect(evidence.checks.length).toBeGreaterThanOrEqual(36);
  expect(evidence.checks.every((c) => c.passed === true)).toBe(true);
  for (const marker of ["two independent customers", "reactivation cannot revive", "revoke after an actual effect", "failed persistence cannot attest"])
    expect(evidence.checks.map(c=>c.name).join(" ")).toContain(marker);
  expect(evidence.scope).toContain("No live CRM");
  expect(evidence.limits.some((s) => s.includes("failover"))).toBe(true);
  expect(new Date(evidence.at).getTime()).not.toBeNaN();
  expect(Object.keys(evidence.sourceFingerprints)).toEqual(expect.arrayContaining(["lib/workspace/membership-authority.ts","lib/workspace/membership-authority-schema.sql","lib/quotes/schema.sql","lib/quotes/authority-schema.sql","lib/quotes/plan-v2-schema.sql","lib/quotes/membership-schema.sql"]));
  for (const [file, hash] of Object.entries(evidence.sourceFingerprints))
    expect(
      createHash("sha256")
        .update(await readFile(file))
        .digest("hex"),
      `Proof is stale for ${file}; rerun pnpm connectors:proof`,
    ).toBe(hash);
});
