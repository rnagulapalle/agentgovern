import { expect, it, vi } from "vitest";
import { collectAwsInvocationWindow, type AwsInvocationLogsApi } from "./cloud-invocation-reader";
import type { DiscoveredRuntime } from "./cloud-discovery";
const at = "2026-10-14T20:00:00.000Z";
const runtime = (): DiscoveredRuntime => ({ scope: { tenantId: "tenant", connectionId: "aws", accountId: "123456789012", region: "us-west-2" }, source: "aws-agentcore-runtime", resourceId: "pricing-1234567890", resourceArn: "arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/pricing-1234567890", version: "1", observedAt: at, roleReference: null, workloadIdentityReference: null, gaps: ["runtime-identity-unavailable", "effective-permissions-unknown", "declared-tools-unknown"], coverage: { ownership: "unmapped", activity: "unconnected", enforcement: "unverified" } });
const window = () => ({ logGroup: `/aws/bedrock-agentcore/runtimes/${runtime().resourceId}-DEFAULT`, startTime: 1000, endTime: 2000 });
const event = () => ({ eventId: "event-1", timestamp: 1500, message: JSON.stringify({ account_id: "123456789012", resource_arn: runtime().resourceArn, request_id: "request-1", session_id: "session-1", operation: "InvokeAgentRuntime", request_payload: "PRIVATE-CUSTOMER-TEXT" }) });
const api = (value: unknown): AwsInvocationLogsApi => ({ callerIdentity: vi.fn(async () => ({ Account: "123456789012" })), listEvents: vi.fn(async () => value) });
it("reads only the enrolled source/window and projects observations without payload or success claims", async () => {
  const client = api({ events: [event()] });
  const result = await collectAwsInvocationWindow(client, runtime(), window());
  expect(result).toMatchObject({ completeness: "complete-api-traversal", enforcement: "unverified", toolActivity: "unknown" });
  expect(result.observations[0]).toMatchObject({ sourceEventId: "event-1", observation: { effectVerified: false, enrolledRuntimeVersion: "1" } });
  expect(JSON.stringify(result)).not.toContain("PRIVATE-CUSTOMER-TEXT");
  expect(client.listEvents).toHaveBeenCalledExactlyOnceWith({ logGroupName: window().logGroup, startTime: 1000, endTime: 2000, limit: 100 });
});
it("verifies account before reading logs", async () => {
  for (const callerIdentity of [async () => ({ Account: "999999999999" }), async () => { throw Error("private credential"); }]) {
    const client = { ...api({ events: [] }), callerIdentity };
    await expect(collectAwsInvocationWindow(client, runtime(), window())).rejects.toThrow(/^Observation caller/);
    expect(client.listEvents).not.toHaveBeenCalled();
  }
});
it.each([{ ...window(), logGroup: "/aws/other" }, { ...window(), logGroup: window().logGroup + "/foreign" }, { ...window(), startTime: -1 }, { ...window(), endTime: 1000 }, { ...window(), endTime: 9999999 }, { ...window(), extra: "bad" }])("refuses unreviewed source or unbounded window %j", async input => {
  const client = api({ events: [] });
  await expect(collectAwsInvocationWindow(client, runtime(), input)).rejects.toThrow("bounded time window");
  expect(client.callerIdentity).not.toHaveBeenCalled();
});
it("snapshots connection/window before waiting for identity", async () => {
  const input = window(); let release!: (v: unknown) => void;
  const client = { ...api({ events: [] }), callerIdentity: () => new Promise(r => { release = r; }) };
  const pending = collectAwsInvocationWindow(client, runtime(), input);
  input.startTime = 999; input.logGroup = "/aws/foreign"; release({ Account: "123456789012" });
  expect((await pending).source.startTime).toBe(1000);
});
it("deduplicates repeated events and detects conflicting event identity", async () => {
  const result = await collectAwsInvocationWindow(api({ events: [event(), event(), { ...event(), timestamp: 1600 }] }), runtime(), window());
  expect(result.observations).toHaveLength(1); expect(result.failures).toEqual(["conflicting-event"]); expect(result.completeness).toBe("partial");
});
it("retains unavailable/unsupported coverage and sanitizes read failures", async () => {
  const empty = await collectAwsInvocationWindow(api({ events: [] }), runtime(), window());
  expect(empty).toMatchObject({ completeness: "complete-api-traversal", observations: [], toolActivity: "unknown" });
  const unsupported = await collectAwsInvocationWindow(api({ events: [{ ...event(), message: "plain log" }] }), runtime(), window());
  expect(unsupported.unsupportedRecords).toBe(1); expect(unsupported.observations).toEqual([]);
  const failed = await collectAwsInvocationWindow({ ...api(null), listEvents: async () => { throw Error("private source and token"); } }, runtime(), window());
  expect(failed.failures).toEqual(["read-unavailable"]); expect(JSON.stringify(failed)).not.toContain("private");
});
it.each([null, {}, { events: [] , nextToken: "" }, { events: Array(101).fill(event()) }])("reports malformed page %j", async value => {
  expect((await collectAwsInvocationWindow(api(value), runtime(), window())).failures).toContain("invalid-page");
});
it.each([null, { ...event(), eventId: "bad/id" }, { ...event(), timestamp: 2000 }, { ...event(), timestamp: 999 }, { ...event(), message: "a".repeat(65537) }])("refuses malformed/outside-window event %j", async value => {
  expect((await collectAwsInvocationWindow(api({ events: [value] }), runtime(), window())).failures).toContain("invalid-event");
});
it("traverses opaque cursors and bounds cycle/page exhaustion", async () => {
  const listEvents = vi.fn().mockResolvedValueOnce({ events: [], nextToken: "opaque+/=" }).mockResolvedValueOnce({ events: [event()] });
  expect((await collectAwsInvocationWindow({ ...api(null), listEvents }, runtime(), window())).completeness).toBe("complete-api-traversal");
  expect(listEvents.mock.calls[1][0].nextToken).toBe("opaque+/=");
  expect((await collectAwsInvocationWindow(api({ events: [], nextToken: "same" }), runtime(), window())).failures).toEqual(["pagination-cycle"]);
  let i = 0;
  expect((await collectAwsInvocationWindow({ ...api(null), listEvents: async () => ({ events: [], nextToken: String(++i) }) }, runtime(), window())).failures).toEqual(["page-limit"]);
});
