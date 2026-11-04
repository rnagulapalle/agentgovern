import { createServer, type Server } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { LoopLabsToolCheckpoint, parseCheckpointTicket, serializeCheckpointTicket } from "./tool-checkpoint";
let server: Server, origin: string, state = "held", hash = "a".repeat(64), mode = "ok";
const id = randomUUID(), token = randomBytes(32).toString("base64url");
const calls: { method?: string; url?: string; body: string }[] = [];
beforeAll(async () => {
  server = createServer(async (req, res) => {
    let body = ""; for await (const c of req) body += c;
    calls.push({ method: req.method, url: req.url, body });
    if (req.headers.authorization !== `Bearer ${token}` || mode === "denied") { res.writeHead(403); res.end("private"); return; }
    if (mode === "outage") { res.writeHead(503); res.end("private"); return; }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ id, agent_id: "agent", connector: "crm", state, payload_hash: hash, lease_token: "never-return" }));
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const address = server.address(); if (!address || typeof address === "string") throw Error(); origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); });
const proposal = () => ({ actionId: id, connector: "crm" as const, payload: { lifecycle: "customer" as const } });
it.each([
  ["held", "held"], ["ready", "execution-pending"], ["executing", "executing"], ["succeeded", "action-verified"],
  ["uncertain", "uncertain"], ["conflict", "needs-review"], ["rejected", "rejected"], ["cancelled", "cancelled"],
])("maps %s without issuing execution authority or declaring workflow completion", async (input, status) => {
  mode = "ok"; state = input; hash = "a".repeat(64);
  const checkpoint = new LoopLabsToolCheckpoint(origin, "agent", async () => token);
  const result = await checkpoint.propose(proposal());
  expect(result).toMatchObject({ status, providerExecutionGranted: false, workflowCompleted: false });
  expect(JSON.stringify(result)).not.toContain("never-return");
  expect(calls.at(-1)?.body).toContain('"operation":"propose"');
  const n = calls.length;
  expect((await checkpoint.read(result.ticket)).status).toBe(status);
  expect(calls.length).toBe(n + 1); expect(calls.at(-1)?.method).toBe("GET");
  expect("execute" in checkpoint || "approve" in checkpoint).toBe(false);
});
it("refuses changed payload binding, foreign agent and unsupported tools without fallback execution", async () => {
  mode = "ok"; state = "held"; hash = "a".repeat(64);
  const checkpoint = new LoopLabsToolCheckpoint(origin, "agent", async () => token);
  const result = await checkpoint.propose(proposal()); hash = "b".repeat(64); state = "succeeded";
  await expect(checkpoint.read(result.ticket)).rejects.toMatchObject({ outcome: "unconfirmed" });
  const n = calls.length;
  await expect(checkpoint.read({ ...result.ticket, agentId: "other" })).rejects.toMatchObject({ outcome: "refused" });
  await expect(checkpoint.propose({ ...proposal(), payload: { discount: 14 } } as never)).rejects.toThrow();
  expect(calls.length).toBe(n);
});
it("does not silently resend on denial or unavailable control plane", async () => {
  const checkpoint = new LoopLabsToolCheckpoint(origin, "agent", async () => token);
  for (const value of ["denied", "outage"]) {
    mode = value; const n = calls.length;
    await expect(checkpoint.propose(proposal())).rejects.toMatchObject({ outcome: value === "denied" ? "refused" : "unconfirmed" });
    expect(calls.length).toBe(n + 1);
  }
  mode = "ok";
});

it("serializes only a bounded versioned reference; parsing returns an independent copy without secrets or authority", () => {
  const ticket = { actionId: id, agentId: "agent", connector: "crm" as const, payloadHash: "a".repeat(64) };
  const encoded = serializeCheckpointTicket(ticket), parsed = parseCheckpointTicket(encoded);
  expect(encoded.length).toBeLessThanOrEqual(512);
  expect(JSON.parse(encoded)).toEqual({ contract: "looplabs-checkpoint-ticket-1", ticket });
  parsed.payloadHash = "b".repeat(64);
  expect(parseCheckpointTicket(encoded).payloadHash).toBe(ticket.payloadHash);
  expect(encoded).not.toContain(token);
  expect(encoded).not.toMatch(/providerExecutionGranted|workflowCompleted|lease_token|credential|approved/);
});

