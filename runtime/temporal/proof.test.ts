import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { it, expect } from "vitest";
it("requires actual Temporal fault/replay evidence matching its implementation", () => {
  const proof = JSON.parse(readFileSync("docs/evidence/temporal-proof.json", "utf8"));
  expect(proof.checks.length).toBeGreaterThanOrEqual(7);
  expect(proof.checks.some((s: string) => s.includes("SIGKILL"))).toBe(true);
  expect(proof.checks.some((s: string) => s.includes("Incompatible"))).toBe(true);
  for (const [file, hash] of Object.entries(proof.sourceFingerprints))
    expect(createHash("sha256").update(readFileSync(file)).digest("hex"), file).toBe(hash);
  expect(proof.scope).toContain("no production cutover");
});

it("requires persisted-service restart and pinned-routing evidence matching implementation", () => {
  const proof = JSON.parse(readFileSync("docs/evidence/temporal-version-proof.json", "utf8"));
  expect(proof.checks.length).toBeGreaterThanOrEqual(7);
  for (const marker of ["routes new runs", "service restart", "only v2", "revoked owner", "Unsupported", "replays"]) {
    expect(proof.checks.join(" ").toLowerCase()).toContain(marker.toLowerCase() === "unsupported" ? "unknown connector" : marker.toLowerCase());
  }
  for (const [file, hash] of Object.entries(proof.sourceFingerprints))
    expect(createHash("sha256").update(readFileSync(file)).digest("hex"), file).toBe(hash);
  expect(proof.scope).toContain("no production cutover");
});
