// Isolated actual Temporal + PostgreSQL + HTTP twin proof. Never changes production.
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { Pool } from "pg";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { authenticate, tokenHash } from "../lib/durable/service";
import { ConnectorControl } from "../lib/connectors/service";
import { FetchSandboxConnectors } from "../lib/connectors/twin";
import { WorkflowControl } from "../lib/workflows/service";
import { EnquiryControl } from "../lib/enquiries/service";
import { activities } from "../runtime/temporal/activities";
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
async function main() {
  const url = process.env.LOOPLABS_TEST_DATABASE_URL;
  if (!url) throw Error("Dedicated test PostgreSQL required.");
  const dir = await mkdtemp(resolve(".local/temporal-proof-"));
  const schema = `temporal_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: url });
  const db = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  let env: TestWorkflowEnvironment | undefined, twin: ChildProcess | undefined, crashing: ChildProcess | undefined;
  let workerKey = "";
  const checks: string[] = [];
  const pass = (s: string) => { checks.push(s); console.log("PASS", s); };
  const token = randomBytes(32).toString("base64url");
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    for (const f of ["lib/durable/schema.sql", "lib/workspace/schema.sql", "lib/refunds/schema.sql", "lib/connectors/schema.sql", "lib/workflows/schema.sql", "lib/durable/proposal-schema.sql", "lib/enquiries/schema.sql", "lib/enquiries/managed-schema.sql"]) await db.query(await readFile(f, "utf8"));
    await db.query("INSERT INTO ll_orgs(id) VALUES('local-proof')");
    await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('requester','local-proof','Requester','unused'),('reviewer','local-proof','Reviewer','unused')");
    await db.query("INSERT INTO ll_connector_policies(org_id,connector) VALUES('local-proof','crm'),('local-proof','email')");
    const actors = [];
    for (const [subject, role] of [["requester", "operator"], ["reviewer", "operator"], ["enquiry-runner", "worker"]]) {
      const key = randomBytes(32).toString("base64url");
      if (role === "worker") workerKey = key;
      await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'local-proof',$2,$3)", [tokenHash(key), subject, role]);
      actors.push(await authenticate(db, key));
    }
    const [requester, reviewer, workerActor] = actors;
    await writeFile(`${dir}/connector-twin-credentials.json`, JSON.stringify({ token }), { mode: 0o600 });
    const backend = process.env.FETCHSANDBOX_BACKEND_PATH || `${process.env.HOME}/sandbox/backend`;
    twin = spawn(`${backend}/.venv/bin/python`, ["scripts/connector-twin.py"], { env: { ...process.env, LOOPLABS_CONNECTOR_STATE_DIR: dir }, stdio: "ignore" });
    const provider = new FetchSandboxConnectors("http://127.0.0.1:8018", token);
    for (let i = 0; ; i++) {
      try { await provider.contact(); break; } catch { if (i > 100 || twin.exitCode !== null) throw Error("Private twin unavailable; port8018 must be free."); await wait(100); }
    }
    const control = new ConnectorControl(db, provider), workflows = new WorkflowControl(db, control);
    const enquiries = new EnquiryControl(db, workflows, async () => { const c = await provider.contact(); return { id: c.id, email: c.properties.email, version: c.updatedAt, lifecycle: c.properties.lifecyclestage }; });
    const make = async () => {
      const p = (await enquiries.prepareChat(requester, randomUUID())).saved;
      await enquiries.rehearse(requester, p.id, p.plan_hash);
      return p.id as string;
    };
    const approve = async (id: string) => { for (const s of (await workflows.read(requester, id)).steps) await control.review(reviewer, s.action_id, s.payload_hash, true); };
    const effects = async () => Object.keys(JSON.parse(await readFile(`${dir}/connector-twin-state.json`, "utf8")).effects).length;
    env = await TestWorkflowEnvironment.createLocal();
    const taskQueue = `proof-${randomUUID()}`, activity = activities(workflows, workerActor);
    const createWorker = (version = "workflow") => Worker.create({ connection: env!.nativeConnection, taskQueue, workflowsPath: resolve(`runtime/temporal/${version}.ts`), activities: activity, shutdownGraceTime: "1 second" });
    const id = await make();
    const handle = await env.client.workflow.start("governedAcknowledgement", { workflowId: `ack-${id}`, taskQueue, args: [id] });
    await (await createWorker()).runUntil(async () => {
      await wait(1500);
      assert.equal(await effects(), 0);
      const first = (await workflows.read(requester, id)).steps[0];
      await assert.rejects(() => control.review(requester, first.action_id, first.payload_hash, true));
      // Forged/duplicate wake signals do not authorize any action.
      await handle.signal("wake"); await handle.signal("wake"); await wait(700); assert.equal(await effects(), 0);
    });
    pass("Held work and duplicate wake do not execute or grant self approval");
    // Restart with compatible v2 code while the v1 workflow is waiting.
    await (await createWorker("workflow-v2")).runUntil(async () => { await approve(id); await handle.signal("wake"); assert.equal(await handle.result(), "completed"); });
    assert.equal(await effects(), 2);
    pass("Pending v1 run survives worker stop and compatible v2 rollout; exact independent approvals complete two HTTP effects");
    const history = await handle.fetchHistory();
    await Worker.runReplayHistory({ workflowsPath: resolve("runtime/temporal/workflow-v2.ts") }, history);
    assert.equal(await effects(), 2);
    assert(!JSON.stringify(history).includes(token));
    pass("Recorded v1 history replays with compatible v2 without effects or provider credentials in history");
    // Existing action services exercise effect-before-recording uncertainty.
    const lost = await make(); await approve(lost);
    const step = (await workflows.read(requester, lost)).steps[0];
    assert.equal((await control.execute(workerActor, step.action_id, true)).state, "uncertain");
    const count = await effects();
    const recovery = await env.client.workflow.start("governedAcknowledgement", { workflowId: `ack-${lost}`, taskQueue, args: [lost] });
    await (await createWorker("workflow-v2")).runUntil(async () => { assert.equal(await recovery.result(), "completed"); });
    assert.equal(await effects(), count + 1);
    pass("Lost CRM response is reconciled; Temporal recovery adds only the intended downstream email");
    const crashRun = await make(); await approve(crashRun);
    const crashCount = await effects();
    const crashHandle = await env.client.workflow.start("governedAcknowledgement", { workflowId: `ack-${crashRun}`, taskQueue, args: [crashRun] });
    crashing = spawn(process.execPath, ["--import", "tsx", "scripts/temporal-proof-worker.ts"], { env: { ...process.env, TEMPORAL_PROOF_SCHEMA: schema, TEMPORAL_PROOF_ADDRESS: env.address, TEMPORAL_PROOF_QUEUE: taskQueue, TEMPORAL_PROOF_WORKER_KEY: workerKey, TEMPORAL_PROOF_KILL_AFTER_EFFECT: "1", LOOPLABS_CONNECTOR_TWIN_URL: "http://127.0.0.1:8018", LOOPLABS_CONNECTOR_TWIN_TOKEN: token }, stdio: "ignore" });
    for (let i = 0; ; i++) {
      if (crashing.signalCode === "SIGKILL") break;
      if (crashing.exitCode !== null || i > 200) throw Error("Worker did not crash at injected effect boundary");
      await wait(100);
    }
    assert.equal(await effects(), crashCount + 1);
    const interrupted = await workflows.read(requester, crashRun);
    assert.equal(interrupted.steps[0].state, "executing");
    assert.equal(interrupted.steps[1].state, "ready");
    // Isolated lease-clock injection shortens a 30-second wait; does not bypass authority.
    await db.query("UPDATE ll_connector_actions SET lease_until=now()-interval '1 second' WHERE id=$1", [interrupted.steps[0].action_id]);
    await (await createWorker("workflow-v2")).runUntil(async () => { assert.equal(await crashHandle.result(), "completed"); });
    assert.equal(await effects(), crashCount + 2);
    pass("SIGKILL after real CRM effect before completion recording; replacement worker reads back and sends only one downstream email (isolated lease expiry injected)");
    await writeFile(`${dir}/incompatible.ts`, 'import {proxyActivities} from "@temporalio/workflow"; const a=proxyActivities<{wrong():Promise<void>}>({startToCloseTimeout:"45 seconds"}); export async function governedAcknowledgement(){await a.wrong();}');
    await assert.rejects(() => Worker.runReplayHistory({ workflowsPath: `${dir}/incompatible.ts` }, history));
    pass("Incompatible activity command is rejected by recorded-history replay");
    const paused = await make(); await workflows.pause(requester, paused);
    const stopped = await env.client.workflow.start("governedAcknowledgement", { workflowId: `ack-${paused}`, taskQueue, args: [paused] });
    const before = await effects();
    await (await createWorker()).runUntil(async () => { assert.equal(await stopped.result(), "contained"); });
    assert.equal(await effects(), before);
    pass("Paused run stays contained without effects");
    const files = ["lib/connectors/request.ts","lib/connectors/content.ts","lib/connectors/record-scope.ts","lib/connectors/scopes.ts","lib/connectors/scope-schema.sql","lib/enquiries/record-routing-schema.sql","runtime/temporal/record-routing.ts","runtime/temporal/outbox.ts","runtime/temporal/version-contract.ts","lib/enquiries/runner.ts","lib/durable/proposal-schema.sql","lib/refunds/schema.sql","lib/connectors/contracts.ts","lib/connectors/service.ts","lib/connectors/twin.ts","lib/connectors/hosted.ts","lib/enquiries/service.ts","lib/workflows/guard.ts","lib/durable/recovery.ts","lib/durable/service.ts","runtime/temporal/activities.ts", "runtime/temporal/workflow.ts", "runtime/temporal/workflow-v2.ts", "scripts/temporal-proof.ts", "scripts/temporal-proof-worker.ts"];
    const fingerprints = Object.fromEntries(await Promise.all(files.map(async f => [f, createHash("sha256").update(await readFile(f)).digest("hex")])));
    await writeFile("docs/evidence/temporal-proof.json", JSON.stringify({ at: new Date().toISOString(), scope: "Local Temporal dev service; isolated PostgreSQL and private HTTP twins; no production cutover", checks, sourceFingerprints: fingerprints, limitations: ["Compatible patch rollout, not deployment pinning", "Lease expiry shortened in isolated test; Temporal activity uses normal timeout/retry", "No UI cutover, production failover, real providers or scale proof"] }, null, 2) + "\n");
  } finally {
    if (crashing && crashing.exitCode === null && !crashing.signalCode) crashing.kill("SIGKILL");
    await env?.teardown();
    if (twin && twin.exitCode === null) { twin.kill("SIGTERM"); await new Promise(r => twin!.once("exit", r)); }
    await db.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); await rm(dir, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
