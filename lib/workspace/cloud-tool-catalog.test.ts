import { describe, expect, it, vi } from "vitest";
import { collectToolCatalog, type ToolCatalogApi } from "./cloud-tool-catalog";
import { projectInvocationObservation } from "./cloud-invocation-observation";
import type { DiscoveredRuntime } from "./cloud-discovery";
const at = "2026-10-14T20:00:00.000Z";
const runtime = (): DiscoveredRuntime => ({ scope: { tenantId: "tenant", connectionId: "aws", accountId: "123456789012", region: "us-west-2" },
  source: "aws-agentcore-runtime", resourceId: "pricing-1234567890", resourceArn: "arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/pricing-1234567890", version: "1", observedAt: at,
  roleReference: null, workloadIdentityReference: null, gaps: ["runtime-identity-unavailable", "effective-permissions-unknown", "declared-tools-unknown"], coverage: { ownership: "unmapped", activity: "unconnected", enforcement: "unverified" } });
const binding = "a".repeat(64);
const tool = () => ({ name: "request_discount", title: "Request a discount", description: "Propose a quote change; this declaration grants no authority.", inputSchema: { type: "object", properties: { percent: { type: "number" } } } });
const api = (value: unknown): ToolCatalogApi => ({ listTools: vi.fn(async () => value) });

