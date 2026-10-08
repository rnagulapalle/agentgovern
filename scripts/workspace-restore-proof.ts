// Actual PostgreSQL archive rollback with provider effects kept outside the backup.
import { Pool } from "pg";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdtemp, rm, chmod, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { authenticate, tokenHash } from "../lib/durable/service";
import { quarantineRestore } from "../lib/durable/recovery";
import { ConnectorControl } from "../lib/connectors/service";
import { FetchSandboxConnectors } from "../lib/connectors/twin";
import { WorkflowControl } from "../lib/workflows/service";
import { EnquiryControl } from "../lib/enquiries/service";
import { TemporalOutbox } from "../runtime/temporal/outbox";
import { activities } from "../runtime/temporal/activities";
import { versionedActivities, type RunContract } from "../runtime/temporal/version-contract";
const command = promisify(execFile), wait = (ms: number) => new Promise(r => setTimeout(r, ms));
async function main() {
  const url = process.env.LOOPLABS_TEST_DATABASE_URL;
  if (!url) throw Error("Dedicated test PostgreSQL required.");
  const originalEpoch = process.env.LOOPLABS_RECOVERY_EPOCH;
  await mkdir(".local", { recursive: true, mode: 0o700 });
  const dir = await mkdtemp(resolve(".local/workspace-restore-")); await chmod(dir, 0o700);
  const schema = `restore_${randomBytes(8).toString("hex")}`, initial = randomUUID(), next = randomUUID();
  const admin = new Pool({ connectionString: url }), db = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  let twin: ChildProcess | undefined, temporal: TestWorkflowEnvironment | undefined;
  const checks: string[] = [], pass = (s: string) => { checks.push(s); console.log("PASS", s); };
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    for (const file of ["lib/durable/schema.sql", "lib/workspace/schema.sql", "lib/connectors/schema.sql", "lib/workflows/schema.sql", "lib/enquiries/schema.sql", "lib/enquiries/managed-schema.sql", "lib/enquiries/temporal-schema.sql"]) await db.query(await readFile(file, "utf8"));
    await db.query("INSERT INTO ll_orgs(id) VALUES('local-proof')");
    await db.query("CREATE TABLE ll_migrations(version integer PRIMARY KEY,digest text NOT NULL)");
    await db.query("INSERT INTO ll_migrations VALUES(9,$1)", [createHash("sha256").update(await readFile("lib/enquiries/temporal-schema.sql")).digest("hex")]);
    const isolated = new URL(url); isolated.searchParams.set("options", `-c search_path=${schema}`);
    const recoveryEnv = { ...process.env, LOOPLABS_MIGRATION_DATABASE_URL: isolated.toString(), LOOPLABS_WORKSPACE_ID: "local-proof", LOOPLABS_RECOVERY_EPOCH: initial };
    await command(process.execPath, ["--import", "tsx", "scripts/workspace-recovery.ts", "enroll"], { env: recoveryEnv });
    await command(process.execPath, ["--import", "tsx", "scripts/workspace-recovery.ts", "enroll"], { env: recoveryEnv });
    process.env.LOOPLABS_RECOVERY_EPOCH = initial;
    await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('requester','local-proof','Requester','unused'),('reviewer','local-proof','Reviewer','unused')");
    await db.query("INSERT INTO ll_connector_policies(org_id,connector) VALUES('local-proof','crm'),('local-proof','email')");
    const keys: string[] = [], actors = [];
    for (const [subject, role] of [["requester", "operator"], ["reviewer", "operator"], ["enquiry-temporal", "worker"]]) {
      const key = randomBytes(32).toString("base64url"); keys.push(key);
      await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'local-proof',$2,$3)", [tokenHash(key), subject, role]);
      actors.push(await authenticate(db, key));
    }
    const [requester, reviewer, worker] = actors;
    const token = randomBytes(32).toString("base64url");
    await writeFile(`${dir}/connector-twin-credentials.json`, JSON.stringify({ token }), { mode: 0o600 });
    const backend = process.env.FETCHSANDBOX_BACKEND_PATH || `${process.env.HOME}/sandbox/backend`;
    twin = spawn(`${backend}/.venv/bin/python`, ["scripts/connector-twin.py"], { env: { ...process.env, LOOPLABS_CONNECTOR_STATE_DIR: dir }, stdio: "ignore" });
    const provider = new FetchSandboxConnectors("http://127.0.0.1:8018", token);
    for (let i = 0;; i++) { try { await provider.contact(); break; } catch { if (i > 100 || twin.exitCode !== null) throw Error("Private twin unavailable; port 8018 must be free."); await wait(100); } }
    const connector = new ConnectorControl(db, provider), workflows = new WorkflowControl(db, connector);
    const enquiries = new EnquiryControl(db, workflows, async () => { const c = await provider.contact(); return { id: c.id, email: c.properties.email, version: c.updatedAt, lifecycle: c.properties.lifecyclestage }; });
    const make = async () => {
      const p = (await enquiries.prepareChat(requester, randomUUID())).saved; await enquiries.rehearse(requester, p.id, p.plan_hash);
      return { runId: p.id, planHash: p.plan_hash, planVersion: "acknowledgement-1", connectorVersion: "private-twin-1" } as RunContract;
    };
    const approved = await make(), held = await make(), outbox = new TemporalOutbox(db);
    const workflowId = await outbox.transfer(requester, approved.runId); await outbox.transfer(requester, held.runId);
    for (const step of (await workflows.read(requester, approved.runId)).steps) await connector.review(reviewer, step.action_id, step.payload_hash, true);
    const savedIds = (await db.query("SELECT run_id,ordinal,action_id FROM ll_workflow_steps ORDER BY run_id,ordinal")).rows;
    const pg = new URL(url), pgEnv = { ...process.env, PGHOST: pg.hostname, PGPORT: pg.port || "5432", PGUSER: decodeURIComponent(pg.username), PGPASSWORD: decodeURIComponent(pg.password), PGDATABASE: pg.pathname.slice(1) };
    const archive = resolve(dir, "workspace.dump");
    await command("pg_dump", ["--format=custom", "--no-owner", "--no-acl", `--schema=${schema}`, `--file=${archive}`], { env: pgEnv }); await chmod(archive, 0o600);
    const backupHash = createHash("sha256").update(await readFile(archive)).digest("hex");
    pass("Actual PostgreSQL custom archive contains stable held and independently approved actions before provider effects");
    temporal = await TestWorkflowEnvironment.createLocal();
    const queue = `restore-${randomUUID()}`;
    assert.equal(await outbox.tick(worker, temporal.client, queue), 2);
    const executor = await Worker.create({ connection: temporal.nativeConnection, taskQueue: queue, workflowsPath: resolve("runtime/temporal/pinned-workflow.ts"), activities: versionedActivities(db, worker, activities(workflows, worker)), shutdownGraceTime: "1 second" });
    await executor.runUntil(async () => { assert.equal(await temporal!.client.workflow.getHandle(workflowId).result(), "completed"); });
    const effects = async () => JSON.parse(await readFile(`${dir}/connector-twin-state.json`, "utf8")).effects;
    const before = await effects(); assert.equal(Object.keys(before).length, 2);
    await db.query("UPDATE ll_tokens SET active=false WHERE org_id='local-proof'"); await db.query("UPDATE ll_members SET active=false WHERE org_id='local-proof'");
    // Deployment configuration stays OUTSIDE the database archive. All writers
    // were stopped; changing the epoch before restore invalidates rolled-back authority.
    process.env.LOOPLABS_RECOVERY_EPOCH = next;
    const start = performance.now();
    await command("pg_restore", ["--dbname", pg.pathname.slice(1), "--clean", "--if-exists", "--single-transaction", "--no-owner", "--no-acl", `--schema=${schema}`, archive], { env: pgEnv });
    assert.deepEqual((await db.query("SELECT run_id,ordinal,action_id FROM ll_workflow_steps ORDER BY run_id,ordinal")).rows, savedIds);
    assert.equal((await db.query("SELECT state FROM ll_workflow_runs WHERE id=$1", [approved.runId])).rows[0].state, "active");
    assert.equal((await db.query("SELECT count(*)::int AS n FROM ll_tokens WHERE active")).rows[0].n, 7);
    await assert.rejects(() => authenticate(db, keys[0]), /contained/);
    await assert.rejects(() => connector.execute(worker, savedIds.find(s => s.run_id === approved.runId)!.action_id), /contained/);
    assert.deepEqual(await effects(), before);
    pass("Real pg_restore rolls back completion and revocation; external recovery epoch refuses resurrected credentials and delayed execution before quarantine");
    await assert.rejects(() => command(process.execPath, ["--import", "tsx", "scripts/workspace-recovery.ts", "quarantine"], { env: { ...recoveryEnv, LOOPLABS_RECOVERY_EPOCH: next, LOOPLABS_RESTORE_ARCHIVE: archive, LOOPLABS_RESTORE_ACK: "" } }));
    await command(process.execPath, ["--import", "tsx", "scripts/workspace-recovery.ts", "quarantine"], { env: { ...recoveryEnv, LOOPLABS_RECOVERY_EPOCH: next, LOOPLABS_RESTORE_ARCHIVE: archive, LOOPLABS_RESTORE_ACK: "WRITERS_STOPPED_AND_EPOCH_ROTATED" } });
    const counts = await quarantineRestore(db, "local-proof", next, backupHash);
    assert.deepEqual(await quarantineRestore(db, "local-proof", next, backupHash), counts);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM ll_tokens WHERE active")).rows[0].n, 0);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM ll_connector_actions WHERE approved_by IS NOT NULL OR lease_token IS NOT NULL")).rows[0].n, 0);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM ll_workflow_runs WHERE state='paused'")).rows[0].n, 2);
    await assert.rejects(() => authenticate(db, keys[0]), /credentials/);
    pass("Atomic idempotent restore quarantine revokes all old identities, clears approvals and leases, and pauses both restored runs without rewriting IDs or budgets");
    const fresh = randomBytes(32).toString("base64url");
    await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'local-proof','recovery-reviewer','operator')", [tokenHash(fresh)]);
    const recovery = await authenticate(db, fresh);
    for (const step of (await workflows.read(recovery, approved.runId)).steps) assert.equal((await connector.reconcile(recovery, step.action_id)).state, "succeeded");
    for (const step of (await workflows.read(recovery, held.runId)).steps) assert.equal((await connector.reconcile(recovery, step.action_id)).state, "uncertain");
    assert.deepEqual(await effects(), before);
    assert.equal((await workflows.read(recovery, approved.runId)).state, "paused");
    pass("Fresh recovery identity reads back the two existing HTTP twin effects; unknown held actions stay uncertain and no email or CRM write is resent");
    assert.equal((await temporal.client.workflow.getHandle(workflowId).describe()).status.name, "COMPLETED");
    assert.deepEqual((await db.query("SELECT run_id,ordinal,action_id FROM ll_workflow_steps ORDER BY run_id,ordinal")).rows, savedIds);
    const files = ["lib/durable/recovery.ts", "lib/durable/recovery-schema.sql", "lib/durable/service.ts", "lib/connectors/service.ts", "lib/workflows/service.ts", "runtime/temporal/outbox.ts", "runtime/temporal/version-contract.ts", "runtime/temporal/activities.ts", "scripts/workspace-recovery.ts", "scripts/workspace-restore-proof.ts"];
    const sourceFingerprints = Object.fromEntries(await Promise.all(files.map(async f => [f, createHash("sha256").update(await readFile(f)).digest("hex")])));
    await writeFile("docs/evidence/workspace-restore-proof.json", JSON.stringify({ at: new Date().toISOString(), scope: "Actual PostgreSQL pg_dump/pg_restore, local Temporal and private HTTP twin effects outside the archive; no production cutover", checks, measurements: { restoredRuns: 2, finalEffects: 2, restoreAndReconcileMs: Math.round(performance.now() - start) }, backupHash, counts, sourceFingerprints, limitations: ["One isolated schema on dedicated test PostgreSQL, not entire-cluster/WAL/PITR or replicated failover", "Deployment epoch rotation and stopped writers are mandatory external operational steps; undeclared restore cannot be automatically detected", "No automatic resume or reconstruction of approvals lost after backup; paused work requires new reviewed plan", "Single-workspace recovery epoch configuration; multi-workspace configuration is not established", "Readback proves provider-twin effects, not real delivery or customer-provider retention", "Backup confidentiality, remote storage, independent security review and measured RPO/RTO remain open"] }, null, 2) + "\n");
  } finally {
    if (originalEpoch === undefined) delete process.env.LOOPLABS_RECOVERY_EPOCH; else process.env.LOOPLABS_RECOVERY_EPOCH = originalEpoch;
    await temporal?.teardown();
    if (twin && twin.exitCode === null) { const done = new Promise(r => twin!.once("exit", r)); twin.kill("SIGTERM"); await done; }
    await db.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); await rm(dir, { recursive: true, force: true });
  }
}
main().catch(e => { console.error("Workspace restore proof failed:", e.message); process.exitCode = 1; });
