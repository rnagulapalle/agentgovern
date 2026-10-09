import assert from "node:assert/strict";
import { createConnection } from "node:net";
import { readFileSync } from "node:fs";
import { LoopLabsToolClient } from "../lib/connectors/tool-client";
const c = JSON.parse(readFileSync("/run/agent.json", "utf8"));
const client = new LoopLabsToolClient(c.origin, "trial-agent", async () => c.token);
const mode = process.argv[2];
async function deniedNetwork(url: string) {
  try { await fetch(url, { signal: AbortSignal.timeout(1200), redirect: "error" }); return false; } catch { return true; }
}
async function deniedDatabase() {
  return new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: c.databaseIp, port: 5432 });
    const finish = (denied: boolean) => { socket.destroy(); resolve(denied); };
    socket.once("connect", () => finish(false)); socket.once("error", () => finish(true)); socket.setTimeout(1200, () => finish(true));
  });
}
async function main() {
  if (mode === "probe" || mode === "privileges") {
    assert(!process.env.LOOPLABS_CONNECTOR_TWIN_TOKEN && !process.env.LOOPLABS_DATABASE_URL);
    if (mode === "probe") {
    for (const target of [`http://connector-twin:8018/crm/crm/v3/objects/contacts/1001`, `http://${c.providerIp}:8018/crm/crm/v3/objects/contacts/1001`]) assert(await deniedNetwork(target), "Direct backend access reached a listener");
    assert(await deniedDatabase(), "Direct backend TCP connection reached PostgreSQL");
    }
    for (const operation of (mode === "probe" ? ["contain"] : ["approve", "execute", "contain"])) {
      const r = await fetch(`${c.origin}/api/durable/connectors`, { method: "POST", headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" }, body: JSON.stringify(operation === "contain" ? { operation, connector: "crm" } : { operation, actionId: c.crm, ...(operation === "approve" ? { payloadHash: "a".repeat(64) } : {}) }) });
      assert.equal(r.status, 403);
    }
  } else if (mode === "crm" || mode === "email") {
    const p: Parameters<LoopLabsToolClient["propose"]>[0] = { actionId: c[mode], connector: mode, payload: mode === "crm" ? { lifecycle: "customer" as const } : { template: "case_received" as const } };
    const a = await client.propose(p); assert.equal(a.state, "held"); assert.equal((await client.propose(p)).state, "held");
  } else if (mode === "read") {
    assert.equal((await client.read(c.crm)).state, c.expected);
  } else if (mode === "fenced") {
    await assert.rejects(client.read(c.crm), e => !!e && typeof e === "object" && "status" in e && e.status === 503);
  } else if (mode === "outage") {
    await assert.rejects(client.read(c.crm), e => !!e && typeof e === "object" && "outcome" in e && e.outcome === "unconfirmed");
    await assert.rejects(client.propose({ actionId: c.crm, connector: "crm", payload: { lifecycle: "customer" } }), e => !!e && typeof e === "object" && "outcome" in e && e.outcome === "unconfirmed");
  } else if (mode === "revoked") {
    await assert.rejects(client.read(c.crm), e => !!e && typeof e === "object" && "status" in e && e.status === 401);
  } else throw Error("Unknown trial operation");
  console.log(JSON.stringify({ passed: true, mode }));
}
main().catch((e) => { console.error(JSON.stringify({ agentTrial: "refused", mode, status: Number.isInteger(e?.actual) ? e.actual : undefined })); process.exitCode = 1; });
