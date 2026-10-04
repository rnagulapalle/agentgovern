import { afterEach, describe, it, expect, vi } from "vitest";
import { FetchSandboxConnectors } from "./twin";
import type { ConnectorAction } from "./contracts";
const token = "a".repeat(40);
const a = (connector: "crm" | "email" = "crm") =>
  ({
    id: "proof-id",
    connector,
    payload:
      connector === "crm"
        ? { lifecycle: "customer" }
        : { template: "case_received" },
  }) as ConnectorAction;
afterEach(() => vi.restoreAllMocks());
describe("Private connector adapter", () => {
  it("refuses live, arbitrary, missing and malformed provider credentials", () => {
    for (const [base, key] of [
      ["https://api.hubapi.com", token],
      ["http://localhost:8018", token],
      ["", token],
      ["http://127.0.0.1:8018", "bad"],
    ])
      expect(() => new FetchSandboxConnectors(base, key)).toThrow();
    expect(
      new FetchSandboxConnectors("http://connector-twin:8018", token)
        .workspaceId,
    ).toBe("local-proof");
  });
  it("uses bounded requests, stable identity and exact server-owned payload", async () => {
    const p = new FetchSandboxConnectors("http://127.0.0.1:8018", token);
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("{}"));
    vi.spyOn(p, "inspect").mockResolvedValue({
      outcome: "verified",
      detail: "checked",
    });
    await p.write(a(), true);
    let [url, init] = fetch.mock.calls[0];
    expect(url).toContain("/crm/crm/v3/objects/contacts/1001");
    expect(init?.method).toBe("PATCH");
    expect(init?.headers).toMatchObject({
      "Idempotency-Key": "looplabs-proof-id",
      "X-LoopLabs-Lose-Response": "true",
    });
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeTruthy();
    await p.write(a("email"), false);
    [url, init] = fetch.mock.calls[1];
    expect(url).toContain("/email/emails");
    expect(init?.method).toBe("POST");
    expect(init?.body).toContain("customer@example.test");
    expect(init?.headers).not.toHaveProperty("X-LoopLabs-Lose-Response");
    fetch.mockResolvedValue(new Response("{}", { status: 429 }));
    await expect(p.request("/x")).rejects.toMatchObject({ status: 503 });
  });
  it("verifies exact CRM read-back including fixture record version", async () => {
    const p = new FetchSandboxConnectors("http://127.0.0.1:8018", token);
    const effect = {
      actionId: "proof-id",
      connector: "crm",
      body: p.body(a()),
      reference: "1001",
      observedVersion: "v1",
    };
    const request = vi
      .spyOn(p, "request")
      .mockResolvedValueOnce(effect)
      .mockResolvedValueOnce({
        id: "1001",
        properties: { lifecyclestage: "customer" },
        updatedAt: "v1",
      });
    expect((await p.inspect(a())).outcome).toBe("verified");
    expect(request.mock.calls[1][0]).toContain("/1001");
    for (const r of [
      {
        id: "1002",
        properties: { lifecyclestage: "customer" },
        updatedAt: "v1",
      },
      { id: "1001", properties: { lifecyclestage: "lead" }, updatedAt: "v1" },
      {
        id: "1001",
        properties: { lifecyclestage: "customer" },
        updatedAt: "v2",
      },
      { id: "1001" },
    ]) {
      request.mockResolvedValueOnce(effect).mockResolvedValueOnce(r);
      expect((await p.inspect(a())).outcome).toBe("conflict");
    }
  });
  it("rejects mismatched or incomplete action evidence", async () => {
    const p = new FetchSandboxConnectors("http://127.0.0.1:8018", token);
    const effect = {
      actionId: "proof-id",
      connector: "crm",
      body: p.body(a()),
      reference: "1001",
      observedVersion: "v1",
    };
    const request = vi.spyOn(p, "request");
    for (const e of [
      { ...effect, actionId: "other" },
      { ...effect, connector: "email" },
      { ...effect, body: {} },
      { ...effect, reference: null },
    ]) {
      request.mockResolvedValueOnce(e);
      expect((await p.inspect(a())).outcome).toBe("conflict");
    }
  });
  it("requires trusted source evidence for CRM and no source read for email", async () => {
    const p = new FetchSandboxConnectors("http://127.0.0.1:8018", token);
    const request = vi.spyOn(p, "request");
    expect(await p.source("email")).toBeNull();
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValueOnce({ id: "1001", updatedAt: "v1" });
    expect(await p.source("crm")).toBe("v1");
    for (const r of [
      { id: "other", updatedAt: "v1" },
      { id: "1001" },
      { id: "1001", updatedAt: "" },
    ]) {
      request.mockResolvedValueOnce(r);
      await expect(p.source("crm")).rejects.toMatchObject({ status: 503 });
    }
  });
  it("separates email acceptance from real delivery and checks exact message fields", async () => {
    const p = new FetchSandboxConnectors("http://127.0.0.1:8018", token);
    const action = a("email"),
      effect = {
        actionId: action.id,
        connector: "email",
        body: p.body(action),
        reference: "email-1",
      };
    const accepted = { ...p.body(action), id: "email-1", last_event: "sent" };
    const request = vi
      .spyOn(p, "request")
      .mockResolvedValueOnce(effect)
      .mockResolvedValueOnce(accepted);
    expect(await p.inspect(action)).toMatchObject({
      outcome: "verified",
      detail: expect.stringContaining("not proof of real delivery"),
    });
    for (const r of [
      { ...accepted, id: "wrong" },
      { ...accepted, subject: "wrong" },
      { ...accepted, to: "wrong" },
      { ...accepted, to: ["customer@example.test", "other@test"] },
      { ...accepted, to: ["other@test"] },
      { ...accepted, from: "other@test" },
      { ...accepted, text: "private" },
      { ...accepted, last_event: "bounced" },
    ]) {
      request.mockResolvedValueOnce(effect).mockResolvedValueOnce(r);
      expect((await p.inspect(action)).outcome).toBe(
        r.last_event === "bounced" ? "unknown" : "conflict",
      );
    }
  });
});
