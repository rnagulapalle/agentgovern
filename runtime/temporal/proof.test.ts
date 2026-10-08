import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { it, expect } from "vitest";
it("requires a real application-database archive restore and refusal of resurrected authority", () => {
  const proof = JSON.parse(readFileSync("docs/evidence/workspace-restore-proof.json", "utf8"));
  expect(proof.measurements).toMatchObject({ restoredRuns: 2, finalEffects: 2 });
  expect(proof.measurements.restoreAndReconcileMs).toBeGreaterThan(0);
  expect(proof.backupHash).toMatch(/^[0-9a-f]{64}$/);
  for (const marker of ["custom archive", "Real pg_restore", "resurrected credentials", "idempotent restore quarantine", "unknown held actions stay uncertain"])
    expect(proof.checks.join(" ")).toContain(marker);
  for (const [file, hash] of Object.entries(proof.sourceFingerprints))
    expect(createHash("sha256").update(readFileSync(file)).digest("hex"), file).toBe(hash);
  expect(proof.scope).toContain("no production cutover");
});
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
  expect(proof.measurements.databaseReplacementAttempts).toEqual({ worker: 2, scheduler: 2 });
  for(const marker of ["scheduler SIGKILL", "worker SIGKILL", "one start event", "revocation", "database connection interruption", "Database connectivity restoration"])
    expect(proof.checks.join(" ")).toContain(marker);
  for(const [file,hash] of Object.entries(proof.sourceFingerprints))
    expect(createHash("sha256").update(readFileSync(file)).digest("hex"),file).toBe(hash);
  expect(proof.scope).toContain("no production cutover");
});


it("requires real authenticated container, namespace, rotation and persistence recovery evidence", () => {
  const proof=JSON.parse(readFileSync("docs/evidence/temporal-container-proof.json","utf8"));
  expect(proof.measurements.plans).toBe(25);
  expect(proof.measurements.finalEffects).toBe(2);
  expect(proof.measurements.databaseReplacementAttempts).toEqual({ worker: 2, scheduler: 2 });
  expect(proof.measurements.snapshotRestoreToCompletedMs).toBeGreaterThan(0);
  for(const marker of ["trusted mTLS", "another namespace", "tampered signed JWT", "missing/untrusted client certificates", "Signing-key rotation", "persistence PostgreSQL SIGKILL", "pre-effect Temporal PostgreSQL backup"])
    expect(proof.checks.join(" ")).toContain(marker);
  expect(proof.workerImage.id).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(proof.imageIds).toHaveLength(3);
  for(const [file,hash] of Object.entries(proof.sourceFingerprints))
    expect(createHash("sha256").update(readFileSync(file)).digest("hex"),file).toBe(hash);
  expect(proof.scope).toContain("no production cutover");
});

it("requires actual monitor-process alert delivery and restart evidence", () => {
  const proof = JSON.parse(readFileSync("docs/evidence/temporal-alert-proof.json", "utf8"));
  expect(proof.checks).toHaveLength(6);
  expect(proof.measurements).toEqual({ deliveryAttempts: 7, uniqueTransitions: 6, lostResponseAttempts: 2 });
  expect(proof.scope).toContain("no designated operator notification");
  for (const [file, hash] of Object.entries(proof.sourceFingerprints))
    expect(createHash("sha256").update(readFileSync(file)).digest("hex"), file).toBe(hash);
});

it("requires actual packaged independent-record routing and refusal evidence",()=>{
 const proof=JSON.parse(readFileSync("docs/evidence/temporal-record-proof.json","utf8"));
 expect(proof.measurements).toEqual({records:10,transferCalls:20,completed:9,contained:1,effects:18});
 for(const marker of ["immutable routes","explicitly pinned", "SIGKILL", "lost CRM HTTP response", "Revoked tenth", "histories replay"])
  expect(proof.checks.join(" ")).toContain(marker);
 expect(proof.buildId).toMatch(/^ack-[a-f0-9]{64}$/);
 for(const [file,hash] of Object.entries(proof.sourceFingerprints))expect(createHash("sha256").update(readFileSync(file)).digest("hex"),file).toBe(hash);
 expect(proof.scope).toContain("no production cutover");
});

it("requires actual paced approved-record load and measured completion observations",()=>{
 const proof=JSON.parse(readFileSync("docs/evidence/temporal-approved-load-proof.json","utf8"));
 expect(proof.measurements).toEqual({records:40,transferCalls:80,completed:39,contained:1,effects:78});
 expect(proof.observationWindowMs).toBeGreaterThanOrEqual(60000);
 expect(proof.approvalToObservedCompletionMs).toHaveLength(39);
 expect(proof.approvalToObservedCompletionMs.map((s:{ordinal:number})=>s.ordinal).sort((a:number,b:number)=>a-b)).toEqual(Array.from({length:39},(_,i)=>i+1));
 for(const sample of proof.approvalToObservedCompletionMs){expect(Number.isInteger(sample.approvalToObservedCompletionMs)).toBe(true);expect(sample.approvalToObservedCompletionMs).toBeGreaterThanOrEqual(0);}
 for(const marker of ["four", "SIGKILL", "duplicate approvals", "Four real lost", "Revoked fortieth", "histories replay"])expect(proof.checks.join(" ").toLowerCase()).toContain(marker.toLowerCase());
 expect(proof.sampleLimits).toContain("not steady-state throughput");
 for(const [file,hash] of Object.entries(proof.sourceFingerprints))expect(createHash("sha256").update(readFileSync(file)).digest("hex"),file).toBe(hash);
});

it("requires actual shared-agent last-slot contention without overspend or rejected execution",()=>{
 const proof=JSON.parse(readFileSync("docs/evidence/temporal-shared-agent-proof.json","utf8"));
 expect(proof.measurements).toEqual({records:10,transferCalls:20,completed:9,contained:1,effects:18});
 expect(proof.sharedAgents).toBe(2);expect(proof.perAgentAllowance).toBe(10);expect(proof.enrolledCustomers).toBe(12);
 expect(proof.concurrentFinalSlotCandidates).toBe(3);expect(proof.admittedFinalSlotCandidates).toBe(1);expect(proof.deniedFinalSlotCandidates).toBe(2);
 for(const marker of ["one admitted, two denied", "exactly ten reservations", "SIGKILL", "lost CRM HTTP response", "rejected contenders", "histories replay", "remain capped after execution"])expect(proof.checks.join(" ")).toContain(marker);
 for(const [file,hash] of Object.entries(proof.sourceFingerprints))expect(createHash("sha256").update(readFileSync(file)).digest("hex"),file).toBe(hash);
 expect(proof.scope).toContain("no production cutover");
});
