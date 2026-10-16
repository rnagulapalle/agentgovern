import { describe, expect, it, vi } from "vitest";
import { collectExternalRunHistory, projectQuoteAgentRun } from "./external-run-history";
import type { DiscoveredRuntime } from "./cloud-discovery";
const at = "2026-10-15T18:00:00.000Z", start = "2026-10-15T17:00:00+00:00", end = "2026-10-15T17:00:02+00:00";
const binding = "a".repeat(64);
const runtime = (): DiscoveredRuntime => ({ scope: { tenantId: "tenant", connectionId: "aws", accountId: "342206308838", region: "us-west-2" },
  source: "aws-agentcore-runtime", resourceId: "pricing-1234567890", resourceArn: "arn:aws:bedrock-agentcore:us-west-2:342206308838:runtime/pricing-1234567890", version: "9", observedAt: at,
  roleReference: null, workloadIdentityReference: null, gaps: ["runtime-identity-unavailable", "effective-permissions-unknown", "declared-tools-unknown"], coverage: { ownership: "unmapped", activity: "unconnected", enforcement: "unverified" } });
const step = () => ({ name: "record_crm", status: "ok", started_at: start, finished_at: end, detail: { email: "private@example.invalid", token: "do-not-import" } });
const run = () => ({ id: "RUN-12345678", status: "completed", created_at: start, updated_at: end,
  inbound: { channel: "slack", text: "private message", sender_email: "private@example.invalid", external_id: "do-not-import" },
  discount: { requested_pct: 25, decision: "needs_approval" }, approval_decision: { decision: "approved", by: "private-person", at: end },
  steps: [step()], error: "private provider stack", effectVerified: true, enforcement: "verified" });
