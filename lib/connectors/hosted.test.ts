import { afterEach, expect, it, vi } from "vitest";
import { HostedFetchSandboxConnectors, connectorProvider, type HostedBinding } from "./hosted";
import { FetchSandboxConnectors } from "./twin";
import type { ConnectorAction } from "./contracts";
const binding = (): HostedBinding => ({ origin: "http://127.0.0.1:8019", ownerKey: "fsk_" + "a".repeat(40), workspaceId: "local-proof", contactId: "1001", legs: { crm: { sandboxId: "a".repeat(10), apiKey: "c".repeat(40) }, email: { sandboxId: "b".repeat(10), apiKey: "e".repeat(40) } } });
const action = (connector: "crm" | "email" = "email") => ({ id: "proof-id", org_id: "local-proof", connector, payload: connector === "crm" ? { lifecycle: "customer" } : { template: "case_received" } }) as ConnectorAction;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it.each([null, { origin: "https://api.resend.com" }, { origin: "https://fetchsandbox.com/" }, { ownerKey: "bad" }, { workspaceId: "" }, { contactId: "../escape" }, { legs: {} }])("rejects unsafe or incomplete binding %j", value => {
  expect(() => new HostedFetchSandboxConnectors(value === null ? value as unknown as HostedBinding : { ...binding(), ...value } as unknown as HostedBinding)).toThrow();
});
it("rejects malformed legs and shared environments", () => {
  for (const property of ["sandboxId", "apiKey"] as const) {
    const b = binding(); b.legs.email[property] = "bad";
    expect(() => new HostedFetchSandboxConnectors(b)).toThrow();
  }
  const b = binding(); b.legs.email.sandboxId = b.legs.crm.sandboxId;
  expect(() => new HostedFetchSandboxConnectors(b)).toThrow();
});
it("keeps legacy default, rejects malformed opt-in, and selects explicit hosted binding", () => {
  vi.stubEnv("LOOPLABS_CONNECTOR_TWIN_URL", "http://127.0.0.1:8018"); vi.stubEnv("LOOPLABS_CONNECTOR_TWIN_TOKEN", "t".repeat(40));
  vi.stubEnv("LOOPLABS_FETCHSANDBOX_BINDING", ""); expect(connectorProvider()).toBeInstanceOf(FetchSandboxConnectors);
  vi.stubEnv("LOOPLABS_FETCHSANDBOX_BINDING", "{"); expect(() => connectorProvider()).toThrow();
  vi.stubEnv("LOOPLABS_FETCHSANDBOX_BINDING", JSON.stringify(binding())); expect(connectorProvider()).toBeInstanceOf(HostedFetchSandboxConnectors);
});
it("preserves authorization, bounded transport and stable effect identity", async () => {
  const p = new HostedFetchSandboxConnectors(binding());
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  vi.spyOn(p, "inspect").mockResolvedValue({ outcome: "verified", detail: "checked" });
  await p.write(action(), false);
  expect(fetch.mock.calls[0][0]).toBe("http://127.0.0.1:8019/sandbox/bbbbbbbbbb/emails");
  expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: "error", cache: "no-store", headers: { Authorization: "Bearer " + binding().legs.email.apiKey, "X-Flow-Run-Id": "looplabs-proof-id", "Idempotency-Key": "looplabs-proof-id" } });
  fetch.mockResolvedValue(new Response("{}", { status: 403 })); await expect(p.contact()).rejects.toThrow();
});
it("does not send unsupported CRM writes or caller-supplied fault injection", async () => {
  const p = new HostedFetchSandboxConnectors(binding()); const fetch = vi.spyOn(globalThis, "fetch");
  expect((await p.write(action("crm"), false)).outcome).toBe("unknown");
  expect((await p.inspect(action("crm"))).outcome).toBe("unknown");
  await expect(p.write(action(), true)).rejects.toMatchObject({ status: 400 });
  for (const fn of [p.write.bind(p), p.inspect.bind(p)]) await expect(fn({ ...action(), org_id: "other" }, false)).rejects.toMatchObject({ status: 403 });
  expect(fetch).not.toHaveBeenCalled();
});
it("reads the exact contact source and rejects missing or mismatched versions", async () => {
  const p = new HostedFetchSandboxConnectors(binding());
  expect(await p.source("email")).toBeNull();
  const contact = vi.spyOn(p, "contact").mockResolvedValue({ id: "1001", updatedAt: "v1" });
  expect(await p.source("crm")).toBe("v1");
  for (const r of [{ id: "wrong", updatedAt: "v1" }, { id: "1001" }, { id: "1001", updatedAt: "" }]) { contact.mockResolvedValue(r); await expect(p.source("crm")).rejects.toThrow(); }
});
function evidence(p: HostedFetchSandboxConnectors, id = "email_1") { return { payload: { flow_run_id: "looplabs-proof-id", method: "POST", path: "/emails", response_status: 200, request_body: p.body(action()), response_body: { id } } }; }
it("requires correlated acceptance plus matching independent readback, not delivery labels", async () => {
  const p = new HostedFetchSandboxConnectors(binding());
  const request = vi.spyOn(p, "request").mockResolvedValueOnce({ events: [evidence(p), evidence(p)] }).mockResolvedValueOnce({ id: "email_1", ...p.body(action()), last_event: "sent" });
  expect((await p.inspect(action())).outcome).toBe("verified");
  expect(request.mock.calls[0][0]).toContain("flow_run_id=looplabs-proof-id");
  expect(request.mock.calls[0][1]).toBe(binding().ownerKey); expect(request.mock.calls[1][1]).toBe(binding().legs.email.apiKey);
});
it.each([{}, { events: Array(101).fill({}) }])("fails closed on unavailable or truncated archive %j", async archive => {
  const p = new HostedFetchSandboxConnectors(binding()); vi.spyOn(p, "request").mockResolvedValue(archive);
  await expect(p.inspect(action())).rejects.toThrow();
});
it("cannot verify missing acceptance, wrong correlation, path, method or error status", async () => {
  const p = new HostedFetchSandboxConnectors(binding()); const request = vi.spyOn(p, "request");
  for (const change of [{ flow_run_id: "other" }, { method: "GET" }, { path: "/other" }, { response_status: 503 }, { response_status: "200" }]) {
    request.mockResolvedValue({ events: [{ payload: { ...evidence(p).payload, ...change } }] });
    expect((await p.inspect(action())).outcome).toBe("unknown");
  }
});
it("detects duplicate effects, changed payload and invalid provider identity", async () => {
  const p = new HostedFetchSandboxConnectors(binding()); const request = vi.spyOn(p, "request");
  for (const events of [[evidence(p), evidence(p, "email_2")], [{ payload: { ...evidence(p).payload, request_body: {} } }], [evidence(p, "../escape")], [{ payload: { ...evidence(p).payload, response_body: {} } }]]) {
    request.mockResolvedValue({ events }); expect((await p.inspect(action())).outcome).toBe("conflict");
  }
});
it.each(["id", "from", "to", "subject", "text"])("rejects mismatched %s in provider state", async key => {
  const p = new HostedFetchSandboxConnectors(binding()); const record = { id: "email_1", ...p.body(action()), [key]: "wrong" };
  vi.spyOn(p, "request").mockResolvedValueOnce({ events: [evidence(p)] }).mockResolvedValueOnce(record);
  expect((await p.inspect(action())).outcome).toBe("conflict");
});
