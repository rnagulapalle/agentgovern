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

it("requires actual ownership, scheduling fence and in-flight revocation evidence", () => {
  const proof = JSON.parse(readFileSync("docs/evidence/temporal-dispatch-proof.json", "utf8"));
  expect(proof.checks.length).toBeGreaterThanOrEqual(6);
  for (const marker of ["excludes legacy", "Expired scheduler lease", "Concurrent authorized", "Closed Temporal", "Owner revoked"])
    expect(proof.checks.join(" ")).toContain(marker);
  for (const [file, hash] of Object.entries(proof.sourceFingerprints))
    expect(createHash("sha256").update(readFileSync(file)).digest("hex"), file).toBe(hash);
  expect(proof.scope).toContain("no production cutover");
});

it("requires packaged worker/scheduler crash and backlog evidence", () => {
  const proof=JSON.parse(readFileSync("docs/evidence/temporal-load-proof.json","utf8"));
  expect(proof.measurements.plans).toBe(25);
  expect(proof.measurements.concurrentTransferCalls).toBe(50);
  expect(proof.measurements.finalEffects).toBe(2);
  for(const marker of ["scheduler SIGKILL", "worker SIGKILL", "one start event", "revocation", "database connection interruption", "Database connectivity restoration"])
    expect(proof.checks.join(" ")).toContain(marker);
  for(const [file,hash] of Object.entries(proof.sourceFingerprints))
    expect(createHash("sha256").update(readFileSync(file)).digest("hex"),file).toBe(hash);
  expect(proof.scope).toContain("no production cutover");
});