const api = (value: unknown) => ({ readRuns: vi.fn(async () => value) });
describe("external saved run observation never grants action authority", () => {
  it("shows reported steps and decisions without importing customer content or trusting verification flags", () => {
    const result = projectQuoteAgentRun(run());
    expect(result).toMatchObject({ runId: "RUN-12345678", reportedStatus: "completed", trigger: "slack", requestedDiscount: 25,
      reportedPolicyDecision: "needs_approval", reportedApprovalDecision: "approved", evidence: "agent-reported", effectVerified: false, approvalIdentityVerified: false, enforcement: "not-established" });
    expect(result?.steps).toEqual([{ sequence: 1, label: "Update CRM", reportedStatus: "ok", startedAt: "2026-10-15T17:00:00.000Z", finishedAt: "2026-10-15T17:00:02.000Z" }]);
    expect(JSON.stringify(result)).not.toMatch(/private|do-not-import|sender_email|detail|stack|external_id/);
  });
  it.each(["running", "awaiting_approval", "completed", "declined", "rejected", "needs_info", "triaged", "failed"])("preserves %s without guessing a verified outcome", status => {
    expect(projectQuoteAgentRun({ ...run(), status })).toMatchObject({ reportedStatus: status, effectVerified: false });
  });
  it("keeps missing decision evidence unknown and preserves repeated steps in source order", () => {
    const input = { ...run(), inbound: { channel: "email" }, discount: undefined, approval_decision: undefined,
      steps: [{ ...step(), name: "custom_internal_secret", status: "skipped", finished_at: undefined }, step(), step()] };
    expect(projectQuoteAgentRun(input)).toMatchObject({ trigger: "email", requestedDiscount: null, reportedPolicyDecision: null, reportedApprovalDecision: null,
      steps: [{ sequence: 1, label: "Other workflow step", finishedAt: null }, { sequence: 2 }, { sequence: 3 }] });
    expect(JSON.stringify(projectQuoteAgentRun(input))).not.toContain("custom_internal_secret");
  });
  it.each([null, [], {}, { ...run(), id: "bad/id" }, { ...run(), status: "verified" }, { ...run(), inbound: { channel: ["slack"] } },
    { ...run(), discount: { requested_pct: "25", decision: "needs_approval" } }, { ...run(), discount: { requested_pct: 101 } },
    { ...run(), discount: { decision: ["decline"] } }, { ...run(), approval_decision: { decision: ["approved"] } },
    { ...run(), steps: Array(101).fill(step()) }, { ...run(), steps: [{ ...step(), status: "verified" }] },
    { ...run(), steps: [{ ...step(), finished_at: undefined }] }, { ...run(), steps: [{ ...step(), started_at: "2026-10-15T18:00:00Z" }] },
    { ...run(), steps: [{ ...step(), finished_at: "2026-10-15T16:00:00Z" }] }, { ...run(), updated_at: "2026-02-30T17:00:02Z" },
    { ...run(), updated_at: "2026-10-15T16:00:00Z" }])("rejects malformed or misleading run %#", value => { expect(projectQuoteAgentRun(value)).toBeNull(); });
  it("reads only a finite window and does not attest historical execution version from current inventory", async () => {
    const source = api({ runs: [run()], secrets: "not-imported" });
    const result = await collectExternalRunHistory(source, runtime(), binding, at);
    expect(source.readRuns).toHaveBeenCalledWith({ limit: 50 });
    expect(result).toMatchObject({ status: "observed", coverage: "latest-50-only", source: { enrolledRuntimeVersion: "9", executionVersion: "unknown" }, failures: [] });
    expect(JSON.stringify(result)).not.toContain("not-imported");
  });
  it("distinguishes empty observed history, invalid rows, duplicates and unavailable source", async () => {
    expect(await collectExternalRunHistory(api({ runs: [] }), runtime(), binding, at)).toMatchObject({ status: "observed", runs: [], failures: [] });
    expect(await collectExternalRunHistory(api({ runs: [run(), run(), {}] }), runtime(), binding, at)).toMatchObject({ status: "partial", failures: ["duplicate-run", "invalid-run"] });
    const result = await collectExternalRunHistory({ readRuns: async () => { throw Error("private error token"); } }, runtime(), binding, at);
    expect(result).toMatchObject({ status: "unavailable", runs: [], failures: ["read-unavailable"] });
    expect(JSON.stringify(result)).not.toContain("private error token");
  });
  it.each([null, {}, { runs: Array(51).fill(run()) }])("refuses unsupported pages %#", async value => {
    expect(await collectExternalRunHistory(api(value), runtime(), binding, at)).toMatchObject({ status: "unavailable", failures: ["invalid-response"] });
  });
  it("rejects future evidence, oversized and unserializable responses", async () => {
    expect(await collectExternalRunHistory(api({ runs: [{ ...run(), updated_at: "2026-10-16T17:00:02Z" }] }), runtime(), binding, at)).toMatchObject({ status: "partial", runs: [], failures: ["invalid-run"] });
    for (const value of [{ runs: [], raw: "a".repeat(1_048_577) }, { runs: [], number: BigInt(1) }])
      expect(await collectExternalRunHistory(api(value), runtime(), binding, at)).toMatchObject({ status: "unavailable", failures: ["read-unavailable"] });
  });
  it("refuses cross-account or unreviewed bindings before reading; snapshots runtime enrollment", async () => {
    const source = api({ runs: [] });
    await expect(collectExternalRunHistory(source, { ...runtime(), resourceArn: "foreign" }, binding, at)).rejects.toThrow();
    await expect(collectExternalRunHistory(source, runtime(), "browser-url", at)).rejects.toThrow();
    await expect(collectExternalRunHistory(source, runtime(), binding, at, 0)).rejects.toThrow();
    expect(source.readRuns).not.toHaveBeenCalled();
    const input = runtime(); let resolve!: (v: unknown) => void;
    const pending = collectExternalRunHistory({ readRuns: () => new Promise(r => { resolve = r; }) }, input, binding, at);
    input.version = "10"; resolve({ runs: [] });
    expect((await pending).source.enrolledRuntimeVersion).toBe("9");
  });
  it("bounds a stalled source without returning untrusted errors", async () => {
    expect(await collectExternalRunHistory({ readRuns: () => new Promise(() => {}) }, runtime(), binding, at, 5)).toMatchObject({ status: "unavailable", failures: ["read-unavailable"] });
  });
});
