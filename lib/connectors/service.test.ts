import { readFile } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { authenticate, tokenHash } from "../durable/service";
import type { Actor } from "../durable/contracts";
import { ConnectorControl } from "./service";
import {
  parseConnectorProposal,
  type ConnectorAction,
  type ConnectorProvider,
  type Observation,
} from "./contracts";
const schema = `connectors_${randomBytes(8).toString("hex")}`;
let admin: Pool,
  db: Pool,
  control: ConnectorControl,
  operator: Actor,
  second: Actor,
  agent: Actor,
  worker: Actor,
  other: Actor;
class Provider implements ConnectorProvider {
  readonly workspaceId = "one";
  calls = 0;
  failWrite = false;
  failRead = false;
  outcome: Observation = {
    outcome: "verified",
    reference: "fixture",
    detail: "Verified sample effect",
  };
  gate: Promise<void> | null = null;
  async write(_a: ConnectorAction, lose: boolean) {
    this.calls++;
    if (this.gate) await this.gate;
    if (this.failWrite || lose) throw new Error("response lost");
    return this.outcome;
  }
  async inspect() {
    if (this.failRead) throw new Error("unavailable");
    return this.outcome;
  }
  async source() {
    return "v1";
  }
}
let provider: Provider;
const p = (connector: "crm" | "email" = "crm") => ({
  actionId: randomUUID(),
  agentId: "test-agent",
  connector,
  payload:
    connector === "crm"
      ? { lifecycle: "customer" }
      : { template: "case_received" },
});
beforeAll(async () => {
  if (!process.env.LOOPLABS_TEST_DATABASE_URL)
    throw new Error("Dedicated PostgreSQL test database is required.");
  admin = new Pool({
    connectionString: process.env.LOOPLABS_TEST_DATABASE_URL,
  });
  await admin.query(`CREATE SCHEMA ${schema}`);
  db = new Pool({
    connectionString: process.env.LOOPLABS_TEST_DATABASE_URL,
    options: `-c search_path=${schema}`,
    max: 12,
  });
  for (const file of [
    "lib/durable/schema.sql",
    "lib/workspace/schema.sql",
    "lib/connectors/schema.sql",
  ])
    await db.query(await readFile(file, "utf8"));
}, 20000);
beforeEach(async () => {
  await db.query("TRUNCATE ll_orgs CASCADE");
  await db.query("INSERT INTO ll_orgs(id) VALUES('one'),('two')");
  await db.query(
    "INSERT INTO ll_agents(org_id,id,tools,action_limit) VALUES('one','test-agent',ARRAY['twin.crm','twin.email'],10),('one','other-agent',ARRAY['twin.crm'],10),('two','test-agent',ARRAY['twin.crm'],10)",
  );
  await db.query(
    "INSERT INTO ll_connector_policies(org_id,connector) VALUES('one','crm'),('one','email'),('two','crm')",
  );
  const actors: Actor[] = [];
  for (const [role, org, subject] of [
    ["operator", "one", "operator"],
    ["operator", "one", "second"],
    ["agent", "one", "test-agent"],
    ["worker", "one", "worker"],
    ["operator", "two", "other"],
    ["agent", "one", "other-agent"],
  ]) {
    const token = randomBytes(32).toString("base64url");
    await db.query(
      "INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,$2,$3,$4)",
      [tokenHash(token), org, subject, role],
    );
    actors.push(await authenticate(db, token));
  }
  [operator, second, agent, worker, other] = actors;
  provider = new Provider();
  control = new ConnectorControl(db, provider);
});
afterAll(async () => {
  await db?.end();
  if (admin) {
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
async function ready() {
  const a = await control.propose(agent, p());
  return control.review(operator, a.id, a.payload_hash, true);
}
describe("Saved connector boundary", () => {
  it("accepts only bounded sample payloads and UUID identities", () => {
    expect(parseConnectorProposal(p("email")).connector).toBe("email");
    for (const v of [
      null,
      [],
      {},
      { ...p(), actionId: "bad" },
      { ...p(), agentId: "bad id" },
      { ...p(), connector: "stripe" },
      { ...p(), extra: true },
      { ...p(), payload: [] },
      { ...p(), payload: { lifecycle: "admin" } },
      { ...p(), payload: { lifecycle: "lead", email: "steal@test" } },
      { ...p("email"), payload: { template: "custom" } },
    ])
      expect(() => parseConnectorProposal(v)).toThrow();
  });
  it("requires matching active agent, tool capability and assigned workspace", async () => {
    await expect(
      control.propose(agent, { ...p(), agentId: "other-agent" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(control.propose(other, p())).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      control.propose(agent, { ...p(), agentId: "missing" }),
    ).rejects.toMatchObject({ status: 403 });
    await db.query(
      "UPDATE ll_agents SET tools=ARRAY[]::text[] WHERE id='test-agent'",
    );
    await expect(control.propose(agent, p())).rejects.toMatchObject({
      status: 403,
    });
  });
  it("requires active policy and workload credential", async () => {
    await db.query("UPDATE ll_connector_policies SET active=false");
    await expect(control.propose(agent, p())).rejects.toMatchObject({
      status: 403,
    });
    await db.query("UPDATE ll_connector_policies SET active=true");
    await db.query("UPDATE ll_tokens SET active=false WHERE role='agent'");
    await expect(control.propose(operator, p())).rejects.toMatchObject({
      status: 403,
    });
  });
  it("serializes duplicate admission and binds exact payload", async () => {
    const v = p();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => control.propose(agent, v)),
    );
    expect(new Set(results.map((a) => a.id)).size).toBe(1);
    expect(
      (
        await db.query(
          "SELECT reserved FROM ll_agents WHERE org_id='one' AND id='test-agent'",
        )
      ).rows[0].reserved,
    ).toBe(1);
    await expect(
      control.propose(agent, { ...v, payload: { lifecycle: "lead" } }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("fails closed for exhausted lifetime capacity and missing policy", async () => {
    await db.query("UPDATE ll_agents SET reserved=action_limit");
    await expect(control.propose(agent, p())).rejects.toMatchObject({
      status: 403,
    });
    await db.query("UPDATE ll_agents SET reserved=0");
    await db.query("DELETE FROM ll_connector_policies WHERE connector='email'");
    await expect(control.propose(agent, p("email"))).rejects.toMatchObject({
      status: 403,
    });
  });
  it("requires exact approval from a different human for operator proposals", async () => {
    const a = await control.propose(operator, p());
    await expect(
      control.review(operator, a.id, a.payload_hash, true),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      control.review(second, a.id, "wrong", true),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await control.review(second, a.id, a.payload_hash, true)).state,
    ).toBe("ready");
    expect(
      (await control.review(second, a.id, a.payload_hash, true)).state,
    ).toBe("ready");
    await expect(
      control.review(agent, a.id, a.payload_hash, true),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rejects without external effect and invalidates changed authority", async () => {
    const a = await control.propose(agent, p());
    expect(
      (await control.review(operator, a.id, a.payload_hash, false)).state,
    ).toBe("rejected");
    const b = await control.propose(agent, p());
    await db.query("UPDATE ll_connector_policies SET version=version+1");
    expect(
      (await control.review(operator, b.id, b.payload_hash, true)).state,
    ).toBe("cancelled");
    expect(provider.calls).toBe(0);
  });
  it("denies agents execution, containment and broad snapshots", async () => {
    const a = await ready();
    await expect(control.execute(agent, a.id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(control.snapshot(agent)).rejects.toMatchObject({
      status: 403,
    });
    await expect(control.contain(agent, "crm")).rejects.toMatchObject({
      status: 403,
    });
  });
  it("keeps snapshots and reads private, scoped and free of lease secrets", async () => {
    const a = await ready();
    expect((await control.read(agent, a.id)).lease_token).toBeNull();
    const stranger = await authenticate(db, await createOtherToken());
    await expect(control.read(stranger, a.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(control.read(operator, randomUUID())).rejects.toMatchObject({
      status: 404,
    });
    expect((await control.snapshot(operator)).actions).toHaveLength(1);
    await expect(control.snapshot(other)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("executes once, checks approval again, and masks lease ownership", async () => {
    const a = await ready();
    expect((await control.execute(worker, a.id)).state).toBe("succeeded");
    await control.execute(worker, a.id);
    expect(provider.calls).toBe(1);
    const b = await ready();
    await db.query(
      "UPDATE ll_connector_actions SET approval_until=now()-interval '1 second' WHERE id=$1",
      [b.id],
    );
    expect((await control.execute(worker, b.id)).state).toBe("cancelled");
    const c = await ready();
    await db.query(
      "UPDATE ll_tokens SET active=false WHERE subject='operator'",
    );
    expect((await control.execute(worker, c.id)).state).toBe("cancelled");
  });
  it("does not hold workspace locks across provider calls and fences competing workers", async () => {
    const a = await ready();
    let release!: () => void;
    provider.gate = new Promise<void>((r) => (release = r));
    const pending = control.execute(worker, a.id);
    for (let i = 0; i < 100 && provider.calls === 0; i++)
      await new Promise((r) => setTimeout(r, 5));
    expect(provider.calls).toBe(1);
    const competing = await control.execute(worker, a.id);
    expect(competing.state).toBe("executing");
    await control.contain(operator, "crm"); // Would deadlock/time out with a network-held workspace lock.
    release();
    expect((await pending).state).toBe("uncertain");
    expect(provider.calls).toBe(1);
  });
  it("contains before dispatch and does not resurrect old approvals on enable", async () => {
    const a = await ready();
    await control.contain(operator, "crm");
    expect((await control.execute(worker, a.id)).state).toBe("cancelled");
    expect(provider.calls).toBe(0);
    await control.enable(operator, "crm");
    expect((await control.read(operator, a.id)).state).toBe("cancelled");
    expect((await control.propose(agent, p())).state).toBe("held");
    await expect(control.contain(operator, "bad")).rejects.toMatchObject({
      status: 400,
    });
    await expect(control.enable(operator, "bad")).rejects.toMatchObject({
      status: 400,
    });
    await expect(control.enable(agent, "email")).rejects.toMatchObject({
      status: 403,
    });
  });
  it("handles timeout after an effect without automatic retry", async () => {
    const a = await ready();
    expect((await control.execute(worker, a.id, true)).state).toBe("uncertain");
    expect((await control.reconcile(operator, a.id)).state).toBe("succeeded");
    await control.execute(worker, a.id);
    expect(provider.calls).toBe(1);
  });
  it("keeps failed lookup and unknown effect contained and detects conflicts", async () => {
    const a = await ready();
    provider.failWrite = true;
    await control.execute(worker, a.id);
    provider.failRead = true;
    expect((await control.reconcile(operator, a.id)).state).toBe("uncertain");
    provider.failRead = false;
    provider.outcome = { outcome: "unknown", detail: "Absence not proven" };
    expect((await control.reconcile(operator, a.id)).state).toBe("uncertain");
    provider.outcome = { outcome: "conflict", detail: "Concurrent write" };
    expect((await control.reconcile(operator, a.id)).state).toBe("conflict");
    expect(provider.calls).toBe(1);
  });
  it("expires orphaned leases and refuses active-lease reconciliation", async () => {
    const a = await ready();
    await db.query(
      "UPDATE ll_connector_actions SET state='executing',lease_token=$2,lease_until=now()+interval '30 seconds' WHERE id=$1",
      [a.id, randomUUID()],
    );
    await expect(control.reconcile(operator, a.id)).rejects.toMatchObject({
      status: 409,
    });
    await db.query(
      "UPDATE ll_connector_actions SET lease_until=now()-interval '1 second' WHERE id=$1",
      [a.id],
    );
    expect((await control.execute(worker, a.id)).state).toBe("uncertain");
    expect(provider.calls).toBe(0);
    expect((await control.reconcile(operator, a.id)).state).toBe("succeeded");
  });
  it("retains uncertainty if approval or lease expires after dispatch", async () => {
    const a = await ready();
    let release!: () => void;
    provider.gate = new Promise<void>((r) => (release = r));
    const pending = control.execute(worker, a.id);
    for (let i = 0; i < 100 && !provider.calls; i++)
      await new Promise((r) => setTimeout(r, 5));
    await db.query(
      "UPDATE ll_connector_actions SET lease_until=now()-interval '1 second' WHERE id=$1",
      [a.id],
    );
    release();
    expect((await pending).state).toBe("uncertain");
  });
  it("does not reconcile held or final cancelled actions", async () => {
    const a = await control.propose(agent, p());
    expect((await control.reconcile(operator, a.id)).state).toBe("held");
    await control.contain(operator, "crm");
    expect((await control.reconcile(operator, a.id)).state).toBe("cancelled");
  });
  it("retains durable history and prevents event edits", async () => {
    const a = await ready();
    await control.execute(worker, a.id);
    expect(
      (await new ConnectorControl(db, provider).snapshot(operator)).events
        .length,
    ).toBeGreaterThan(2);
    await expect(db.query("DELETE FROM ll_connector_events")).rejects.toThrow(
      "Control events cannot be updated or deleted",
    );
  });
});
async function createOtherToken() {
  const token = randomBytes(32).toString("base64url");
  await db.query(
    "INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'one','other-agent','agent')",
    [tokenHash(token)],
  );
  return token;
}
