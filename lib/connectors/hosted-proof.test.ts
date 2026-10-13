import {readHistoricalProof} from '../../scripts/historical-proof-sources.mjs';
import { createHash } from "node:crypto";
import { it, expect } from "vitest";
import evidence from "../../docs/evidence/hosted-connector-proof.json";

it("historical original measurement: keeps hosted proof tied to its implementation and independently observed response loss", async () => {
 const historical=readHistoricalProof('hosted-connector-proof.json');expect(historical).toMatchObject({historical:true,eligible:false,releaseAccepted:false,currentSourceValidated:false});expect(historical.receipt).toEqual(evidence);
  expect(evidence.checks).toHaveLength(8);
  expect(evidence.checks.some(check=>check.name.includes("Installed migration23"))).toBe(true);
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
  expect(Object.keys(evidence.sourceFingerprints)).toEqual(expect.arrayContaining(["lib/workspace/membership-authority.ts","lib/workspace/membership-authority-schema.sql","lib/quotes/schema.sql","lib/quotes/authority-schema.sql","lib/quotes/plan-v2-schema.sql","lib/quotes/membership-schema.sql"]));
  for (const [file, hash] of Object.entries(evidence.sourceFingerprints)) {
    expect(createHash("sha256").update(historical.sources[file]).digest("hex"),
      `Archived hosted connector source bytes changed for ${file}`,
    ).toBe(hash);
  }
});
