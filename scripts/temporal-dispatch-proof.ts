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
import { TemporalOutbox } from "../runtime/temporal/outbox";
import { EnquiryRunner } from "../lib/enquiries/runner";
import type { Client } from "@temporalio/client";
import { versionedActivities, type RunContract } from "../runtime/temporal/version-contract";
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
async function main() {
  const url = process.env.LOOPLABS_TEST_DATABASE_URL;
  if (!url) throw Error("Dedicated test PostgreSQL required.");
  const dir = await mkdtemp(resolve(".local/temporal-proof-"));
  const schema = `temporal_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: url });
  const db = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  let env: TestWorkflowEnvironment | undefined, twin: ChildProcess | undefined;
  const checks: string[] = [];
  const pass = (s: string) => { checks.push(s); console.log("PASS", s); };
  const token = randomBytes(32).toString("base64url");
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    for (const f of ["lib/durable/schema.sql", "lib/workspace/schema.sql", "lib/refunds/schema.sql", "lib/connectors/schema.sql", "lib/workflows/schema.sql", "lib/durable/proposal-schema.sql", "lib/enquiries/schema.sql", "lib/enquiries/managed-schema.sql", "lib/enquiries/temporal-schema.sql"]) await db.query(await readFile(f, "utf8"));
    await db.query("INSERT INTO ll_orgs(id) VALUES('local-proof')");
    await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('requester','local-proof','Requester','unused'),('reviewer','local-proof','Reviewer','unused')");
    await db.query("INSERT INTO ll_connector_policies(org_id,connector) VALUES('local-proof','crm'),('local-proof','email')");
    const actors = [];
    for (const [subject, role] of [["requester", "operator"], ["reviewer", "operator"], ["enquiry-runner", "worker"], ["enquiry-temporal", "worker"]]) {
      const key = randomBytes(32).toString("base64url");
      await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'local-proof',$2,$3)", [tokenHash(key), subject, role]);
      actors.push(await authenticate(db, key));
    }
    const [requester, reviewer, legacyActor, workerActor] = actors;
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
    env = await TestWorkflowEnvironment.createLocal();
    const taskQueue = `outbox-${randomUUID()}`, outbox = new TemporalOutbox(db);
    const activity = versionedActivities(db, workerActor, activities(workflows, workerActor));
    const createWorker = () => Worker.create({ connection: env!.nativeConnection, taskQueue, workflowsPath: resolve("runtime/temporal/pinned-workflow.ts"), activities: activity, shutdownGraceTime: "1 second" });
    const p = await make();
    const ids = await Promise.all([outbox.transfer(requester, p.runId), outbox.transfer(requester, p.runId)]);
    assert.equal(ids[0], ids[1]);
    const legacy = new EnquiryRunner(db, workflows);
    await approve(p.runId);
    assert.equal(await legacy.tick(legacyActor), 0);
    const first = (await workflows.read(requester, p.runId)).steps[0];
    await assert.rejects(() => control.execute(legacyActor, first.action_id), /own/);
    await assert.rejects(() => control.execute(requester, first.action_id), /own/);
    assert.equal(await effects(), 0);
    pass("Atomic duplicate transfer excludes legacy polling and rejects legacy or human dispatch of Temporal-owned work");
    // Start is accepted by Temporal, but its outbox completion lease expires first.
    const delayed = { workflow: { async start(...args: Parameters<Client["workflow"]["start"]>) {
      const handle = await env!.client.workflow.start(...args);
      await db.query("UPDATE ll_temporal_dispatch SET lease_until=now()-interval '1 second'");
      return handle;
    } } } as unknown as Client;
    assert.equal(await outbox.tick(workerActor, delayed, taskQueue), 0);
    assert.equal((await db.query("SELECT state FROM ll_temporal_dispatch")).rows[0].state, "pending");
    const counts = await Promise.all([outbox.tick(workerActor, env.client, taskQueue), outbox.tick(workerActor, env.client, taskQueue)]);
    assert.equal(counts.reduce((a,b) => a+b,0), 1);
    pass("Expired scheduler lease cannot mark completion; concurrent retry reuses the already-started Temporal workflow");
    await (await createWorker()).runUntil(async () => { assert.equal(await env!.client.workflow.getHandle(ids[0]).result(), "completed"); });
    assert.equal(await effects(), 2);
    const history = await env.client.workflow.getHandle(ids[0]).fetchHistory();
    assert.equal(history.events!.filter(e => e.workflowExecutionStartedEventAttributes).length, 1);
    assert.equal(await outbox.tick(workerActor, env.client, taskQueue), 0);
    pass("Recovered outbox completes one recorded workflow and exactly two HTTP twin effects without re-enqueue");
    const q = await make(); const qid = await outbox.transfer(requester, q.runId); await approve(q.runId);
    const before = await effects();
    const progressed = await Promise.all([activity.advanceContract(q), activity.advanceContract(q)]);
    assert(progressed.includes("completed") || progressed.includes("waiting"));
    await activity.advanceContract(q);
    assert.equal(await effects(), before+2);
    await assert.rejects(() => outbox.transfer(requester, q.runId+"bad"));
    pass("Concurrent authorized activity attempts preserve action leases and produce one CRM effect and one email");
    // Reject reuse of a closed workflow too: same outbox intent, never a fresh run.
    const closed = await env.client.workflow.start("pinnedAcknowledgement", { workflowId: qid, taskQueue, args: [q] });
    await (await createWorker()).runUntil(async () => { assert.equal(await closed.result(), "completed"); });
    assert.equal(await outbox.tick(workerActor, env.client, taskQueue), 1);
    assert.equal(await effects(), before+2);
    pass("Closed Temporal workflow ID is not reused by an incomplete outbox intent");
    const revoked = await make(); await outbox.transfer(requester, revoked.runId); await approve(revoked.runId);
    let entered!: () => void, release!: () => void;
    const effect = new Promise<void>(r => { entered=r; }), gate = new Promise<void>(r => { release=r; });
    const slow = new ConnectorControl(db, { get bindingId() { return provider.bindingId; }, workspaceId: provider.workspaceId, source: (...args) => provider.source(...args), inspect: (...args) => provider.inspect(...args), async write(...args) { const observed = await provider.write(...args); entered(); await gate; return observed; } });
    const step = (await workflows.read(requester, revoked.runId)).steps[0];
    const pending = slow.execute(workerActor, step.action_id);
    await Promise.race([effect, pending.then(result => { throw Error(`Expected an in-flight effect, but execution returned ${result.state}`); }), new Promise<never>((_, reject) => { const t = setTimeout(() => reject(Error("Post-effect gate timed out")), 15000); t.unref(); })]);
    await db.query("UPDATE ll_members SET active=false WHERE email='requester'"); release();
    assert.equal((await pending).state, "uncertain");
    await assert.rejects(() => activity.advanceContract(revoked), /owner/);
    assert.equal(await effects(), before+3);
    pass("Owner revoked after actual CRM HTTP effect leaves uncertainty and prevents all downstream email");
    const files = ["lib/connectors/request.ts","lib/connectors/content.ts","lib/connectors/record-scope.ts","lib/connectors/scopes.ts","lib/connectors/scope-schema.sql","lib/enquiries/record-routing-schema.sql","runtime/temporal/record-routing.ts","runtime/temporal/outbox.ts","runtime/temporal/version-contract.ts","lib/enquiries/runner.ts","lib/durable/proposal-schema.sql","lib/refunds/schema.sql","lib/connectors/contracts.ts","lib/connectors/service.ts","lib/connectors/twin.ts","lib/connectors/hosted.ts","lib/enquiries/service.ts","lib/workflows/guard.ts","lib/durable/recovery.ts","lib/durable/service.ts","lib/workspace/identity.ts","runtime/temporal/outbox.ts", "runtime/temporal/version-contract.ts", "runtime/temporal/activities.ts", "runtime/temporal/pinned-workflow.ts", "lib/enquiries/dispatch.ts", "lib/enquiries/runner.ts", "lib/enquiries/temporal-schema.sql", "lib/connectors/service.ts", "lib/workflows/service.ts", "lib/durable/service.ts","lib/workspace/identity.ts", "scripts/temporal-dispatch-proof.ts"];
    const fingerprints = Object.fromEntries(await Promise.all(files.map(async f => [f, createHash("sha256").update(await readFile(f)).digest("hex")])));
    await writeFile("docs/evidence/temporal-dispatch-proof.json", JSON.stringify({ at: new Date().toISOString(), scope: "Actual Temporal, isolated PostgreSQL and private HTTP twins; no production cutover", checks, sourceFingerprints: fingerprints, limitations: ["Scheduler lease expiry injected in isolated schema", "Workspace-wide transaction lock retained; no throughput or production HA claim", "External request already sent cannot be recalled; uncertainty contains downstream", "Hosted atomic CRM guard and actual provider test-mode acceptance remain blocked"] }, null, 2)+"\n");
  } finally {
    await env?.teardown();
    if (twin && twin.exitCode === null) { twin.kill("SIGTERM"); await new Promise(r => twin!.once("exit", r)); }
    await db.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); await rm(dir, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e.message); process.exitCode=1; });
