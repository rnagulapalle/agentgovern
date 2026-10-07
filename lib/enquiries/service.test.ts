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
import { EnquiryRunner } from "./runner";
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
  async request() { return { id: contact.id, properties: { email: contact.email, lifecyclestage: contact.lifecycle }, updatedAt: contact.version }; }
  async contact() { return this.request(); }
  async source(connector: string) { return connector === "crm" ? contact.version : null; }
} }));
const provider: ConnectorProvider = {
  workspaceId: "one",
  source: async () => contact.version,
  write: async (_action: ConnectorAction, lose: boolean) => { if (_action.connector === "crm" && (_action.payload as { sourceVersion: string }).sourceVersion !== contact.version) return { outcome: "conflict", detail: "Atomic source-version check refused a stale write" }; writes++; if (lose) throw new Error("Lost after effect"); return { outcome: "verified", detail: "Fixture effect confirmed" }; },
  inspect: async () => ({ outcome: "verified", detail: "Fixture read-back confirmed" }),
};
beforeAll(async () => {
  if (!process.env.LOOPLABS_TEST_DATABASE_URL) throw new Error("Dedicated PostgreSQL is required for enquiry tests.");
  admin = new Pool({ connectionString: process.env.LOOPLABS_TEST_DATABASE_URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  db = new Pool({ connectionString: process.env.LOOPLABS_TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  for (const file of ["lib/durable/schema.sql", "lib/workspace/schema.sql", "lib/connectors/schema.sql", "lib/workflows/schema.sql", "lib/enquiries/schema.sql", "lib/enquiries/managed-schema.sql"])
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