it("rejects unsupported, oversized, ambiguous or credential-bearing saved references before HTTP", async () => {
  const ticket = { actionId: id, agentId: "agent", connector: "crm" as const, payloadHash: "a".repeat(64) };
  const encoded = serializeCheckpointTicket(ticket);
  const checkpoint = new LoopLabsToolCheckpoint(origin, "agent", async () => token), start = calls.length;
  for (const value of [null, "", "invalid", "null", "x".repeat(513), encoded + " ", encoded.replace("ticket-1", "ticket-2"),
    encoded.replace('{"contract":', '{"extra":true,"contract":'),
    encoded.replace('"ticket":', '"credential":"private","ticket":'),
    encoded.replace('"agentId":"agent"', '"agentId":"other","agentId":"agent"'),
    encoded.replace(id, "bad"), encoded.replace('"crm"', '"arbitrary-tool"'), encoded.replace("a".repeat(64), "bad")]) {
    await expect(checkpoint.resume(value as string)).rejects.toMatchObject({ outcome: "refused" });
  }
  for (const value of [{ ...ticket, extra: true }, { ...ticket, agentId: "bad agent" }, { ...ticket, actionId: "bad" },
    { ...ticket, connector: "unknown" }, { ...ticket, payloadHash: "bad" }, Object.assign(Object.create(null), ticket),
    { ...ticket, [Symbol("hidden")]: "private" }]) {
    expect(() => serializeCheckpointTicket(value as typeof ticket)).toThrow();
  }
  let getterCalls = 0;
  const accessor = { ...ticket, get payloadHash() { getterCalls++; return ticket.payloadHash; } };
  expect(() => serializeCheckpointTicket(accessor)).toThrow();
  expect(getterCalls).toBe(0);
  expect(calls.length).toBe(start);
});

it.each(["held", "ready", "executing", "succeeded", "uncertain", "conflict", "rejected", "cancelled"])(
  "a fresh client resumes stored %s through one same-action GET, never a proposal or provider permit", async value => {
    mode = "ok"; state = "held"; hash = "a".repeat(64);
    const original = new LoopLabsToolCheckpoint(origin, "agent", async () => token);
    const pending = await original.propose(proposal());
    const encoded = serializeCheckpointTicket(pending.ticket);
    // Simulates consuming persisted bytes in a new client; does not claim that
    // this HTTP double or a real customer's runner has durable storage.
    state = value; const start = calls.length; let credentials = 0;
    const restarted = new LoopLabsToolCheckpoint(origin, "agent", async () => { credentials++; return token; });
    const result = await restarted.resume(encoded);
    expect(result.ticket).toEqual(pending.ticket);
    expect(result.providerExecutionGranted).toBe(false);
    expect(result.workflowCompleted).toBe(false);
    expect(credentials).toBe(1);
    expect(calls.slice(start)).toEqual([{ method: "GET", url: `/api/durable/connectors?action=${id}`, body: "" }]);
    expect(serializeCheckpointTicket(result.ticket)).toBe(encoded);
  },
);

it("a saved reference cannot bypass changed digest, foreign identity, revocation or an unavailable server", async () => {
  mode = "ok"; state = "held"; hash = "a".repeat(64);
  const checkpoint = new LoopLabsToolCheckpoint(origin, "agent", async () => token);
  const encoded = serializeCheckpointTicket((await checkpoint.propose(proposal())).ticket);
  const start = calls.length;
  await expect(new LoopLabsToolCheckpoint(origin, "foreign", async () => token).resume(encoded)).rejects.toMatchObject({ outcome: "refused" });
  expect(calls.length).toBe(start);
  state = "succeeded"; hash = "b".repeat(64);
  await expect(checkpoint.resume(encoded)).rejects.toMatchObject({ outcome: "unconfirmed" });
  hash = "a".repeat(64);
  for (const value of ["denied", "outage"]) {
    mode = value; const before = calls.length;
    await expect(checkpoint.resume(encoded)).rejects.toMatchObject({ outcome: value === "denied" ? "refused" : "unconfirmed" });
    expect(calls.slice(before)).toEqual([{ method: "GET", url: `/api/durable/connectors?action=${id}`, body: "" }]);
  }
  mode = "ok";
});
