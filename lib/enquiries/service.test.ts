import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import { beforeAll, afterAll, beforeEach, it, expect, vi } from "vitest";
import { authenticate, tokenHash } from "../durable/service";
import type { Actor } from "../durable/contracts";
import type { ConnectorAction, ConnectorProvider } from "../connectors/contracts";
import { ConnectorControl } from "../connectors/service";
import { WorkflowControl } from "../workflows/service";
import { EnquiryControl } from "./service";
import { checkContact, enquiryFixture, validId, type Contact } from "./contracts";
const schema = `enquiry_${randomBytes(8).toString("hex")}`;
let db: Pool, admin: Pool, service: EnquiryControl, connector: ConnectorControl, workflow: WorkflowControl;
let operator: Actor, reviewer: Actor, agent: Actor, other: Actor;
let contact: Contact;
let writes = 0;
const keys: Record<string, string> = {};
vi.mock("../durable/database", async (original) => ({ ...(await original<typeof import("../durable/database")>()), database: () => db }));
vi.mock("../connectors/twin", () => ({ FetchSandboxConnectors: class {
  workspaceId = "one";
  async request() { return { id: contact.id, properties: { email: contact.email, lifecyclestage: contact.lifecycle }, updatedAt: contact.version }; }
} }));
const provider: ConnectorProvider = {
  workspaceId: "one",
  source: async () => contact.version,
  write: async (_action: ConnectorAction, lose: boolean) => { writes++; if (lose) throw new Error("Lost after effect"); return { outcome: "verified", detail: "Fixture effect confirmed" }; },
  inspect: async () => ({ outcome: "verified", detail: "Fixture read-back confirmed" }),
};
beforeAll(async () => {
  if (!process.env.LOOPLABS_TEST_DATABASE_URL) throw new Error("Dedicated PostgreSQL is required for enquiry tests.");
  admin = new Pool({ connectionString: process.env.LOOPLABS_TEST_DATABASE_URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  db = new Pool({ connectionString: process.env.LOOPLABS_TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  for (const file of ["lib/durable/schema.sql", "lib/workspace/schema.sql", "lib/connectors/schema.sql", "lib/workflows/schema.sql", "lib/enquiries/schema.sql"])
    await db.query(await readFile(file, "utf8"));
});
beforeEach(async () => {
  await db.query("TRUNCATE ll_orgs CASCADE");
  await db.query("INSERT INTO ll_orgs(id) VALUES('one'),('two')");
  await db.query("INSERT INTO ll_agents(org_id,id,tools,action_limit) VALUES('one','crm',ARRAY['twin.crm'],100),('one','email',ARRAY['twin.email'],100)");
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
  expect((await POST(req({ operation: "prepare", id, fixtureId: "service" }, "crm"))).status).toBe(403);
  expect((await POST(req({ operation: "prepare", id, fixtureId: "service" }, "operator", "https://evil.test"))).status).toBe(403);
  for (const p of [{ operation: "prepare", id, fixtureId: "service", message: "secret" }, { operation: "unknown" }, { operation: "prepare", id, fixtureId: "invalid" }, { operation: "start", id, planHash: "bad", crmAgent: "crm", emailAgent: "email" }]) expect((await POST(req(p))).status).toBe(400);
  const response = await POST(req({ operation: "prepare", id, fixtureId: "service" })); expect(response.status).toBe(200);
  const { saved } = await response.json();
  expect((await POST(req({ operation: "start", id, planHash: saved.plan_hash, crmAgent: "crm", emailAgent: "email" }))).status).toBe(200);
  const list = await GET(new NextRequest(get.url, { headers: { Authorization: `Bearer ${keys.operator}` } }));
  expect(list.status).toBe(200); expect(list.headers.get("cache-control")).toBe("no-store");
});
