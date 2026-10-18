import { open, readFile, rename, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { AlertMonitor, endpoint, initialState, observation, parseState, roles } from "../runtime/temporal/alert-monitor";
async function main() {
  const env = process.env, local = env.LOOPLABS_ALERT_LOCAL_PROOF === "true";
  if (env.LOOPLABS_ALERT_LOCAL_PROOF && !["true", "false"].includes(env.LOOPLABS_ALERT_LOCAL_PROOF)) throw Error("Invalid local override");
  const target = endpoint(env.LOOPLABS_ALERT_URL || "", local);
  const health = { worker: endpoint(env.LOOPLABS_WORKER_HEALTH_URL || "", local), scheduler: endpoint(env.LOOPLABS_SCHEDULER_HEALTH_URL || "", local) };
  const keyPath = env.LOOPLABS_ALERT_KEY_FILE || "";
  if ((await stat(keyPath)).mode & 0o077) throw Error("Signing key file must be private");
  const key = await readFile(keyPath, "utf8");
  if (Buffer.byteLength(key) < 32) throw Error("Invalid signing key");
  const file = resolve(env.LOOPLABS_ALERT_JOURNAL || "");
  if (!env.LOOPLABS_ALERT_JOURNAL || ((await stat(dirname(file))).mode & 0o077)) throw Error("Journal requires an existing private directory");
  const lock = await open(`${file}.lock`, "wx", 0o600);
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on("SIGTERM", stop); process.on("SIGINT", stop);
  try {
    let state = initialState();
    try { state = parseState(JSON.parse(await readFile(file, "utf8"))); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw Error("Monitor journal could not be read safely"); }
    const monitor = new AlertMonitor(state, async s => {
      const output = await open(`${file}.next`, "w", 0o600);
      try { await output.writeFile(JSON.stringify(s)); await output.sync(); } finally { await output.close(); }
      await rename(`${file}.next`, file);
      const dir = await open(dirname(file), "r"); try { await dir.sync(); } finally { await dir.close(); }
    });
    while (!stopping) {
      for (const role of roles) {
        let signal = null;
        try {
          const r = await fetch(health[role], { redirect: "error", signal: AbortSignal.timeout(3000) });
          if (r.status !== 200 && r.status !== 503) throw Error("Health unavailable");
          const reader = r.body!.getReader(); let data = "";
          try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; data += Buffer.from(chunk.value).toString("utf8"); if (Buffer.byteLength(data) > 16384) throw Error("Health response too large"); } }
          finally { await reader.cancel(); }
          signal = observation(JSON.parse(data), role);
          if (r.status === 503) signal.ready = false;
        } catch { /* Network and malformed replies count as unavailable, never healthy. */ }
        await monitor.observe(role, signal, Date.now());
      }
      try {
        await monitor.deliver(async (event, signature) => {
          const r = await fetch(target, { method: "POST", redirect: "error", signal: AbortSignal.timeout(3000), headers: { "Content-Type": "application/json", "Idempotency-Key": event.id, "X-LoopLabs-Signature": signature }, body: JSON.stringify(event) });
          await r.body?.cancel();
          if (!r.ok) throw Error("Alert acknowledgement unavailable");
        }, key);
      } catch { console.error("Alert delivery pending; inspect protected journal and receiver availability."); }
      if (!stopping && process.argv[2] !== "once") await new Promise(r => setTimeout(r, 5000));
      if (process.argv[2] === "once") break;
    }
    console.log(JSON.stringify({ pendingAlerts: state.pending.length, stopping }));
    if (state.pending.length) process.exitCode = 1;
  } finally {
    await lock.close();
    const { unlink } = await import("node:fs/promises"); await unlink(`${file}.lock`);
  }
}
main().catch(() => { console.error("Alert monitor stopped; check private configuration, journal and exclusive-instance lock."); process.exitCode = 1; });
