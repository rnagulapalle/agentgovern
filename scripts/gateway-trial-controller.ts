import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { Pool } from "pg";
const c = JSON.parse(readFileSync("/run/controller.json", "utf8"));
const db = new Pool({ connectionString: process.env.LOOPLABS_DATABASE_URL });
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
const api = async (path: string, body?: unknown, expectedStatus = 200) => {
  const r = await fetch(c.origin + path, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${c.operator}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000), redirect: "error" });
  assert.equal(r.status, expectedStatus, "Trusted trial operation refused"); return r.json();
};
const provider = async (path: string) => {
  const r = await fetch(`http://connector-twin:8018${path}`, { headers: { Authorization: `Bearer ${c.provider}` }, signal: AbortSignal.timeout(5000) }); assert.equal(r.status, 200); return r.json();
};
async function main() {
  const mode = process.argv[2];
  if (mode === "seed") {
    for (const f of ["lib/durable/schema.sql", "lib/workspace/schema.sql", "lib/connectors/schema.sql", "lib/workflows/schema.sql", "lib/enquiries/schema.sql", "lib/durable/recovery-schema.sql"]) await db.query(readFileSync(`/app/${f}`, "utf8"));
    await db.query("INSERT INTO ll_orgs(id) VALUES('local-proof')");
    assert(typeof process.env.LOOPLABS_RECOVERY_EPOCH === "string");
    await db.query("INSERT INTO ll_workspace_recovery(org_id,epoch) VALUES('local-proof',$1)", [process.env.LOOPLABS_RECOVERY_EPOCH]);
    await db.query("INSERT INTO ll_agents(org_id,id,tools,action_limit) VALUES('local-proof','trial-agent',ARRAY['twin.crm','twin.email'],5)");
    await db.query("INSERT INTO ll_connector_policies(org_id,connector) VALUES('local-proof','crm'),('local-proof','email')");
    await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'local-proof','trial-agent','agent')", [digest(c.agent)]);
    await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('reviewer@example.test','local-proof','Trial reviewer','unused')");
    await db.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES($1,'reviewer@example.test',now()+interval '1 hour')", [digest(c.operator)]);
    const r = await api("/api/durable/workflows", { operation: "create", runId: randomUUID(), crmAgent: "trial-agent", emailAgent: "trial-agent" });
    const run = await api(`/api/durable/workflows?run=${r.id}`); const record = await provider("/crm/crm/v3/objects/contacts/1001"); assert.equal(record.properties.lifecyclestage, "lead");
    console.log(JSON.stringify({ run: run.id, crm: run.steps[0].action_id, email: run.steps[1].action_id }));
  } else if (mode === "fence" || mode === "unfence") {
    await db.query("UPDATE ll_workspace_recovery SET epoch=$1 WHERE org_id='local-proof'", [mode === "fence" ? randomUUID() : process.env.LOOPLABS_RECOVERY_EPOCH]);
    assert.equal((await db.query("SELECT count(*)::int n FROM ll_connector_actions WHERE state='held'")).rows[0].n, 1);
    console.log(JSON.stringify({ passed: true, mode }));
  } else if (mode === "zero") {
    assert.equal((await db.query("SELECT count(*)::int n FROM ll_connector_actions")).rows[0].n, 0);
    assert.equal((await provider("/crm/crm/v3/objects/contacts/1001")).properties.lifecyclestage, "lead");
    console.log(JSON.stringify({ passed: true, mode }));
  } else if (mode === "execute-crm" || mode === "execute-email") {
    const id = mode === "execute-crm" ? c.crm : c.email;
    const a = await api(`/api/durable/connectors?action=${id}`); assert.equal(a.state, "held");
    await api("/api/durable/connectors", { operation: "approve", actionId: id, payloadHash: a.payload_hash });
    const dispatched = await api("/api/durable/connectors", { operation: "execute", actionId: id, ...(mode === "execute-crm" ? { lostResponse: true } : {}) });
    assert.equal(dispatched.state, mode === "execute-crm" ? "uncertain" : "succeeded");
    console.log(JSON.stringify({ passed: true, mode }));
  } else if (mode === "verify" || mode === "readback") {
    if (mode === "verify") {
      await api("/api/durable/connectors", { operation: "reconcile", actionId: c.crm });
      await api("/api/durable/workflows", { operation: "verify", runId: c.run });
    } else {
      // A completed run is terminal: do not turn a persistence readback into re-authorization.
      await api("/api/durable/workflows", { operation: "verify", runId: c.run }, 409);
    }
    const completed = await api(`/api/durable/workflows?run=${c.run}`);
    assert.equal(completed.state, "completed");
    assert.equal(completed.steps.length, 2);
    assert.equal((await db.query("SELECT count(*)::int n FROM ll_workflow_events WHERE org_id='local-proof' AND run_id=$1 AND kind='verified'", [c.run])).rows[0].n, 1);
    for (const id of [c.crm, c.email]) { const a = await api(`/api/durable/connectors?action=${id}`); assert.equal(a.state, "succeeded"); assert.equal((await provider(`/proof/effects/${id}`)).actionId, id); }
    const emailEffect = await provider(`/proof/effects/${c.email}`);
    const message = await provider(`/email/emails/${encodeURIComponent(emailEffect.reference)}`);
    assert.equal(message.id, emailEffect.reference);
    assert.deepEqual(message.to, ["customer@example.test"]);
    assert.equal(message.subject, "We received your case");
    assert.equal(message.text, "Your request was received. A team member will review it.");
    assert.equal(message.from, "LoopLabs <support@looplabs.example>");
    assert(["sent", "delivered"].includes(message.last_event));
    assert.equal((await provider("/crm/crm/v3/objects/contacts/1001")).properties.lifecyclestage, "customer");
    assert.equal((await db.query("SELECT count(*)::int n FROM ll_connector_actions")).rows[0].n, 2);
    assert.equal((await db.query("SELECT reserved FROM ll_agents WHERE id='trial-agent'")).rows[0].reserved, 2);
    console.log(JSON.stringify({ passed: true, mode }));
  } else if (mode === "reconcile-crm") {
    const a = await api("/api/durable/connectors", { operation: "reconcile", actionId: c.crm }); assert.equal(a.state, "succeeded"); console.log(JSON.stringify({ passed: true, mode }));
  } else if (mode === "revoke") {
    await db.query("UPDATE ll_tokens SET active=false WHERE hash=$1", [digest(c.agent)]); console.log(JSON.stringify({ passed: true, mode }));
  } else throw Error("Unknown controller mode");
}
main().catch((e) => { console.error(JSON.stringify({ trialController: "refused", mode: process.argv[2], code: typeof e?.code === "string" && /^[A-Z0-9]{5}$/.test(e.code) ? e.code : undefined, status: Number.isInteger(e?.actual) ? e.actual : undefined })); process.exitCode = 1; }).finally(() => db.end());
