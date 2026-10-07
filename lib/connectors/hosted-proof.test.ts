import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { it, expect } from "vitest";
import evidence from "../../docs/evidence/hosted-connector-proof.json";

it("keeps hosted proof tied to its implementation and independently observed response loss", async () => {
  expect(evidence.checks).toHaveLength(7);
  expect(evidence.checks.some(check => check.name.includes("before submitting any action"))).toBe(true);
  expect(evidence.checks.every(check => check.passed)).toBe(true);
  expect(evidence.scope).toContain("No live provider or inbox delivery");
  expect(evidence.limitations).toContain("Not a completed CRM-to-email workflow acceptance.");
  const loss = evidence.acceptedResponseLossEvidence;
  expect(loss.acceptedStatus).toBe(200);
  expect(loss.providerWritesAfterReconciliation).toBe(1);
  expect(loss.transport.delay_ms).toBe(15000);
  const start = Date.parse(loss.transport.delay_started_at);
  const disconnect = Date.parse(loss.transport.client_disconnected_at);
  const release = Date.parse(loss.transport.delay_completed_at);
  expect(disconnect).toBeGreaterThan(start);
  expect(disconnect).toBeLessThan(release);
  expect(release - start).toBeGreaterThanOrEqual(15000);
  for (const [file, hash] of Object.entries(evidence.sourceFingerprints)) {
    expect(createHash("sha256").update(await readFile(file)).digest("hex"),
      `Hosted proof is stale for ${file}; rerun scripts/hosted-connector-proof.ts`,
    ).toBe(hash);
  }
});
