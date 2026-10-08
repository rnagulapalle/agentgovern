import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { authenticate, tokenHash, DurableControl } from "../durable/service";
import type { Actor } from "../durable/contracts";
import type { ConnectorAction, ConnectorProvider } from "../connectors/contracts";
import { ConnectorControl } from "../connectors/service";
import { WorkflowControl } from "../workflows/service";
import { TemporalOutbox } from "../../runtime/temporal/outbox";
import { WorkflowExecutionAlreadyStartedError, type Client } from "@temporalio/client";
import { EnquiryRunner } from "./runner";
import { ScopeControl } from "../connectors/scopes";
import { EnquiryControl } from "./service";
import { checkContact, enquiryFixture, validId, type Contact } from "./contracts";
import { EnquiryChat, type Intent } from "./chat";
const schema = `enquiry_${randomBytes(8).toString("hex")}`;
let db: Pool, admin: Pool, service: EnquiryControl, connector: ConnectorControl, workflow: WorkflowControl;
let operator: Actor, reviewer: Actor, agent: Actor, other: Actor;
let contact: Contact;
let writes = 0;
const keys: Record<string, string> = {};
vi.mock("../durable/database", async (original) => ({ ...(await original<typeof import("../durable/database")>()), database: () => db }));
vi.mock("../connectors/twin", async original => ({ ...(await original<typeof import("../connectors/twin")>()), FetchSandboxConnectors: class {
  workspaceId = "one";
  bindingId = "a".repeat(64);
  async request() { return { id: contact.id, properties: { email: contact.email, lifecyclestage: contact.lifecycle }, updatedAt: contact.version }; }
  async contact() { return this.request(); }
  async source(connector: string) { return connector === "crm" ? contact.version : null; }
} }));
const provider: Omit<ConnectorProvider, "bindingId"> & { bindingId: string } = {
  workspaceId: "one",
  bindingId: "a".repeat(64),
  source: async () => contact.version,
  write: async (_action: ConnectorAction, lose: boolean) => { if (_action.connector === "crm" && (_action.payload as { sourceVersion: string }).sourceVersion !== contact.version) return { outcome: "conflict", detail: "Atomic source-version check refused a stale write" }; writes++; if (lose) throw new Error("Lost after effect"); return { outcome: "verified", detail: "Fixture effect confirmed" }; },
  inspect: async () => ({ outcome: "verified", detail: "Fixture read-back confirmed" }),
};
beforeAll(async () => {
  if (!process.env.LOOPLABS_TEST_DATABASE_URL) throw new Error("Dedicated PostgreSQL is required for enquiry tests.");
  admin = new Pool({ connectionString: process.env.LOOPLABS_TEST_DATABASE_URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  db = new Pool({ connectionString: process.env.LOOPLABS_TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  for (const file of ["lib/durable/schema.sql", "lib/workspace/schema.sql", "lib/refunds/schema.sql", "lib/connectors/schema.sql", "lib/workflows/schema.sql", "lib/durable/proposal-schema.sql", "lib/enquiries/schema.sql", "lib/enquiries/managed-schema.sql", "lib/enquiries/temporal-schema.sql", "lib/connectors/scope-schema.sql"])
    await db.query(await readFile(file, "utf8"));
});
beforeEach(async () => {
  await db.query("TRUNCATE ll_orgs CASCADE");
  await db.query("INSERT INTO ll_orgs(id) VALUES('one'),('two')");
  await db.query("INSERT INTO ll_agents(org_id,id,tools,action_limit) VALUES('one','crm',ARRAY['twin.crm'],100),('one','email',ARRAY['twin.email'],100)");
  await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('operator','one','Operator','unused'),('reviewer','one','Reviewer','unused')");
  await db.query("INSERT INTO ll_connector_policies(org_id,connector) VALUES('one','crm'),('one','email')");
  const actors: Actor[] = [];
  for (const [subject, role, org] of [["operator", "operator", "one"], ["reviewer", "operator", "one"], ["crm", "agent", "one"], ["email", "agent", "one"], ["other", "operator", "two"]]) {
    const key = randomBytes(32).toString("base64url"); keys[subject] = key;
    await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,$2,$3,$4)", [tokenHash(key), org, subject, role]);
    actors.push(await authenticate(db, key));
  }
  [operator, reviewer, agent, , other] = actors;
  contact = { id: "1001", email: "customer@example.test", version: "v1", lifecycle: "lead" };
  writes = 0;
  provider.bindingId = "a".repeat(64);
  connector = new ConnectorControl(db, provider); workflow = new WorkflowControl(db, connector);
  service = new EnquiryControl(db, workflow, async () => contact);
});
afterAll(async () => { await db?.end(); await admin?.query(`DROP SCHEMA ${schema} CASCADE`); await admin?.end(); });
async function prepared() { return (await service.prepare(operator, randomUUID(), "service") as { saved: { id: string; plan_hash: string; plan: { crm: { lifecycle: string } } } }).saved; }

it("saves and resumes one immutable enquiry without creating effects or duplicate runs", async () => {
  const id = randomUUID();
  const [a, b] = await Promise.all([service.prepare(operator, id, "service"), service.prepare(operator, id, "service")]);
  expect(a).toEqual(b); expect(writes).toBe(0);
  const p = (await service.list(operator))[0];
  expect(p.plan.reply.reference).toBe("customer-acknowledgement-v1");
  const [x, y] = await Promise.all([service.start(operator, id, p.plan_hash, "crm", "email"), service.start(operator, id, p.plan_hash, "crm", "email")]);
  expect(x).toEqual(y);
  expect((await workflow.list(operator)).length).toBe(1);
  expect((await workflow.read(operator, id)).steps[0].payload).toEqual({ lifecycle: "lead" });
  contact.version = "v2";
  expect(await new EnquiryControl(db, workflow, async () => contact).start(operator, id, p.plan_hash, "crm", "email")).toEqual(x);
  expect((await service.list(operator))[0].run_id).toBe(id);
  expect(writes).toBe(0);
});
it("clarifies missing senders, unsupported matches and pricing instead of creating work", async () => {
  for (const id of ["missing", "unmatched", "pricing"]) expect(await service.prepare(operator, randomUUID(), id)).toHaveProperty("clarification");
  expect(await service.list(operator)).toEqual([]); expect(writes).toBe(0);
});
it("refuses stale records, policies, changed plan hashes and wrong agent capabilities", async () => {
  const p = await prepared();
  await expect(service.start(operator, p.id, "0".repeat(64), "crm", "email")).rejects.toThrow("plan changed");
  contact.version = "v2";
  await expect(service.start(operator, p.id, p.plan_hash, "crm", "email")).rejects.toThrow("record or policy changed");
  contact.version = "v1";
  await db.query("UPDATE ll_connector_policies SET version=version+1 WHERE connector='email'");
  await expect(service.start(operator, p.id, p.plan_hash, "crm", "email")).rejects.toThrow("record or policy changed");
  const q = await prepared();
  await expect(service.start(operator, q.id, q.plan_hash, "email", "crm")).rejects.toThrow("active scoped agent");
  expect(await workflow.list(operator)).toEqual([]);
});
it("refuses agent callers, revoked callers and unrelated workspaces", async () => {
  await expect(service.list(agent)).rejects.toThrow();
  await expect(service.prepare(agent, randomUUID(), "service")).rejects.toThrow();
  const p = await prepared();
  await expect(service.start(agent, p.id, p.plan_hash, "crm", "email")).rejects.toThrow();
  await expect(service.list(other)).rejects.toThrow();
  await db.query("UPDATE ll_tokens SET active=false WHERE subject='operator'");
  await expect(service.start(operator, p.id, p.plan_hash, "crm", "email")).rejects.toThrow();
});
it("preserves customers rather than downgrading them to leads", async () => {
  contact.lifecycle = "customer";
  const p = await prepared(); expect(p.plan.crm.lifecycle).toBe("customer");
  await service.start(operator, p.id, p.plan_hash, "crm", "email");
  expect((await workflow.read(operator, p.id)).steps[0].payload).toEqual({ lifecycle: "customer" });
});
it("holds a new proposal if its source changed after the plan became a workflow", async () => {
  const p = await prepared(); await service.start(operator, p.id, p.plan_hash, "crm", "email");
  const step = (await workflow.read(operator, p.id)).steps[0];
  contact.version = "v2";
  await expect(connector.propose(agent, { actionId: step.action_id, agentId: step.agent_id, connector: step.connector, payload: step.payload })).rejects.toThrow("after plan review");
  expect((await workflow.read(operator, p.id)).steps[0].state).toBeNull(); expect(writes).toBe(0);
});
it("holds downstream effects after a lost response and requires independent approval", async () => {
  const p = await prepared(); await service.start(operator, p.id, p.plan_hash, "crm", "email");
  const run = await workflow.read(operator, p.id);
  const actions = [];
  for (const step of run.steps) {
    const a = await connector.propose(operator, { actionId: step.action_id, agentId: step.agent_id, connector: step.connector, payload: step.payload });
    await expect(connector.review(operator, a.id, a.payload_hash, true)).rejects.toThrow();
    actions.push(await connector.review(reviewer, a.id, a.payload_hash, true));
  }
  await expect(connector.execute(operator, actions[1].id)).rejects.toThrow("preceding step");
  expect((await connector.execute(operator, actions[0].id, true)).state).toBe("uncertain");
  await expect(connector.execute(operator, actions[1].id)).rejects.toThrow("preceding step");
  await connector.reconcile(operator, actions[0].id); expect(writes).toBe(1);
  await connector.execute(operator, actions[1].id); await workflow.verify(operator, p.id);
  expect((await workflow.read(operator, p.id)).state).toBe("completed"); expect(writes).toBe(2);
});
it("prevents saved-plan mutation and conflicting replay enrollment", async () => {
  const p = await prepared();
  await expect(db.query("UPDATE ll_enquiry_plans SET plan='{}' WHERE id=$1", [p.id])).rejects.toThrow("cannot be rewritten");
  await expect(db.query("DELETE FROM ll_enquiry_plans WHERE id=$1", [p.id])).rejects.toThrow("cannot be rewritten");
  await service.start(operator, p.id, p.plan_hash, "crm", "email");
  await expect(service.start(operator, p.id, p.plan_hash, "email", "crm")).rejects.toThrow("different plan");
  const second = await prepared();
  await expect(db.query("UPDATE ll_enquiry_plans SET run_id=$1 WHERE id=$2", [second.id, p.id])).rejects.toThrow("cannot be rewritten");
});
it("cannot attach a reviewed plan to a pre-existing unrelated workflow", async () => {
  contact.lifecycle = "customer";
  const id = randomUUID();
  await workflow.create(operator, "crm", "email", id);
  const result = await service.prepare(operator, id, "service") as { saved: { plan_hash: string } };
  await expect(service.start(operator, id, result.saved.plan_hash, "crm", "email")).rejects.toThrow("unrelated work");
  expect((await service.list(operator))[0].run_id).toBeNull();
});
it("rejects malformed IDs, unavailable connectors, mismatched contacts and missing plans", async () => {
  for (const id of ["bad", null, 4]) expect(() => validId(id)).toThrow();
  expect(() => enquiryFixture("not-supported")).toThrow();
  for (const value of [null, { ...contact, id: "other" }, { ...contact, email: "other@example.test" }, { ...contact, version: "" }, { ...contact, version: 4 }, { ...contact, version: "x".repeat(257) }, { ...contact, lifecycle: "unknown" }]) expect(() => checkContact(value as Contact)).toThrow();
  await expect(service.prepare(operator, "bad", "service")).rejects.toThrow();
  await expect(service.start(operator, randomUUID(), "bad", "crm", "email")).rejects.toThrow();
  await expect(service.start(operator, randomUUID(), "a".repeat(64), "crm", "email")).rejects.toThrow("not found");
  await db.query("UPDATE ll_connector_policies SET active=false WHERE connector='email'");
  await expect(service.prepare(operator, randomUUID(), "service")).rejects.toThrow("Both sample connectors");
});
it("enforces authentication, origin, strict fields and sample-only inputs at the HTTP boundary", async () => {
  const { GET, POST } = await import("@/app/api/workspace/enquiries/route");
  const get = new NextRequest("https://looplabs.run/api/workspace/enquiries");
  expect((await GET(get)).status).toBe(401);
  const req = (p: object, who = "operator", origin = "https://looplabs.run") => new NextRequest(get.url, { method: "POST", headers: { Authorization: `Bearer ${keys[who]}`, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(p) });
  const id = randomUUID();
  expect((await POST(req({ operation: "checkConnections" }))).status).toBe(200);
  expect((await POST(req({ operation: "checkConnections" }, "crm"))).status).toBe(403);
  expect((await POST(req({ operation: "checkConnections", origin: "https://evil.test" }))).status).toBe(400);
  expect((await POST(req({ operation: "prepare", id, fixtureId: "service" }, "crm"))).status).toBe(403);
  expect((await POST(req({ operation: "prepare", id, fixtureId: "service" }, "operator", "https://evil.test"))).status).toBe(403);
  for (const p of [{ operation: "prepare", id, fixtureId: "service", message: "secret" }, { operation: "unknown" }, { operation: "prepare", id, fixtureId: "invalid" }, { operation: "start", id, planHash: "bad", crmAgent: "crm", emailAgent: "email" }]) expect((await POST(req(p))).status).toBe(400);
  const response = await POST(req({ operation: "prepare", id, fixtureId: "service" })); expect(response.status).toBe(200);
  const { saved } = await response.json();
  expect((await POST(req({ operation: "start", id, planHash: saved.plan_hash, crmAgent: "crm", emailAgent: "email" }))).status).toBe(200);
  const automatic = (await (await POST(req({ operation: "prepare", id: randomUUID(), fixtureId: "service" }))).json()).saved;
  expect((await POST(req({ operation: "rehearse", id: automatic.id, planHash: automatic.plan_hash, approve: true }))).status).toBe(400);
  expect((await POST(req({ operation: "rehearse", id: automatic.id, planHash: automatic.plan_hash }, "reviewer"))).status).toBe(403);
  expect((await POST(req({ operation: "rehearse", id: automatic.id, planHash: automatic.plan_hash }))).status).toBe(200);
  const list = await GET(new NextRequest(get.url, { headers: { Authorization: `Bearer ${keys.operator}` } }));
  expect(list.status).toBe(200); expect(list.headers.get("cache-control")).toBe("no-store");
});

it("chat clarifies before saving, rejects hallucinated recipients and replays one reviewed plan", async () => {
  const intent: Intent = { job: "acknowledgement", customerEmail: null, askFirst: true, rehearsal: true, extraActions: false };
  const planner = { interpret: vi.fn(async () => ({ ...intent })) };
  const chat = new EnquiryChat(service, planner), id = randomUUID();
  const turns = [{ role: "user" as const, text: "Rehearse a service acknowledgement and ask first" }];
  expect(await chat.respond(operator, id, turns)).toHaveProperty("clarification");
  expect(await service.list(operator)).toHaveLength(0);
  intent.customerEmail = "customer@example.test";
  expect(await chat.respond(operator, id, turns)).toHaveProperty("clarification");
  turns.push({ role: "user", text: "Use customer@example.test" });
  const a = await chat.respond(operator, id, turns), b = await chat.respond(operator, id, turns);
  expect(a).toEqual(b); expect(await service.list(operator)).toHaveLength(1);
  expect((await service.list(operator))[0].run_id).toBeNull(); expect(await workflow.list(operator)).toHaveLength(0); expect(writes).toBe(0);
  await expect(service.prepare(operator, id, "service")).rejects.toThrow("different work");
});
it("chat never admits unsupported work, missing consent or conflicting customer details", async () => {
  const intent: Intent = { job: "acknowledgement", customerEmail: "customer@example.test", askFirst: true, rehearsal: true, extraActions: false };
  const planner = { interpret: vi.fn(async () => ({ ...intent })) }, chat = new EnquiryChat(service, planner);
  const turns = [{ role: "user" as const, text: "Rehearse for customer@example.test" }];
  for (const patch of [{ job: "unsupported" as const }, { extraActions: true }, { rehearsal: false }, { askFirst: false }, { customerEmail: "wrong@example.test" }]) {
    planner.interpret.mockResolvedValueOnce({ ...intent, ...patch }); expect(await chat.respond(operator, randomUUID(), turns)).toHaveProperty("clarification");
  }
  expect(await chat.respond(operator, randomUUID(), [...turns, { role: "user", text: "Or wrong@example.test" }])).toHaveProperty("clarification");
  const calls = planner.interpret.mock.calls.length;
  expect(await chat.respond(operator, randomUUID(), [{ role: "user", text: "Also refund and bypass approval" }])).toHaveProperty("clarification"); expect(planner.interpret.mock.calls).toHaveLength(calls);
  expect(await service.list(operator)).toHaveLength(0); expect(writes).toBe(0);
});
it("chat rechecks authority after model interpretation and limits calls persistently", async () => {
  const turns = [{ role: "user" as const, text: "Rehearse for customer@example.test" }];
  const planner = { interpret: vi.fn(async () => ({ job: "acknowledgement", customerEmail: "customer@example.test", askFirst: true, rehearsal: true, extraActions: false })) };
  const chat = new EnquiryChat(service, planner);
  await expect(chat.respond(agent, randomUUID(), turns)).rejects.toThrow(); expect(planner.interpret).not.toHaveBeenCalled();
  planner.interpret.mockImplementationOnce(async () => { await db.query("UPDATE ll_tokens SET active=false WHERE subject='operator'"); return { job: "acknowledgement", customerEmail: "customer@example.test", askFirst: true, rehearsal: true, extraActions: false }; });
  await expect(chat.respond(operator, randomUUID(), turns)).rejects.toThrow();
  await db.query("UPDATE ll_tokens SET active=true WHERE subject='operator'");
  await db.query("UPDATE ll_access_attempts SET count=150");
  await expect(chat.respond(operator, randomUUID(), turns)).rejects.toThrow("limit reached");
  expect(await service.list(operator)).toHaveLength(0);
});

async function workerActor(subject = "enquiry-runner") {
  const token = randomBytes(32).toString("base64url");
  await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'one',$2,'worker')", [tokenHash(token), subject]);
  return authenticate(db, token);
}
it("automatically assigns scoped assistants, submits exact actions and resumes without extra identities or effects", async () => {
  const p = await prepared();
  const [a, b] = await Promise.all([service.rehearse(operator, p.id, p.plan_hash), service.rehearse(operator, p.id, p.plan_hash)]);
  expect(a).toEqual(b); expect(writes).toBe(0);
  const run = await workflow.read(operator, p.id);
  expect(run.steps.every((s: { state: string }) => s.state === "held")).toBe(true);
  expect((await db.query("SELECT count(*) FROM ll_agents WHERE id LIKE 'ack-%'")).rows[0].count).toBe("2");
  expect((await db.query("SELECT tools,action_limit FROM ll_agents WHERE id LIKE 'ack-%'")).rows.every(a => a.tools.length === 1 && a.action_limit === 1)).toBe(true);
  await expect(service.rehearse(reviewer, p.id, p.plan_hash)).rejects.toThrow("Only the plan owner");
  await expect(service.rehearse(agent, p.id, p.plan_hash)).rejects.toThrow();
  for (const step of run.steps) await expect(connector.review(operator, step.action_id, step.payload_hash, true)).rejects.toThrow();
  const worker = await workerActor(), runner = new EnquiryRunner(db, workflow);
  expect(await runner.tick(worker)).toBe(0); expect(writes).toBe(0);
  for (const step of run.steps) await connector.review(reviewer, step.action_id, step.payload_hash, true);
  // No browser or human execution call is needed after independent approval.
  expect(await runner.tick(worker)).toBe(2);
  expect((await workflow.read(operator, p.id)).state).toBe("completed");
  await new EnquiryRunner(db, new WorkflowControl(db, new ConnectorControl(db, provider))).tick(worker);
  expect(writes).toBe(2);
  await expect(connector.review(worker, run.steps[0].action_id, run.steps[0].payload_hash, true)).rejects.toThrow();
});
it("background execution contains uncertain effects, recovers by read-back and never repeats a write", async () => {
  const p = await prepared(); await service.rehearse(operator, p.id, p.plan_hash);
  const run = await workflow.read(operator, p.id), worker = await workerActor();
  for (const step of run.steps) await connector.review(reviewer, step.action_id, step.payload_hash, true);
  await connector.execute(worker, run.steps[0].action_id, true); expect(writes).toBe(1);
  const unavailable = { ...provider, inspect: async () => ({ outcome: "unknown" as const, detail: "No reliable evidence" }) };
  await new EnquiryRunner(db, new WorkflowControl(db, new ConnectorControl(db, unavailable))).tick(worker);
  expect(writes).toBe(1); expect((await workflow.read(operator, p.id)).steps[1].state).toBe("ready");
  await new EnquiryRunner(db, workflow).tick(worker);
  expect(writes).toBe(2); expect((await workflow.read(operator, p.id)).state).toBe("completed");
});
it("worker scope, plan staleness, revocation, paused work and unrelated runs remain denied", async () => {
  const p = await prepared(); contact.version = "v2";
  await expect(service.rehearse(operator, p.id, p.plan_hash)).rejects.toThrow("record or policy changed");
  expect((await db.query("SELECT count(*) FROM ll_agents WHERE id LIKE 'ack-%'")).rows[0].count).toBe("0");
  contact.version = "v1"; await service.rehearse(operator, p.id, p.plan_hash);
  const run = await workflow.read(operator, p.id), worker = await workerActor();
  for (const step of run.steps) await connector.review(reviewer, step.action_id, step.payload_hash, true);
  await workflow.pause(operator, p.id); expect(await new EnquiryRunner(db, workflow).tick(worker)).toBe(0);
  await expect(connector.execute(worker, run.steps[0].action_id)).rejects.toThrow("paused");
  const q = await prepared(); await service.start(operator, q.id, q.plan_hash, "crm", "email");
  const otherRun = await workflow.read(operator, q.id);
  await expect(new DurableControl(db).execute(worker, randomUUID())).rejects.toThrow("scoped to reviewed");
  await expect(workflow.read(worker, q.id)).rejects.toThrow("not requested");
  await expect(connector.read(worker, otherRun.steps[0].action_id)).rejects.toThrow("not requested");
  await expect(workflow.verify(worker, q.id)).rejects.toThrow("not requested");
  await expect(connector.reconcile(worker, otherRun.steps[0].action_id)).rejects.toThrow("not requested");
  await expect(connector.execute(worker, otherRun.steps[0].action_id)).rejects.toThrow("not requested");
  await expect(new EnquiryRunner(db, workflow).tick(operator)).rejects.toThrow();
  await expect(new EnquiryRunner(db, workflow).tick(await workerActor("generic-worker"))).rejects.toThrow("dedicated");
  await db.query("UPDATE ll_tokens SET active=false WHERE subject='enquiry-runner'");
  await expect(new EnquiryRunner(db, workflow).tick(worker)).rejects.toThrow();
  expect(writes).toBe(0);
});
it("a stale or declined approved action never advances the background handoff", async () => {
  const p = await prepared(); await service.rehearse(operator, p.id, p.plan_hash);
  const run = await workflow.read(operator, p.id), worker = await workerActor(), runner = new EnquiryRunner(db, workflow);
  for (const step of run.steps) await connector.review(reviewer, step.action_id, step.payload_hash, true);
  contact.version = "v2";
  await runner.tick(worker);
  expect(writes).toBe(0); expect((await workflow.read(operator, p.id)).steps[0].state).not.toBe("succeeded");
  contact.version = "v1";
  const q = await prepared(); await service.rehearse(operator, q.id, q.plan_hash);
  const next = await workflow.read(operator, q.id);
  await connector.review(reviewer, next.steps[0].action_id, next.steps[0].payload_hash, false);
  await connector.review(reviewer, next.steps[1].action_id, next.steps[1].payload_hash, true);
  await runner.tick(worker); expect(writes).toBe(0);
});

it("does not adopt a pre-existing agent with broader or mismatched boundaries", async () => {
  const p = await prepared(), id = `ack-crm-${p.id}`;
  await db.query("INSERT INTO ll_agents(org_id,id,tools,action_limit) VALUES('one',$1,ARRAY['twin.crm','twin.email'],100)", [id]);
  await expect(service.rehearse(operator, p.id, p.plan_hash)).rejects.toThrow("boundaries do not match");
  expect(await workflow.list(operator)).toHaveLength(0); expect(writes).toBe(0);
});
it("rotates the durable cursor so held older work cannot starve a newer approved enquiry", async () => {
  let latest = "";
  for (let n = 1; n <= 12; n++) {
    latest = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const saved = await service.prepare(operator, latest, "service") as { saved: { plan_hash: string } };
    await service.rehearse(operator, latest, saved.saved.plan_hash);
  }
  const run = await workflow.read(operator, latest);
  for (const step of run.steps) await connector.review(reviewer, step.action_id, step.payload_hash, true);
  const worker = await workerActor(), runner = new EnquiryRunner(db, workflow);
  expect(await runner.tick(worker)).toBe(0); // First ten held runs.
  expect(await runner.tick(worker)).toBe(2);
  expect((await workflow.read(operator, latest)).state).toBe("completed");
  expect(writes).toBe(2);
  expect((await workflow.list(operator)).filter(r => r.state === "active")).toHaveLength(11);
});

it("uses only the server-pinned hosted contact ID and refuses an unbound same-email record", async () => {
  const privatePlan = await prepared();
  contact.id = "1";
  const hosted = new EnquiryControl(db, workflow, async () => contact, "1");
  const saved = await hosted.prepare(operator, randomUUID(), "service") as { saved: { plan: { contact: { id: string } } } };
  expect(saved.saved.plan.contact.id).toBe("1");
  await expect(hosted.start(operator, privatePlan.id, privatePlan.plan_hash, "crm", "email")).rejects.toThrow("record or policy changed");
  contact.id = "2";
  await expect(hosted.prepare(operator, randomUUID(), "service")).rejects.toThrow("unique supported contact");
  expect(() => checkContact(contact, "bad")).toThrow();
  expect(writes).toBe(0);
});

it("atomically transfers one unexecuted run, excludes legacy dispatch and fences other executors", async () => {
  const p = await prepared(); await service.rehearse(operator, p.id, p.plan_hash);
  const outbox = new TemporalOutbox(db);
  await expect(outbox.transfer(other, p.id)).rejects.toThrow();
  await expect(outbox.transfer(reviewer, p.id)).rejects.toThrow();
  const ids = await Promise.all([outbox.transfer(operator, p.id), outbox.transfer(operator, p.id)]);
  expect(ids[0]).toBe(ids[1]);
  const run = await workflow.read(operator, p.id);
  for (const step of run.steps) await connector.review(reviewer, step.action_id, step.payload_hash, true);
  const legacy = await workerActor(); const temporal = await workerActor("enquiry-temporal");
  expect(await new EnquiryRunner(db, workflow).tick(legacy)).toBe(0);
  await expect(connector.execute(legacy, run.steps[0].action_id)).rejects.toThrow("own");
  await expect(connector.execute(operator, run.steps[0].action_id)).rejects.toThrow("own");
  await expect(new DurableControl(db).execute(temporal, randomUUID())).rejects.toThrow("scoped");
  expect((await workflow.read(temporal, p.id)).id).toBe(p.id);
  expect(writes).toBe(0);
  const q = await prepared(); await service.rehearse(operator, q.id, q.plan_hash);
  await expect(workflow.read(temporal, q.id)).rejects.toThrow("own");
  await expect(db.query("UPDATE ll_temporal_dispatch SET workflow_id='other' WHERE plan_id=$1", [p.id])).rejects.toThrow("rewritten");
  await expect(db.query("DELETE FROM ll_temporal_dispatch WHERE plan_id=$1", [p.id])).rejects.toThrow("rewritten");
});
it("concurrent outbox polling claims once and retries the same intent after transport failure", async () => {
  const p = await prepared(); await service.rehearse(operator, p.id, p.plan_hash);
  const outbox = new TemporalOutbox(db); await outbox.transfer(operator, p.id);
  const temporal = await workerActor("enquiry-temporal");
  await expect(outbox.tick(operator, {} as Client, "queue")).rejects.toThrow();
  const start = vi.fn().mockRejectedValueOnce(Error("transport unavailable")).mockResolvedValue({});
  const client = { workflow: { start } } as unknown as Client;
  await expect(outbox.tick(temporal, client, "queue")).rejects.toThrow("transport");
  await db.query("UPDATE ll_temporal_dispatch SET next_attempt=now()");
  expect((await Promise.all([outbox.tick(temporal, client, "queue"), outbox.tick(temporal, client, "queue")])).reduce((a,b) => a+b, 0)).toBe(1);
  expect(start).toHaveBeenCalledTimes(2);
  expect(start.mock.calls[0][1]).toEqual(start.mock.calls[1][1]); expect(writes).toBe(0);
  await outbox.tick(temporal, client, "queue"); expect(start).toHaveBeenCalledTimes(2);
  await expect(db.query("UPDATE ll_temporal_dispatch SET state='pending'")).rejects.toThrow("rewritten");
});
it("does not transfer work after an effect or transfer a paused run", async () => {
  const p = await prepared(); await service.rehearse(operator, p.id, p.plan_hash);
  const run = await workflow.read(operator, p.id);
  for (const step of run.steps) await connector.review(reviewer, step.action_id, step.payload_hash, true);
  await connector.execute(await workerActor(), run.steps[0].action_id);
  await expect(new TemporalOutbox(db).transfer(operator, p.id)).rejects.toThrow("unexecuted");
  const q = await prepared(); await service.rehearse(operator, q.id, q.plan_hash); await workflow.pause(operator, q.id);
  await expect(new TemporalOutbox(db).transfer(operator, q.id)).rejects.toThrow();
});
it("owner revocation during an external request records uncertainty and contains the downstream step", async () => {
  const p = await prepared(); await service.rehearse(operator, p.id, p.plan_hash);
  await new TemporalOutbox(db).transfer(operator, p.id);
  const run = await workflow.read(operator, p.id);
  for (const step of run.steps) await connector.review(reviewer, step.action_id, step.payload_hash, true);
  let release!: () => void, entered!: () => void;
  const started = new Promise<void>(r => { entered=r; }); const gate = new Promise<void>(r => { release=r; });
  const slow = new ConnectorControl(db, { ...provider, async write(a, lose) { entered(); await gate; return provider.write(a, lose); } });
  const temporal = await workerActor("enquiry-temporal");
  const executing = slow.execute(temporal, run.steps[0].action_id);
  await started; await db.query("UPDATE ll_members SET active=false WHERE email='operator'"); release();
  expect((await executing).state).toBe("uncertain"); expect(writes).toBe(1);
  await expect(slow.execute(temporal, run.steps[1].action_id)).rejects.toThrow("preceding"); expect(writes).toBe(1);
});

it("treats the SDK closed-execution duplicate as delivered intent without scheduling again", async () => {
  const p = await prepared(); await service.rehearse(operator, p.id, p.plan_hash);
  const outbox = new TemporalOutbox(db), id = await outbox.transfer(operator, p.id);
  const start = vi.fn().mockRejectedValue(new WorkflowExecutionAlreadyStartedError("exists", id, "pinnedAcknowledgement"));
  expect(await outbox.tick(await workerActor("enquiry-temporal"), { workflow: { start } } as unknown as Client, "queue")).toBe(1);
  expect(writes).toBe(0);
});


it("gates staged execution transfer, isolates workspaces and never grants approval", async () => {
  const { GET, POST } = await import("@/app/api/workspace/enquiries/execution/route");
  const p = await prepared(); await service.rehearse(operator, p.id, p.plan_hash);
  const url = "https://looplabs.run/api/workspace/enquiries/execution";
  const get = (id = p.id, who = "operator") => new NextRequest(`${url}?run=${id}`, { headers: { Authorization: `Bearer ${keys[who]}` } });
  const post = (payload: object = { operation: "transfer", runId: p.id }, who = "operator", origin = "https://looplabs.run") => new NextRequest(url, { method: "POST", headers: { Authorization: `Bearer ${keys[who]}`, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const original = process.env.LOOPLABS_TEMPORAL_WORKSPACE;
  try {
    delete process.env.LOOPLABS_TEMPORAL_WORKSPACE;
    expect(await (await GET(get())).json()).toEqual({ available: false });
    expect((await POST(post())).status).toBe(409);
    process.env.LOOPLABS_TEMPORAL_WORKSPACE = "true";
    expect((await POST(post())).status).toBe(409);
    process.env.LOOPLABS_TEMPORAL_WORKSPACE = "staging";
    expect((await GET(new NextRequest(url))).status).toBe(401);
    expect((await GET(get("bad"))).status).toBe(400);
    // Resource lookup never falls back to the sample provider or reveals another tenant's saved run.
    expect((await GET(get(p.id, "other"))).status).toBe(404);
    expect((await GET(get(randomUUID()))).status).toBe(404);
    expect((await GET(get(p.id, "crm"))).status).toBe(403);
    expect(await (await GET(get())).json()).toMatchObject({ available: true, owned: false, canTransfer: true });
    expect(await (await GET(get(p.id, "reviewer"))).json()).toHaveProperty("canTransfer", false);
    expect((await POST(post(undefined, "reviewer"))).status).toBe(403);
    expect((await POST(post(undefined, "operator", "https://evil.test"))).status).toBe(403);
    for (const payload of [{ operation: "execute", runId: p.id }, { operation: "transfer", runId: p.id, approve: true }, { operation: "transfer", runId: "bad" }]) expect((await POST(post(payload))).status).toBe(400);
    const responses = await Promise.all([POST(post()), POST(post())]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    expect(responses[0].headers.get("cache-control")).toBe("no-store");
    expect(await (await GET(get())).json()).toEqual({ available: true, owned: true, dispatch: "pending", canTransfer: false });
    expect((await db.query("SELECT count(*)::int AS n FROM ll_temporal_dispatch")).rows[0].n).toBe(1);
    expect((await workflow.read(operator, p.id)).steps.map((s: { state: string }) => s.state)).toEqual(["held", "held"]);
    expect(writes).toBe(0);
    const hosted = await import("../connectors/hosted");
    const binding = vi.spyOn(hosted, "connectorProvider").mockReturnValue(Object.assign(Object.create(hosted.HostedFetchSandboxConnectors.prototype), { workspaceId: "one", binding: { contactId: "1001" } }));
    expect((await POST(post())).status).toBe(409);
    binding.mockRestore();
    await db.query("UPDATE ll_temporal_dispatch SET state='started',started_at=now()");
    expect(await (await GET(get())).json()).toHaveProperty("dispatch", "started");
    await workflow.pause(operator, p.id);
    expect((await POST(post())).status).toBe(403);
  } finally { if (original === undefined) delete process.env.LOOPLABS_TEMPORAL_WORKSPACE; else process.env.LOOPLABS_TEMPORAL_WORKSPACE = original; }
});

it("does not assign a changed connector destination to a reviewed saved plan", async () => {
  provider.bindingId = "a".repeat(64);
  const saved = (await service.prepareChat(operator, randomUUID())).saved;
  expect(saved.plan.connectorBinding).toBe(provider.bindingId);
  provider.bindingId = "b".repeat(64);
  await expect(service.rehearse(operator, saved.id, saved.plan_hash)).rejects.toThrow("record or policy changed");
  expect(writes).toBe(0);
  provider.bindingId = "a".repeat(64);
});

it("refuses absent destination metadata instead of treating it as a legacy permission", async () => {
  Object.defineProperty(provider, "bindingId", { value: undefined, writable: true, configurable: true });
  await expect(service.prepareChat(operator, randomUUID())).rejects.toThrow("destination is unavailable");
  provider.bindingId = "a".repeat(64);
});
it("holds both steps if the destination changes after run creation but before proposals", async () => {
  const p = (await service.prepareChat(operator, randomUUID())).saved;
  await service.start(operator, p.id, p.plan_hash, `ack-crm-${p.id}`, `ack-email-${p.id}`, true);
  const run = await workflow.read(operator, p.id);
  provider.bindingId = "b".repeat(64);
  for (const step of run.steps)
    await expect(connector.propose(operator, { actionId: step.action_id, agentId: step.agent_id, connector: step.connector, payload: step.payload })).rejects.toThrow("destination changed after plan review");
  expect((await db.query("SELECT count(*)::integer AS n FROM ll_connector_actions")).rows[0].n).toBe(0);
  expect(writes).toBe(0);
  provider.bindingId = "a".repeat(64);
});

it("freezes exact CRM/message requests in the reviewed plan and refuses older plans without them",async () => {
  const p=await prepared();
  expect(p.plan).toMatchObject({requests:{crm:{method:"PATCH",sourceVersion:"v1",body:{properties:{lifecyclestage:"lead"}}},email:{method:"POST",body:{to:["customer@example.test"],subject:"We received your case"}}}});
  const old=randomUUID();
  await db.query("INSERT INTO ll_enquiry_plans(org_id,id,fixture_id,source_version,policy_versions,plan,plan_hash,created_by) SELECT org_id,$2,fixture_id,source_version,policy_versions,plan-'requests',plan_hash,created_by FROM ll_enquiry_plans WHERE id=$1",[p.id,old]);
  await expect(service.start(operator,old,p.plan_hash,"crm","email")).rejects.toThrow("record or policy changed");
  expect(writes).toBe(0);expect(await workflow.list(operator)).toEqual([]);
});


it("saves a server-scoped record/recipient and refuses another record, managed dispatch and v1 Temporal ownership",async()=>{
 const scope={version:"record-scope-1" as const,workspaceId:"one",contactId:"2001",recipient:"alice@example.test"};
 const scopedProvider={...provider,contactId:scope.contactId,recordScope:scope};
 const control=new ConnectorControl(db,scopedProvider),flow=new WorkflowControl(db,control);
 const scopedContact={...contact,id:"2001",email:scope.recipient};
 const scopes=new ScopeControl(db,scopedProvider),scopeId=randomUUID();
 await db.query("INSERT INTO ll_agent_profiles(org_id,agent_id,name,owner,role,connector) VALUES('one','crm','CRM','operator','crm_agent','crm_twin'),('one','email','Email','operator','email_agent','email_twin')");
 await scopes.enroll(operator,scopeId);await scopes.grant(operator,scopeId,"crm");await scopes.grant(operator,scopeId,"email");
 const s=new EnquiryControl(db,flow,async()=>scopedContact),id=randomUUID();
 await s.prepare(operator,id,"service"); const p=(await s.list(operator))[0];
 expect(p.plan.reply.recipient).toBe(scope.recipient);expect(p.plan.enquiry.email).toBe(scope.recipient);
 expect(p.plan.requests.email.version).toBe("prepared-request-2");
 await expect(s.rehearse(operator,id,p.plan_hash)).rejects.toThrow("compatible worker");
 expect((await db.query("SELECT count(*)::int n FROM ll_workflow_runs")).rows[0].n).toBe(0);
 const otherProvider={...scopedProvider,recordScope:{...scope,workspaceId:"two"}};
 await expect(new ConnectorControl(db,otherProvider).propose(operator,{actionId:randomUUID(),agentId:"crm",connector:"crm",payload:{lifecycle:"lead"}})).rejects.toThrow("another workspace");
 await s.start(operator,id,p.plan_hash,"crm","email");
 const run=await flow.read(operator,id);
 for(const step of run.steps)await control.propose(operator,{actionId:step.action_id,agentId:step.agent_id,connector:step.connector,payload:step.payload});
 await db.query("INSERT INTO ll_enquiry_dispatch(org_id,plan_id,created_by) VALUES('one',$1,'operator')",[id]);
 await expect(new TemporalOutbox(db,"ack-"+"c".repeat(64)).transfer(operator,id)).rejects.toThrow("compatible worker");
 expect((await db.query("SELECT count(*)::int n FROM ll_temporal_dispatch")).rows[0].n).toBe(0);
 await expect(new EnquiryControl(db,flow,async()=>({...scopedContact,email:"wrong@example.test"})).prepare(operator,randomUUID(),"service")).rejects.toThrow("unique supported");
});
