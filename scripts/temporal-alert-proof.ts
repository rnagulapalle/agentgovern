import { createServer, Server } from "node:http";
import { spawn } from "node:child_process";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { mkdtemp, chmod, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { OperationsHealth } from "../runtime/temporal/operations";
async function listen(server: Server, port = 0): Promise<number> {
  await new Promise<void>((ok, fail) => { server.once("error", fail); server.listen(port, "127.0.0.1", ok); });
  return (server.address() as { port: number }).port;
}
async function close(server: Server) { if (server.listening) await new Promise<void>(r => server.close(() => r())); }
async function main() {
  const dir = await mkdtemp(join(tmpdir(), "ll-alert-proof-")); await chmod(dir, 0o700);
  const key = randomBytes(32).toString("hex"), keyFile = join(dir, "key"), journal = join(dir, "state.json");
  await writeFile(keyFile, key, { mode: 0o600 });
  const received = new Map<string, unknown>(), attempts: string[] = [];
  let loseResponse = true, backlog = false;
  const healthServer = (role: "worker" | "scheduler") => createServer((_req, res) => {
    const h = new OperationsHealth(role, 15000); h.success(Date.now(), 0, backlog ? 1 : 0, backlog ? 61 : 0);
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(h.snapshot(Date.now(), true)));
  });
  let worker = healthServer("worker"); const scheduler = healthServer("scheduler");
  const receiver = createServer(async (req, res) => {
    let data = ""; for await (const chunk of req) data += chunk;
    assert.equal(req.headers["x-looplabs-signature"], createHmac("sha256", key).update(data).digest("hex"));
    const event = JSON.parse(data); assert.equal(req.headers["idempotency-key"], event.id);
    assert.deepEqual(Object.keys(event).sort(), ["at", "condition", "id", "role", "transition"]);
    attempts.push(event.id); received.set(event.id, event);
    if (loseResponse) { loseResponse = false; res.destroy(); } else { res.writeHead(204); res.end(); }
  });
  try {
    const wp = await listen(worker), sp = await listen(scheduler), rp = await listen(receiver);
    const env = { ...process.env, LOOPLABS_ALERT_LOCAL_PROOF: "true", LOOPLABS_ALERT_URL: `http://127.0.0.1:${rp}/alert`, LOOPLABS_WORKER_HEALTH_URL: `http://127.0.0.1:${wp}/health/ready`, LOOPLABS_SCHEDULER_HEALTH_URL: `http://127.0.0.1:${sp}/health/ready`, LOOPLABS_ALERT_KEY_FILE: keyFile, LOOPLABS_ALERT_JOURNAL: journal };
    const run = async () => {
      const child = spawn(process.execPath, ["--import", "tsx", "scripts/temporal-alert-monitor.ts", "once"], { env, stdio: ["ignore", "pipe", "pipe"] });
      let output = ""; child.stdout.on("data", b => { output += b; }); child.stderr.on("data", b => { output += b; });
      const timeout = setTimeout(() => child.kill("SIGKILL"), 15000);
      const code = await new Promise<number | null>((r, fail) => { child.once("error", fail); child.once("exit", r); }); clearTimeout(timeout);
      assert(!output.includes(key)); return code;
    };
    assert.equal(await run(), 0); assert.equal(received.size, 0);
    await close(worker);
    assert.equal(await run(), 0); assert.equal(await run(), 0); assert.equal(received.size, 0);
    assert.equal(await run(), 1); assert.equal(received.size, 1);
    const pending = JSON.parse(await readFile(journal, "utf8")); assert.equal(pending.pending.length, 1);
    const id = pending.pending[0].id; assert.equal(id, attempts[0]);
    assert.equal(await run(), 0); assert.deepEqual(attempts, [id, id]); assert.equal(received.size, 1);
    assert.equal(JSON.parse(await readFile(journal, "utf8")).pending.length, 0);
    worker = healthServer("worker"); await listen(worker, wp);
    assert.equal(await run(), 0); assert.equal(received.size, 2);
    assert.equal(await run(), 0); assert.equal(received.size, 2);
    backlog = true; assert.equal(await run(), 0); assert.equal(received.size, 4);
    backlog = false; assert.equal(await run(), 0); assert.equal(received.size, 6);
    await writeFile(journal, '{"version":2}'); assert.equal(await run(), 1); assert.equal(received.size, 6);
    const sources = ["runtime/temporal/alert-monitor.ts", "scripts/temporal-alert-monitor.ts", "scripts/temporal-alert-proof.ts"];
    const sourceFingerprints = Object.fromEntries(await Promise.all(sources.map(async f => [f, createHash("sha256").update(await readFile(f)).digest("hex")])));
    await writeFile("docs/evidence/temporal-alert-proof.json", JSON.stringify({ date: new Date().toISOString(), scope: "Local independent monitor process and controlled HTTP health/alert receivers; no designated operator notification, no production cutover or availability claim. Receiver deduplication is required for at-least-once delivery.", checks: ["Stopped HTTP health endpoint opens only after three failures", "Receiver accepted alert and lost response; protected pending journal survives process restart", "Retry retains signed payload and idempotency ID; receiver records one incident", "Recovery emits one resolved transition without repeated healthy notifications", "Backlog opens and resolves separately for both roles", "Malformed journal refuses startup without sending alerts"], measurements: { deliveryAttempts: attempts.length, uniqueTransitions: received.size, lostResponseAttempts: attempts.filter(a => a === id).length }, sourceFingerprints }, null, 2) + "\n");
    console.log("Six actual-process alert delivery and recovery checks passed; no business actions or real operator notifications.");
  } finally { await close(worker); await close(scheduler); await close(receiver); await rm(dir, { recursive: true, force: true }); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
