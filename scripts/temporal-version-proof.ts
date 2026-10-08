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
import { versionedActivities, type RunContract } from "../runtime/temporal/version-contract";
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
async function main() {
  const url = process.env.LOOPLABS_TEST_DATABASE_URL;
  if (!url) throw Error("Dedicated test PostgreSQL required.");
  const dir = await mkdtemp(resolve(".local/temporal-proof-"));
  const schema = `temporal_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: url });
  const db = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  let env: TestWorkflowEnvironment | undefined, twin: ChildProcess | undefined, crashing: ChildProcess | undefined;
  const checks: string[] = [];
  const pass = (s: string) => { checks.push(s); console.log("PASS", s); };
  const token = randomBytes(32).toString("base64url");
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    for (const f of ["lib/durable/schema.sql", "lib/workspace/schema.sql", "lib/connectors/schema.sql", "lib/workflows/schema.sql", "lib/enquiries/schema.sql", "lib/enquiries/managed-schema.sql"]) await db.query(await readFile(f, "utf8"));
    await db.query("INSERT INTO ll_orgs(id) VALUES('local-proof')");
    await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('requester','local-proof','Requester','unused'),('reviewer','local-proof','Reviewer','unused')");
    await db.query("INSERT INTO ll_connector_policies(org_id,connector) VALUES('local-proof','crm'),('local-proof','email')");
    const actors = [];
    for (const [subject, role] of [["requester", "operator"], ["reviewer", "operator"], ["enquiry-runner", "worker"]]) {
      const key = randomBytes(32).toString("base64url");
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
      return { runId: p.id, planHash: p.plan_hash, planVersion: "acknowledgement-1", connectorVersion: "private-twin-1" } as RunContract;
    };
    const approve = async (id: string) => { for (const s of (await workflows.read(requester, id)).steps) await control.review(reviewer, s.action_id, s.payload_hash, true); };
    const effects = async () => Object.keys(JSON.parse(await readFile(`${dir}/connector-twin-state.json`, "utf8")).effects).length;
    const dbFilename = `${dir}/temporal.sqlite`;
    env = await TestWorkflowEnvironment.createLocal({ server: { dbFilename } });
    const taskQueue = `pinned-${randomUUID()}`, deploymentName = `proof-${randomUUID()}`;
    const activity = versionedActivities(db, workerActor, activities(workflows, workerActor));
    const calls = { v1: 0, v2: 0 };
    const createWorker = (buildId: "v1" | "v2") => Worker.create({ connection: env!.nativeConnection, taskQueue,
      workflowsPath: resolve("runtime/temporal/pinned-workflow.ts"),
      workerDeploymentOptions: { version: { deploymentName, buildId }, useWorkerVersioning: true, defaultVersioningBehavior: "PINNED" },
      activities: { async advanceContract(input: RunContract) { calls[buildId]++; return activity.advanceContract(input); } },
      shutdownGraceTime: "1 second" });
    const promote = async (buildId: string) => {
      for (let i = 0; ; i++) {
        try { await env!.client.workflowService.setWorkerDeploymentCurrentVersion({ namespace: "default", deploymentName, buildId, identity: "isolated-proof" }); return; }
        catch (e) { if (i > 100) throw e; await wait(100); }
      }
    };
    const old = await make();
    const w1 = await createWorker("v1"), w2 = await createWorker("v2");
    let oldWorkflowId = "", oldRunId = "";
    await w1.runUntil(async () => {
      await promote("v1");
      const handle = await env!.client.workflow.start("pinnedAcknowledgement", { workflowId: `ack-${old.runId}`, taskQueue, args: [old] });
      oldWorkflowId = handle.workflowId; oldRunId = handle.firstExecutionRunId;
      await wait(1600); assert(calls.v1 > 0); assert.equal(await effects(), 0);
      await w2.runUntil(async () => {
        await promote("v2");
        const fresh = await make();
        const newer = await env!.client.workflow.start("pinnedAcknowledgement", { workflowId: `ack-${fresh.runId}`, taskQueue, args: [fresh] });
        await wait(1600); assert(calls.v2 > 0);
        const beforeV2 = calls.v2;
        await handle.signal("wake"); await wait(500);
        assert.equal(calls.v2, beforeV2);
        await workflows.pause(requester, fresh.runId); await newer.signal("wake");
        assert.equal(await newer.result(), "contained");
      });
      pass("Current v2 routes new runs to v2 while pending v1 remains pinned to v1; no approval from rollout");
    });
    const stepIds = (await workflows.read(requester, old.runId)).steps.map((s: { action_id: string }) => s.action_id);
    const historyBefore = await env.client.workflow.getHandle(oldWorkflowId, oldRunId).fetchHistory();
    await env.teardown(); env = undefined;
    env = await TestWorkflowEnvironment.createLocal({ server: { dbFilename } });
    const recovered = env.client.workflow.getHandle(oldWorkflowId, oldRunId);
    assert.equal((await recovered.fetchHistory()).events?.length, historyBefore.events?.length);
    assert.deepEqual((await workflows.read(requester, old.runId)).steps.map((s: { action_id: string }) => s.action_id), stepIds);
    pass("Temporal service restart restores SQLite history and stable PostgreSQL action IDs");
    // A healthy v2 cannot take an approved run pinned to an unavailable v1.
    await (await createWorker("v2")).runUntil(async () => {
      await approve(old.runId); await recovered.signal("wake"); await wait(2200);
      assert.equal(await effects(), 0);
    });
    pass("Approved v1 waits while only v2 polls after service restart; no implicit migration or duplicate effects");
    await (await createWorker("v1")).runUntil(async () => { assert.equal(await recovered.result(), "completed"); });
    assert.equal(await effects(), 2);
    pass("Restored retained v1 completes original exact approvals with two effects");
    const history = await recovered.fetchHistory();
    await Worker.runReplayHistory({ workflowsPath: resolve("runtime/temporal/pinned-workflow.ts") }, history);
    assert.equal(await effects(), 2); assert(!JSON.stringify(history).includes(token));
    pass("Pinned recorded history replays without new effects or credentials");
    const bad = await make(); bad.connectorVersion = "unsupported";
    await assert.rejects(() => activity.advanceContract(bad));
    bad.connectorVersion = "private-twin-1"; bad.planHash = "0".repeat(64);
    await assert.rejects(() => activity.advanceContract(bad));
    assert.equal(await effects(), 2);
    pass("Unknown connector contract and mismatched immutable plan digest refuse dispatch");
    const revoked = await make(); await approve(revoked.runId);
    await db.query("UPDATE ll_members SET active=false WHERE email='requester'");
    await assert.rejects(() => activity.advanceContract(revoked), /owner/);
    assert.equal(await effects(), 2);
    pass("Pinned code does not pin authority: revoked owner still prevents execution");
    const files = ["lib/connectors/contracts.ts","lib/connectors/service.ts","lib/connectors/twin.ts","lib/connectors/hosted.ts","lib/enquiries/service.ts","lib/workflows/guard.ts","lib/durable/recovery.ts","lib/durable/service.ts","runtime/temporal/pinned-workflow.ts", "runtime/temporal/version-contract.ts", "scripts/temporal-version-proof.ts"];
    const fingerprints = Object.fromEntries(await Promise.all(files.map(async f => [f, createHash("sha256").update(await readFile(f)).digest("hex")])));
    await writeFile("docs/evidence/temporal-version-proof.json", JSON.stringify({ at: new Date().toISOString(), scope: "Local pinned deployments and persisted SQLite dev-service restart; no production cutover", checks, sourceFingerprints: fingerprints, limitations: ["Graceful service restart, not unclean host loss or high availability", "One immutable acknowledgement plan and private twin connector contract", "No retention expiry, production deployment or dispatch cutover proof"] }, null, 2) + "\n");
  } finally {
    if (crashing && crashing.exitCode === null && !crashing.signalCode) crashing.kill("SIGKILL");
    await env?.teardown();
    if (twin && twin.exitCode === null) { twin.kill("SIGTERM"); await new Promise(r => twin!.once("exit", r)); }
    await db.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); await rm(dir, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
