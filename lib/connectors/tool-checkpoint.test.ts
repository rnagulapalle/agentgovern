import { createServer, type Server } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { LoopLabsToolCheckpoint } from "./tool-checkpoint";
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
