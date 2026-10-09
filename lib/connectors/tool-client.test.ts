import { createServer, type Server } from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { LoopLabsToolClient, ToolRequestError } from "./tool-client";
let server: Server, origin: string, mode = "ok", calls = 0;
const token = randomBytes(32).toString("base64url"), id = randomUUID();
const p = { actionId: id, connector: "crm" as const, payload: { lifecycle: "customer" as const } };
const seen: { body: string; authorization?: string; url?: string }[] = [];
beforeAll(async () => {
  server = createServer(async (req, res) => {
    calls++; let body = ""; for await (const c of req) body += c;
    seen.push({ body, authorization: req.headers.authorization, url: req.url });
    if (mode === "hang") return;
    if (mode === "redirect") { res.writeHead(307, { location: `${origin}/redirect-target` }); res.end(); return; }
    if (mode === "denied") { res.writeHead(403); res.end(token); return; }
    if (mode === "outage") { res.writeHead(503); res.end(token); return; }
    res.setHeader("Content-Type", "application/json");
    if (mode === "invalid") { res.end("invalid"); return; }
    if (mode === "oversized") { res.end("a".repeat(65537)); return; }
    if (mode === "empty") { res.writeHead(204); res.end(); return; }
    const data = { id, agent_id: "agent", connector: "crm", state: "held", payload_hash: "a".repeat(64), lease_token: "must-not-return" };
    if (mode === "identity") data.agent_id = "other";
    if (mode === "id") data.id = randomUUID();
    if (mode === "connector") data.connector = "email";
    if (mode === "state") data.state = "invented";
    if (mode === "hash") data.payload_hash = "bad";
    res.end(JSON.stringify(data));
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const a = server.address(); if (!a || typeof a === "string") throw Error("No fixture port"); origin = `http://127.0.0.1:${a.port}`;
});
afterAll(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); });
it("requires reviewed secure origin and exact identity/timeout; refuses malformed proposals before HTTP", () => {
  for (const o of ["http://external.test", "https://user:pass@example.test", "https://example.test/path", "https://example.test/?secret=yes", "https://example.test/#token"])
    expect(() => new LoopLabsToolClient(o, "agent", async () => token)).toThrow();
  for (const t of [0, 30001, 1.5]) expect(() => new LoopLabsToolClient(origin, "agent", async () => token, t)).toThrow();
  expect(() => new LoopLabsToolClient(origin, "invalid id", async () => token)).toThrow();
  const client = new LoopLabsToolClient(origin, "agent", async () => token);
  expect(() => client.propose({ ...p, payload: { lifecycle: "unknown" } } as never)).toThrow();
  expect(() => client.read("bad?token=x")).toThrow();
});
it("copies the exact proposal before token wait and retains the ID across explicit retries; returns only bounded decision fields", async () => {
  mode = "ok"; const start = calls; let release!: (t: string) => void;
  const mutable = { ...p, payload: { lifecycle: "customer" as "customer" | "lead" } };
  const client = new LoopLabsToolClient(origin, "agent", () => new Promise(r => { release = r; }));
  const pending = client.propose(mutable); mutable.payload.lifecycle = "lead"; release(token);
  const d = await pending; expect(d.state).toBe("held"); expect(d).not.toHaveProperty("lease_token");
  const stable = new LoopLabsToolClient(origin, "agent", async () => token);
  await stable.propose(p); await stable.read(id);
  expect(calls - start).toBe(3); expect(seen.at(-3)?.body).toBe(seen.at(-2)?.body);
  expect(JSON.parse(seen.at(-2)!.body)).toEqual({ operation: "propose", ...p, agentId: "agent" });
  expect(seen.at(-1)?.authorization).toBe(`Bearer ${token}`); expect(seen.at(-1)?.url).toBe(`/api/durable/connectors?action=${id}`);
  expect("approve" in stable || "execute" in stable).toBe(false);
});
it("does not follow redirects, repeat mutations or expose denial/provider bodies", async () => {
  const client = new LoopLabsToolClient(origin, "agent", async () => token);
  for (const m of ["redirect", "denied", "outage", "invalid", "oversized", "empty", "identity", "id", "connector", "state", "hash"]) {
    mode = m; const start = calls;
    try { await client.propose(p); throw Error("Unexpected success"); } catch (e) {
      expect(e).toBeInstanceOf(ToolRequestError); expect((e as ToolRequestError).outcome).toBe(m === "denied" ? "refused" : "unconfirmed"); expect((e as Error).message).not.toContain(token);
    }
    expect(calls - start).toBe(1);
  }
});
it("fails closed on missing/rejected credentials and total request deadline without a late send", async () => {
  const start = calls;
  await expect(new LoopLabsToolClient(origin, "agent", async () => "bad").propose(p)).rejects.toMatchObject({ outcome: "refused" });
  await expect(new LoopLabsToolClient(origin, "agent", async () => { throw Error(token); }).propose(p)).rejects.toMatchObject({ outcome: "unconfirmed" });
  let release!: (t: string) => void;
  await expect(new LoopLabsToolClient(origin, "agent", () => new Promise(r => { release = r; }), 10).propose(p)).rejects.toMatchObject({ outcome: "unconfirmed" });
  release(token); await new Promise(r => setTimeout(r, 20)); expect(calls).toBe(start);
  mode = "hang";
  await expect(new LoopLabsToolClient(origin, "agent", async () => token, 100).propose(p)).rejects.toMatchObject({ outcome: "unconfirmed" });
  expect(calls).toBe(start + 1); mode = "ok";
});
