import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import proof from "../../docs/evidence/chat-ui-proof.json";
it("requires fresh recorded UI/model/twin proof and keeps unsupported hosted execution explicit", async () => {
  expect(proof.checks.length).toBeGreaterThanOrEqual(11);
  expect(proof.checks.every(c => c.passed)).toBe(true);
  expect(proof.checks.some(c => c.name.includes("no background route prefetch"))).toBe(true);
  expect(proof.scope).toContain("Real browser, real Amazon Bedrock");
  expect(proof.typedRequest).toContain("ask me before sending");
  expect(proof.managedRuns).toHaveLength(2);
  expect(proof.managedRuns.every(r => r.state === "completed")).toBe(true);
  expect(proof.checks.some(c => c.name.includes("both browsers away"))).toBe(true);
  expect(proof.checks.some(c => c.name.includes("worker restart"))).toBe(true);
  expect(proof.observedRuns).toHaveLength(3);
  expect(Object.keys(proof.providerEffects)).toHaveLength(5);
  expect(proof.unsupported.some(s => s.includes("atomic CRM contact-version"))).toBe(true);
  for (const [file, hash] of Object.entries(proof.sourceFingerprints)) {
    expect(createHash("sha256").update(await readFile(file)).digest("hex"), `Chat UI proof is stale for ${file}; rerun pnpm chat:proof`).toBe(hash);
  }
});