describe("declared tool observation, separate from enrollment and authority", () => {
  it("collects declared metadata from exact runtime/source context without turning hints into rights", async () => {
    const row = { ...tool(), annotations: { readOnlyHint: true, destructiveHint: false }, icons: [{ src: "https://not-fetched.invalid" }], secret: "discarded-extension" };
    const result = await collectToolCatalog(api({ tools: [row], credentials: "discarded-root" }), runtime(), binding, at);
    expect(result).toMatchObject({ runtimeVersion: "1", completeness: "complete-api-traversal", authority: "not-established", activity: "not-observed", failures: [] });
    expect(result.tools[0]).toMatchObject({ name: row.name, title: row.title, description: row.description, inputSchema: row.inputSchema, outputSchema: null });
    expect(result.tools[0].descriptorHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toMatch(/readOnlyHint|destructiveHint|icons|discarded|credentials/);
  });
  it("keeps complete empty traversal distinct from missing/unavailable evidence", async () => {
    expect((await collectToolCatalog(api({ tools: [] }), runtime(), binding, at)).completeness).toBe("complete-api-traversal");
    const result = await collectToolCatalog({ listTools: async () => { throw Error("private endpoint credential"); } }, runtime(), binding, at);
    expect(result).toMatchObject({ completeness: "partial", tools: [], failures: ["unavailable"] });
    expect(JSON.stringify(result)).not.toContain("private endpoint");
  });
  it("paginates using opaque cursors and preserves previous tools on later failure", async () => {
    const listTools = vi.fn().mockResolvedValueOnce({ tools: [tool()], nextCursor: "opaque+/=" }).mockRejectedValueOnce(Error("private"));
    const result = await collectToolCatalog({ listTools }, runtime(), binding, at);
    expect(listTools.mock.calls).toEqual([[{}], [{ cursor: "opaque+/=" }]]);
    expect(result.tools).toHaveLength(1); expect(result.completeness).toBe("partial");
  });
  it("canonical hashes ignore object ordering but change with descriptions or schemas", async () => {
    const first = (await collectToolCatalog(api({ tools: [tool()] }), runtime(), binding, at)).tools[0];
    const reversed = { ...tool(), inputSchema: { properties: { percent: { type: "number" } }, type: "object" } };
    expect((await collectToolCatalog(api({ tools: [reversed] }), runtime(), binding, at)).tools[0].descriptorHash).toBe(first.descriptorHash);
    expect((await collectToolCatalog(api({ tools: [{ ...tool(), description: "Changed" }] }), runtime(), binding, at)).tools[0].descriptorHash).not.toBe(first.descriptorHash);
    expect((await collectToolCatalog(api({ tools: [{ ...tool(), inputSchema: { type: "object" } }] }), runtime(), binding, at)).tools[0].descriptorHash).not.toBe(first.descriptorHash);
  });
  it("keeps duplicate names ambiguous and never claims a complete usable catalog", async () => {
    const result = await collectToolCatalog(api({ tools: [tool(), { ...tool(), description: "Different target" }] }), runtime(), binding, at);
    expect(result.completeness).toBe("partial"); expect(result.failures).toEqual(["duplicate-tool"]);
  });
  it("detects cursor cycles and page exhaustion", async () => {
    expect((await collectToolCatalog(api({ tools: [], nextCursor: "same" }), runtime(), binding, at)).failures).toEqual(["pagination-cycle"]);
    let n = 0;
    const result = await collectToolCatalog({ listTools: async () => ({ tools: [], nextCursor: `cursor-${++n}` }) }, runtime(), binding, at);
    expect(result.failures).toEqual(["page-limit"]); expect(n).toBe(20);
  });
  it.each([null, {}, [], { tools: null }, { tools: Array(101).fill(tool()) }, { tools: [], nextCursor: "" }, { tools: [], nextCursor: null }, { tools: [], nextCursor: "bad cursor" }])("refuses malformed page %j", async value => {
    const result = await collectToolCatalog(api(value), runtime(), binding, at);
    expect(result.completeness).toBe("partial"); expect(result.failures).toContain("invalid-page");
  });
  it.each([{ ...tool(), name: "bad/tool" }, { ...tool(), name: "" }, { ...tool(), description: "a".repeat(4097) }, { ...tool(), title: "bad\u0000title" }, { ...tool(), inputSchema: null }, { ...tool(), outputSchema: [] }, { ...tool(), inputSchema: { type: "object", description: "a".repeat(66000) } }])("refuses unsupported descriptor %j", async value => {
    const result = await collectToolCatalog(api({ tools: [value] }), runtime(), binding, at);
    expect(result).toMatchObject({ completeness: "partial", tools: [], failures: ["invalid-tool"] });
  });
  it("snapshots source metadata and rejects an unreviewed binding before transport", async () => {
    const client = api({ tools: [tool()] });
    await expect(collectToolCatalog(client, runtime(), "https://untrusted.invalid", at)).rejects.toThrow("binding");
    expect(client.listTools).not.toHaveBeenCalled();
    const input = runtime(); let resolve!: (v: unknown) => void;
    const pending = collectToolCatalog({ listTools: () => new Promise(r => { resolve = r; }) }, input, binding, at);
    input.version = "2"; resolve({ tools: [tool()] });
    expect((await pending).runtimeVersion).toBe("1");
  });
  it("refuses tampered runtime identity and forged coverage before tool discovery", async () => {
    const client = api({ tools: [] });
    await expect(collectToolCatalog(client, { ...runtime(), resourceArn: "foreign" }, binding, at)).rejects.toThrow();
    await expect(collectToolCatalog(client, { ...runtime(), coverage: { ...runtime().coverage, enforcement: "verified" } } as never, binding, at)).rejects.toThrow();
    expect(client.listTools).not.toHaveBeenCalled();
  });
  it("times out a nonresponsive discovery transport and validates its deadline", async () => {
    const result = await collectToolCatalog({ listTools: () => new Promise(() => {}) }, runtime(), binding, at, 5);
    expect(result).toMatchObject({ completeness: "partial", failures: ["unavailable"] });
    const client = api({ tools: [] });
    await expect(collectToolCatalog(client, runtime(), binding, at, 0)).rejects.toThrow("timeout");
    expect(client.listTools).not.toHaveBeenCalled();
  });
  it("refuses excessive schema nesting and records no schema conformance claim", async () => {
    let nested: Record<string, unknown> = { type: "string" };
    for (let i = 0; i < 20; i++) nested = { type: "object", properties: { child: nested } };
    const result = await collectToolCatalog(api({ tools: [{ ...tool(), inputSchema: nested }] }), runtime(), binding, at);
    expect(result).toMatchObject({ completeness: "partial", failures: ["invalid-tool"], schemaConformance: "not-established" });
  });
  it("handles overlong or unserializable transport results without returning raw data", async () => {
    for (const value of [{ tools: [], raw: "x".repeat(1_048_577) }, { tools: [], bigint: BigInt(1) }])
      expect((await collectToolCatalog(api(value), runtime(), binding, at)).failures).toEqual(["unavailable"]);
  });
});

const log = () => ({ resource_arn: runtime().resourceArn, account_id: "123456789012", operation: "InvokeAgentRuntime", request_id: "request-1", session_id: "session-1", trace_id: "a".repeat(32), span_id: "b".repeat(16), request_payload: { password: "never-retain", message: "private customer text" } });
describe("AWS invocation observation is not tool enforcement or an execution receipt", () => {
  it("projects only correlation metadata, never request/output payloads or success", () => {
    const result = projectInvocationObservation(JSON.stringify({ ...log(), response_payload: "private response", status: "completed" }), runtime());
    expect(result).toMatchObject({ requestId: "request-1", sessionId: "session-1", evidence: "reported-invocation", effectVerified: false, toolActivity: "unknown" });
    expect(JSON.stringify(result)).not.toMatch(/never-retain|private|response_payload|completed|password/);
  });
  it("missing optional trace IDs does not invent correlation", () => {
    const row = { ...log(), trace_id: undefined, span_id: undefined };
    expect(projectInvocationObservation(JSON.stringify(row), runtime())).toMatchObject({ traceId: null, spanId: null });
  });
  it.each([{ ...log(), account_id: "999999999999" }, { ...log(), resource_arn: "foreign" }, { ...log(), operation: "SendEmail" }, { ...log(), request_id: "" }, { ...log(), session_id: "bad/session" }, { ...log(), trace_id: "bad" }, { ...log(), trace_id: 11111111111111111111111111111111 }, { ...log(), span_id: 1111111111111111 }, { ...log(), span_id: "bad" }, null])("rejects mismatched or malformed observation %j", value => {
    expect(projectInvocationObservation(JSON.stringify(value), runtime())).toBeNull();
  });
  it("rejects malformed or oversized logs and forged enrollment", () => {
    expect(projectInvocationObservation("not json", runtime())).toBeNull();
    expect(projectInvocationObservation("a".repeat(65537), runtime())).toBeNull();
    expect(projectInvocationObservation(JSON.stringify(log()), { ...runtime(), version: "latest" })).toBeNull();
  });
});
