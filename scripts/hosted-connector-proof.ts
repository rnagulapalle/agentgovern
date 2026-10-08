// Actual LoopLabs HTTP handlers -> existing FetchSandbox hosted API and provider HTTP.
// Uses dedicated test databases and generated credentials only.
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { tokenHash } from "../lib/durable/service";
import type { HostedBinding } from "../lib/connectors/hosted";
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
const base = "http://127.0.0.1:8019";
async function main() {
  const url = process.env.LOOPLABS_TEST_DATABASE_URL;
  if (!url) throw Error("Dedicated test database required.");
  const backend = process.env.FETCHSANDBOX_BACKEND_PATH || `${process.env.HOME}/sandbox/backend`;
  const dir = await mkdtemp(resolve(".local/hosted-connector-proof-"));
  const schema = `proof_hosted_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: url });
  const db = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  const children: ChildProcess[] = [];
  const checks: { name: string; passed: boolean }[] = [];
  let lossEvidence: Record<string, unknown> = {};
  const check = (name: string) => { checks.push({ name, passed: true }); console.log(`PASS ${name}`); };
  async function call(origin: string, path: string, key: string, value?: object) {
    const r = await fetch(origin + path, { redirect: "error", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, ...(value ? { method: "POST", body: JSON.stringify(value) } : {}) });
    return { status: r.status, data: await r.json() };
  }
  try {
    const host = spawn(`${backend}/.venv/bin/python`, [`${backend}/tests/looplabs_hosted_server.py`], { env: { ...process.env, LOOPLABS_HOSTED_PROOF_DIR: dir }, stdio: ["ignore", "pipe", "pipe"] });
    children.push(host);
    let keys: { ownerKey: string; otherKey: string } | undefined;
    for (let i = 0; i < 150; i++) {
      if (host.exitCode !== null || host.signalCode !== null) throw Error("Isolated hosted API exited before readiness.");
      try { keys = JSON.parse(await readFile(`${dir}/ready.json`, "utf8")); if ((await fetch(base + "/api/mcp/health")).ok) break; } catch {}
      await delay(100);
    }
    assert(keys, "Hosted API readiness missing");
    const created = await call(base, "/api/mcp/validate_integration", keys.ownerKey, { providers: ["hubspot", "resend"], environment_scope: "owner" });
    assert.equal(created.status, 200);
    const session = created.data;
    const prepared = await call(base, "/api/mcp/validate_integration", keys.ownerKey, { session_id: session.session_id, fixtures: { id: "looplabs-contact-v1", steps: [
      { spec: "hubspot", name: "contact", method: "POST", path: "/crm/v3/objects/contacts", body: { properties: { email: "customer@example.test", lifecyclestage: "lead" } } },
      { spec: "hubspot", name: "read contact", method: "GET", path: "/crm/v3/objects/contacts/{{step1.id}}", assertion: { select: "id", equals: "{{step1.id}}", required: true, count: 1 } },
    ] } });
    assert.equal(prepared.status, 200); assert(prepared.data.fixture.ready);
    const binding: HostedBinding = { origin: base, ownerKey: keys.ownerKey, workspaceId: "local-proof", contactId: prepared.data.fixture.steps[0].resource_id, legs: {
      crm: { sandboxId: session.legs.hubspot.sandbox_id, apiKey: session.legs.hubspot.api_key },
      email: { sandboxId: session.legs.resend.sandbox_id, apiKey: session.legs.resend.api_key },
    } };
    for (const key of ["", keys.otherKey]) assert([401, 403].includes((await call(base, `/api/sandboxes/${binding.legs.email.sandboxId}/archive`, key)).status));
    check("Native owner API keys provision isolated paired environments; other owners cannot inspect evidence");
    await admin.query(`CREATE SCHEMA ${schema}`);
    for (const f of ["lib/durable/schema.sql", "lib/workspace/schema.sql", "lib/refunds/schema.sql", "lib/connectors/schema.sql", "lib/workflows/schema.sql", "lib/durable/proposal-schema.sql", "lib/enquiries/schema.sql", "lib/enquiries/managed-schema.sql"]) await db.query(await readFile(f, "utf8"));
    await db.query("INSERT INTO ll_orgs(id) VALUES('local-proof')");
    await db.query("INSERT INTO ll_connector_policies(org_id,connector) VALUES('local-proof','crm'),('local-proof','email')");
    await db.query("INSERT INTO ll_agents(org_id,id,tools,action_limit) VALUES('local-proof','crm-agent',ARRAY['twin.crm'],100),('local-proof','email-agent',ARRAY['twin.email'],100)");
    const actors: Record<string, string> = {};
    for (const [role, subject] of [["agent", "crm-agent"], ["agent", "email-agent"], ["operator", "reviewer"], ["worker", "executor"]]) {
      const key = randomBytes(32).toString("base64url"); actors[subject] = key;
      await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'local-proof',$2,$3)", [tokenHash(key), subject, role]);
    }
    const isolated = new URL(url); isolated.searchParams.set("options", `-c search_path=${schema}`);
    const api = spawn(process.execPath, ["--import", "tsx", "scripts/workflow-http-proof-server.ts"], { env: { ...process.env, LOOPLABS_DATABASE_URL: isolated.toString(), LOOPLABS_FETCHSANDBOX_BINDING: JSON.stringify(binding) }, stdio: ["ignore", "pipe", "pipe"] });
    children.push(api); let output = "", origin = ""; api.stdout!.on("data", b => { output += String(b); });
    for (let i = 0; i < 100; i++) { if (api.exitCode !== null || api.signalCode !== null) throw Error("LoopLabs HTTP handlers failed to start"); const match = output.match(/\{"port":(\d+)\}/); if (match) { origin = `http://127.0.0.1:${match[1]}`; break; } await delay(100); }
    assert(origin, "LoopLabs HTTP readiness missing");
    async function apiCall(path: string, subject: string, value?: object) { return call(origin, path, actors[subject], value); }
    const hostedPlan = await apiCall("/api/workspace/enquiries", "reviewer", { operation: "prepare", id: randomUUID(), fixtureId: "service" });
    assert.equal(hostedPlan.status, 200); assert.equal(hostedPlan.data.saved.plan.contact.id, binding.contactId);
    const managed = await apiCall("/api/workspace/enquiries", "reviewer", { operation: "rehearse", id: hostedPlan.data.saved.id, planHash: hostedPlan.data.saved.plan_hash });
    assert.equal(managed.status, 409); assert(managed.data.error.includes("atomic approval-version"));
    assert.equal((await db.query("SELECT count(*) FROM ll_connector_actions")).rows[0].count, "0");
    check("Managed hosted rehearsal refuses the missing atomic CRM guarantee before submitting any action");
    async function proposeEmail() {
      const id = randomUUID(); const proposed = await apiCall("/api/durable/connectors", "email-agent", { operation: "propose", actionId: id, agentId: "email-agent", connector: "email", payload: { template: "case_received" } });
      assert.equal(proposed.status, 200);
      assert.equal((await apiCall("/api/durable/connectors", "email-agent", { operation: "approve", actionId: id, payloadHash: proposed.data.payload_hash })).status, 403);
      const approved = await apiCall("/api/durable/connectors", "reviewer", { operation: "approve", actionId: id, payloadHash: proposed.data.payload_hash }); assert.equal(approved.data.state, "ready"); return id;
    }
    async function rows(id: string) { const result = await call(base, `/api/sandboxes/${binding.legs.email.sandboxId}/archive?kind=request&flow_run_id=looplabs-${id}`, keys!.ownerKey); return result.data.events.map((e: { payload: Record<string, unknown> }) => e.payload).filter((r: Record<string, unknown>) => r.method === "POST"); }
    const normal = await proposeEmail();
    assert.equal((await apiCall("/api/durable/connectors", "executor", { operation: "execute", actionId: normal })).data.state, "succeeded");
    assert.equal((await rows(normal)).length, 1);
    check("LoopLabs exact named approval executes one hosted Resend acceptance and independently reads it back");
    await apiCall("/api/durable/connectors", "executor", { operation: "execute", actionId: normal }); assert.equal((await rows(normal)).length, 1);
    check("Repeating LoopLabs execution does not send a second email");
    const lost = await proposeEmail();
    assert.equal((await call(base, `/api/sandboxes/${binding.legs.email.sandboxId}/scenario`, keys.ownerKey, { scenario: "accepted_response_loss" })).status, 200);
    const uncertain = await apiCall("/api/durable/connectors", "executor", { operation: "execute", actionId: lost }); assert.equal(uncertain.data.state, "uncertain");
    assert.equal((await rows(lost)).length, 1);
    assert.equal((await apiCall("/api/durable/connectors", "reviewer", { operation: "reconcile", actionId: lost })).data.state, "succeeded");
    assert.equal((await rows(lost)).length, 1);
    let held;
    for (let i = 0; i < 40; i++) {
      [held] = await rows(lost);
      if (held?.response_transport?.client_disconnected_at) break;
      await delay(500);
    }
    assert.equal(held.response_status, 200);
    assert.equal(held.response_transport.delay_ms, 15000);
    assert(held.response_transport.client_disconnected_at);
    assert(Date.parse(held.response_transport.client_disconnected_at) < Date.parse(held.response_transport.delay_completed_at));
    lossEvidence = { acceptedRequestId: held.id, acceptedStatus: held.response_status, transport: held.response_transport, providerWritesAfterReconciliation: (await rows(lost)).length };
    check("Real fifteen-second provider hold exceeds client deadline; LoopLabs reconciles acceptance without resending");
    await call(base, `/api/sandboxes/${binding.legs.email.sandboxId}/scenario`, keys.ownerKey, { scenario: "default" });
    // Deliberately broken control: an extra, wrong-recipient send is correlated to a successful action.
    const poison = await fetch(`${base}/sandbox/${binding.legs.email.sandboxId}/emails`, { method: "POST", headers: { Authorization: `Bearer ${binding.legs.email.apiKey}`, "Content-Type": "application/json", "X-Flow-Run-Id": `looplabs-${normal}` }, body: JSON.stringify({ from: "LoopLabs <support@looplabs.example>", to: ["wrong@example.test"], subject: "Wrong message", text: "Broken control" }) });
    assert.equal(poison.status, 200);
    assert.equal((await apiCall("/api/durable/connectors", "reviewer", { operation: "reconcile", actionId: normal })).data.state, "conflict");
    check("Deliberately broken extra/wrong-recipient acceptance turns a prior success into conflict");
    const workflow = await apiCall("/api/durable/workflows", "reviewer", { operation: "create", crmAgent: "crm-agent", emailAgent: "email-agent", runId: randomUUID() }); assert.equal(workflow.status, 200);
    for (const subject of ["crm-agent", "email-agent"]) {
      const plan = await apiCall(`/api/durable/workflows?run=${workflow.data.id}`, subject);
      for (const step of plan.data.steps) await apiCall("/api/durable/connectors", subject, { operation: "propose", actionId: step.action_id, agentId: step.agent_id, connector: step.connector, payload: step.payload });
    }
    const plan = (await apiCall(`/api/durable/workflows?run=${workflow.data.id}`, "reviewer")).data;
    for (const step of plan.steps) assert.equal((await apiCall("/api/durable/connectors", "reviewer", { operation: "approve", actionId: step.action_id, payloadHash: step.payload_hash })).status, 200);
    const [crm, email] = plan.steps;
    assert.equal((await apiCall("/api/durable/connectors", "executor", { operation: "execute", actionId: crm.action_id })).data.state, "uncertain");
    assert.equal((await apiCall("/api/durable/connectors", "executor", { operation: "execute", actionId: email.action_id })).status, 409);
    assert.equal((await rows(email.action_id)).length, 0);
    check("Unsupported atomic CRM version guard keeps the complete workflow held; no downstream email or false green");
    const files = ["lib/durable/proposal-schema.sql","lib/refunds/schema.sql","lib/durable/recovery.ts","lib/durable/service.ts","lib/enquiries/service.ts", "lib/enquiries/contracts.ts", "app/api/workspace/enquiries/route.ts", "lib/durable/service.ts", "lib/workflows/service.ts", "lib/enquiries/dispatch.ts", "lib/connectors/hosted.ts", "lib/connectors/twin.ts", "lib/connectors/service.ts", "app/api/durable/connectors/route.ts", "app/api/durable/workflows/route.ts", "scripts/hosted-connector-proof.ts", "scripts/workflow-http-proof-server.ts"];
    const fingerprints: Record<string, string> = {};
    for (const file of files) fingerprints[file] = createHash("sha256").update(await readFile(file)).digest("hex");
    await writeFile("docs/evidence/hosted-connector-proof.json", JSON.stringify({ at: new Date().toISOString(), scope: "Actual LoopLabs HTTP handlers, isolated PostgreSQL, native FetchSandbox identity/API and Resend twin effects. No live provider or inbox delivery.", checks, acceptedResponseLossEvidence: lossEvidence, sourceFingerprints: fingerprints, limitations: ["CRM update cannot satisfy existing atomic approval-version invariant with this provider binding; downstream work stays held.", "Not a completed CRM-to-email workflow acceptance.", "No hosted provider restart/durable-session proof or production readiness claim."] }, null, 2) + "\n");
  } finally {
    for (const child of children.reverse()) if (child.exitCode === null && child.signalCode === null) { const done = new Promise<void>(r => child.once("exit", () => r())); child.kill("SIGKILL"); await done; }
    await db.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); await rm(dir, { recursive: true, force: true });
  }
}
main().catch(async e => { await writeFile(".local/hosted-proof-failure.log", String(e.stack || e), { mode: 0o600 }); console.error("Hosted connector proof failed; private diagnostics saved; no completion claimed."); process.exitCode = 1; });
