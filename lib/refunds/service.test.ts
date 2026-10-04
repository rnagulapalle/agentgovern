import { readFile } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { RefundControl } from "./service";
import { authenticate, tokenHash } from "../durable/service";
import {
  PAYMENT,
  parseRefund,
  money,
  type RefundAction,
  type ProviderRefund,
  type RefundProvider,
} from "./contracts";
import type { Actor } from "../durable/contracts";
const schema = `refund_${randomBytes(8).toString("hex")}`;
let admin: Pool,
  db: Pool,
  control: RefundControl,
  operator: Actor,
  agent: Actor,
  worker: Actor,
  other: Actor;
class Provider implements RefundProvider {
  readonly workspaceId = "one";
  list: ProviderRefund[] = [];
  failRead = false;
  failCreate = false;
  mismatch = false;
  pending = false;
  calls = 0;
  writeGate: Promise<void> | null = null;
  readGate: Promise<void> | null = null;
  async payment() {
    if (this.failRead) throw new Error("Unavailable");
    return {
      id: PAYMENT,
      amount: 100000,
      currency: "usd",
      paid: true,
      amount_refunded: this.list
        .filter((r) => r.status === "succeeded")
        .reduce((n, r) => n + r.amount, 0),
    };
  }
  async refunds() {
    if (this.readGate) await this.readGate;
    if (this.failRead) throw new Error("Unavailable");
    return this.list;
  }
  async create(a: RefundAction, lose: boolean) {
    this.calls++;
    if (this.writeGate) await this.writeGate;
    if (this.failCreate) throw new Error("Unknown result");
    const r = {
      id: `re_${a.id}`,
      amount: this.mismatch ? a.amount + 1 : a.amount,
      currency: a.currency,
      charge: a.payment_id,
      status: this.pending ? "pending" : "succeeded",
      metadata: { looplabs_action: a.id },
    };
    this.list.push(r);
    if (lose) throw new Error("Response lost after write");
    return r;
  }
}
let provider: Provider;
const proposal = (amount = 500) => ({
  actionId: randomUUID(),
  agentId: "refund-agent",
  paymentId: PAYMENT,
  amount,
  currency: "usd",
});
beforeAll(async () => {
  if (!process.env.LOOPLABS_TEST_DATABASE_URL)
    throw new Error(
      "Refund tests require the dedicated PostgreSQL test database.",
    );
  admin = new Pool({
    connectionString: process.env.LOOPLABS_TEST_DATABASE_URL,
  });
  await admin.query(`CREATE SCHEMA ${schema}`);
  db = new Pool({
    connectionString: process.env.LOOPLABS_TEST_DATABASE_URL,
    options: `-c search_path=${schema}`,
    max: 12,
  });
  await db.query(await readFile("lib/durable/schema.sql", "utf8"));
  await db.query(await readFile("lib/workspace/schema.sql", "utf8"));
  await db.query(await readFile("lib/refunds/schema.sql", "utf8"));
}, 20000);
beforeEach(async () => {
  await db.query("TRUNCATE ll_orgs CASCADE");
  await db.query("INSERT INTO ll_orgs(id) VALUES('one'),('two')");
  await db.query(
    "INSERT INTO ll_agents(org_id,id,tools) VALUES('one','refund-agent',ARRAY['stripe.refund']),('two','refund-agent',ARRAY['stripe.refund'])",
  );
  await db.query(
    "INSERT INTO ll_refund_policies(org_id) VALUES('one'),('two')",
  );
  const actors: Actor[] = [];
  for (const [role, org, subject] of [
    ["operator", "one", "operator"],
    ["agent", "one", "refund-agent"],
    ["worker", "one", "worker"],
    ["operator", "two", "other"],
  ]) {
    const token = randomBytes(32).toString("base64url");
    await db.query(
      "INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,$2,$3,$4)",
      [tokenHash(token), org, subject, role],
    );
    actors.push(await authenticate(db, token));
  }
  [operator, agent, worker, other] = actors;
  provider = new Provider();
  control = new RefundControl(db, provider);
});
afterAll(async () => {
  await db?.end();
  if (admin) {
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
describe("Refund action and external effect boundary", () => {
  it("validates bounded, supported refund inputs", () => {
    for (const p of [
      null,
      [],
      {},
      { ...proposal(), extra: true },
      { ...proposal(), amount: 0 },
      { ...proposal(), amount: 1.1 },
      { ...proposal(), amount: 100001 },
      { ...proposal(), currency: "inr" },
      { ...proposal(), paymentId: "ch_other" },
      { ...proposal(), agentId: "other" },
      { ...proposal(), actionId: "bad" },
    ])
      expect(() => parseRefund(p)).toThrow();
    expect(parseRefund(proposal())).toMatchObject({ amount: 500 });
    expect(money(500)).toBe("$5.00");
  });
  it("allows, holds, blocks; replays reserve exactly once and changed payload conflicts", async () => {
    const p = proposal();
    const a = await control.propose(agent, p);
    expect(a.state).toBe("ready");
    expect((await control.propose(agent, p)).id).toBe(a.id);
    await expect(
      control.propose(agent, { ...p, amount: 600 }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await control.propose(agent, proposal(2500))).state).toBe("held");
    expect((await control.propose(agent, proposal(15000))).state).toBe(
      "blocked",
    );
    expect((await control.snapshot(operator)).policy.reserved).toBe(3000);
    expect(provider.calls).toBe(0);
  });
  it("denies contained identity, missing tools, exhausted budget, stale credentials and spoofed agent", async () => {
    await control.configure(operator, { agentActive: false });
    expect((await control.propose(agent, proposal())).state).toBe("blocked");
    await control.configure(operator, { agentActive: true });
    await db.query("UPDATE ll_agents SET tools='{}'");
    expect((await control.propose(agent, proposal())).state).toBe("blocked");
    await db.query("UPDATE ll_agents SET tools=ARRAY['stripe.refund']");
    await db.query("UPDATE ll_refund_policies SET reserved=budget");
    expect((await control.propose(agent, proposal())).state).toBe("blocked");
    await expect(
      control.propose({ ...agent, subject: "wrong" }, proposal()),
    ).rejects.toMatchObject({ status: 403 });
    await db.query("UPDATE ll_tokens SET active=false WHERE hash=$1", [
      agent.tokenHash,
    ]);
    await expect(control.propose(agent, proposal())).rejects.toMatchObject({
      status: 403,
    });
  });
  it("defaults deny on unavailable payment evidence and reserved refundable balance", async () => {
    provider.failRead = true;
    expect((await control.propose(agent, proposal())).state).toBe("blocked");
    expect((await control.snapshot(operator)).provider.available).toBe(false);
    provider.failRead = false;
    await db.query("UPDATE ll_refund_policies SET budget=200000");
    await control.propose(agent, proposal(10000));
    provider.list = [
      {
        id: "re_prior",
        amount: 95000,
        currency: "usd",
        charge: PAYMENT,
        status: "succeeded",
        metadata: { looplabs_action: "prior" },
      },
    ];
    expect((await control.propose(agent, proposal(500))).state).toBe("blocked");
  });
  it("isolates tenant reads and operator-only review, execute, configure and snapshots", async () => {
    const a = await control.propose(agent, proposal(2500));
    expect((await control.read(agent, a.id)).id).toBe(a.id);
    for (const call of [
      () => control.snapshot(agent),
      () => control.execute(agent, a.id),
      () => control.review(agent, a.id, a.payload_hash, true),
      () => control.configure(agent, { agentActive: false }),
      () => control.reconcile(agent, a.id),
    ])
      await expect(call()).rejects.toMatchObject({ status: 403 });
    await expect(control.read(other, a.id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(control.read(operator, "bad")).rejects.toMatchObject({
      status: 400,
    });
    await db.query(
      "INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'one','another-agent','agent')",
      [tokenHash("a".repeat(40))],
    );
    const another = await authenticate(db, "a".repeat(40));
    await expect(control.read(another, a.id)).rejects.toMatchObject({
      status: 404,
    });
  });
  it("binds exact approval, rejects safely, and ignores replayed reviews", async () => {
    const a = await control.propose(agent, proposal(2500));
    await expect(
      control.review(operator, a.id, "wrong", true),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await control.review(operator, a.id, a.payload_hash, false)).state,
    ).toBe("rejected");
    expect(
      (await control.review(operator, a.id, a.payload_hash, true)).state,
    ).toBe("rejected");
    expect((await control.snapshot(operator)).policy.reserved).toBe(0);
    expect((await control.execute(worker, a.id)).state).toBe("rejected");
  });
  it("invalidates held approvals when identity or policy changes", async () => {
    const a = await control.propose(agent, proposal(2500));
    await db.query("UPDATE ll_refund_policies SET version=version+1");
    expect(
      (await control.review(operator, a.id, a.payload_hash, true)).state,
    ).toBe("cancelled");
    const b = await control.propose(agent, proposal(2500));
    await db.query("UPDATE ll_agents SET active=false");
    expect(
      (await control.review(operator, b.id, b.payload_hash, true)).state,
    ).toBe("cancelled");
  });
  it("rechecks approval expiry and approver authority before execution", async () => {
    const a = await control.propose(agent, proposal(2500));
    await control.review(operator, a.id, a.payload_hash, true);
    await db.query(
      "UPDATE ll_refund_actions SET approval_until=now()-interval '1 minute'",
    );
    expect((await control.execute(worker, a.id)).state).toBe("cancelled");
    const b = await control.propose(agent, proposal(2500));
    await control.review(operator, b.id, b.payload_hash, true);
    await db.query("UPDATE ll_tokens SET active=false WHERE hash=$1", [
      operator.tokenHash,
    ]);
    expect((await control.execute(worker, b.id)).state).toBe("cancelled");
    expect(provider.calls).toBe(0);
  });
  it("executes approved refunds and never writes again on replay", async () => {
    const a = await control.propose(agent, proposal(2500));
    await control.review(operator, a.id, a.payload_hash, true);
    expect((await control.execute(worker, a.id)).state).toBe("succeeded");
    await control.execute(worker, a.id);
    await control.reconcile(operator, a.id);
    expect(provider.calls).toBe(1);
    const s = await control.snapshot(operator);
    expect(s.provider.refunds).toHaveLength(1);
    expect(s.events.some((e) => e.kind === "succeeded")).toBe(true);
    expect(s.actions[0].lease_token).toBeNull();
    await expect(
      db.query("UPDATE ll_refund_events SET kind='changed'"),
    ).rejects.toThrow("cannot be updated");
  });
  it("reconciles response loss using actual provider evidence without a second write", async () => {
    const a = await control.propose(agent, proposal());
    expect((await control.execute(worker, a.id, true)).state).toBe("uncertain");
    expect(provider.list).toHaveLength(1);
    expect((await control.reconcile(operator, a.id)).state).toBe("succeeded");
    expect(provider.calls).toBe(1);
  });
  it("retains uncertainty when provider is unavailable or absence is unproven", async () => {
    const a = await control.propose(agent, proposal());
    provider.failCreate = true;
    await control.execute(worker, a.id);
    provider.failRead = true;
    expect((await control.reconcile(operator, a.id)).state).toBe("uncertain");
    provider.failRead = false;
    expect((await control.reconcile(operator, a.id)).state).toBe("uncertain");
    await control.execute(worker, a.id);
    expect(provider.calls).toBe(1);
  });
  it("retains uncertainty for pending, failed and canceled provider refunds", async () => {
    provider.pending = true;
    const a = await control.propose(agent, proposal());
    expect((await control.execute(worker, a.id)).state).toBe("uncertain");
    for (const status of ["pending", "failed", "canceled"]) {
      provider.list[0].status = status;
      expect((await control.reconcile(operator, a.id)).state).toBe("uncertain");
    }
  });
  it("detects changed payload evidence and duplicate provider records", async () => {
    provider.mismatch = true;
    const a = await control.propose(agent, proposal());
    expect((await control.execute(worker, a.id)).state).toBe("conflict");
    provider.mismatch = false;
    const b = await control.propose(agent, proposal());
    await control.execute(worker, b.id, true);
    provider.list.push({ ...provider.list[1], id: "re_duplicate" });
    expect((await control.reconcile(operator, b.id)).state).toBe("conflict");
  });
  it("reverifies a completed refund and flags later duplicate provider evidence", async () => {
    const a = await control.propose(agent, proposal());
    await control.execute(worker, a.id);
    provider.list.push({ ...provider.list[0], id: "re_later_duplicate" });
    expect((await control.reconcile(operator, a.id)).state).toBe("conflict");
    expect(provider.calls).toBe(1);
  });
  it("stops execution on changed balance and changed policy", async () => {
    const a = await control.propose(agent, proposal());
    provider.list = [
      {
        id: "re_external",
        amount: 100000,
        currency: "usd",
        charge: PAYMENT,
        status: "succeeded",
        metadata: { looplabs_action: "external" },
      },
    ];
    expect((await control.execute(worker, a.id)).state).toBe("conflict");
    expect(provider.calls).toBe(0);
    provider.list = [];
    const b = await control.propose(agent, proposal());
    await db.query("UPDATE ll_refund_policies SET version=version+1");
    expect((await control.execute(worker, b.id)).state).toBe("cancelled");
  });
  it("fences duplicate workers, respects active leases, and reconciles expired leases", async () => {
    const a = await control.propose(agent, proposal());
    const results = await Promise.all([
      control.execute(worker, a.id),
      control.execute(worker, a.id),
    ]);
    expect(results.some((r) => r.state === "succeeded")).toBe(true);
    expect(provider.calls).toBe(1);
    const b = await control.propose(agent, proposal());
    await db.query(
      "UPDATE ll_refund_actions SET state='executing',lease_token=$2,lease_until=now()+interval '30 seconds' WHERE id=$1",
      [b.id, randomUUID()],
    );
    expect((await control.execute(worker, b.id)).state).toBe("executing");
    await expect(control.reconcile(operator, b.id)).rejects.toMatchObject({
      status: 409,
    });
    await db.query(
      "UPDATE ll_refund_actions SET lease_until=now()-interval '1 second' WHERE id=$1",
      [b.id],
    );
    expect((await control.execute(worker, b.id)).state).toBe("uncertain");
    expect((await control.reconcile(operator, b.id)).state).toBe("uncertain");
  });
  it("configuration contains pending work, invalidates approvals and denies malformed controls", async () => {
    const a = await control.propose(agent, proposal());
    const b = await control.propose(agent, proposal(2500));
    await control.configure(operator, { autoLimit: 0 });
    expect((await control.read(operator, a.id)).state).toBe("cancelled");
    expect((await control.read(operator, b.id)).state).toBe("cancelled");
    const c = await control.propose(agent, proposal());
    await control.review(operator, c.id, c.payload_hash, true);
    await db.query(
      "UPDATE ll_refund_actions SET state='executing' WHERE id=$1",
      [c.id],
    );
    await control.configure(operator, { agentActive: false });
    expect((await control.read(operator, c.id)).state).toBe("uncertain");
    await control.configure(operator, { agentActive: true });
    for (const value of [
      {},
      { extra: 1 },
      { agentActive: "yes" },
      { autoLimit: -1 },
      { autoLimit: 10001 },
      { autoLimit: 1.2 },
      { agentActive: true, autoLimit: 0 },
    ])
      await expect(control.configure(operator, value)).rejects.toMatchObject({
        status: 400,
      });
  });
  it("fails closed for an unprovisioned workspace", async () => {
    await db.query("DELETE FROM ll_refund_policies");
    await expect(control.snapshot(operator)).rejects.toMatchObject({
      status: 503,
    });
    await expect(control.propose(agent, proposal())).rejects.toMatchObject({
      status: 503,
    });
  });
});

it("lets containment proceed during an in-flight provider call and retains uncertainty", async () => {
  const a = await control.propose(agent, proposal());
  let release!: () => void;
  provider.writeGate = new Promise<void>((r) => (release = r));
  const pending = control.execute(worker, a.id);
  for (let i = 0; i < 100 && !provider.calls; i++)
    await new Promise((r) => setTimeout(r, 5));
  expect(provider.calls).toBe(1);
  await control.configure(operator, { agentActive: false });
  release();
  expect((await pending).state).toBe("uncertain");
  expect((await control.reconcile(operator, a.id)).state).toBe("succeeded");
  expect((await control.snapshot(operator)).agent?.active).toBe(false);
  expect(provider.calls).toBe(1);
});
it("keeps expired dispatch leases uncertain even when the provider returns success", async () => {
  const a = await control.propose(agent, proposal());
  let release!: () => void;
  provider.writeGate = new Promise<void>((r) => (release = r));
  const pending = control.execute(worker, a.id);
  for (let i = 0; i < 100 && !provider.calls; i++)
    await new Promise((r) => setTimeout(r, 5));
  await db.query(
    "UPDATE ll_refund_actions SET lease_until=now()-interval '1 second' WHERE id=$1",
    [a.id],
  );
  release();
  expect((await pending).state).toBe("uncertain");
});
it("does not hold mutation locks during provider reconciliation", async () => {
  const a = await control.propose(agent, proposal());
  await control.execute(worker, a.id, true);
  let release!: () => void;
  provider.readGate = new Promise<void>((r) => (release = r));
  const pending = control.reconcile(operator, a.id);
  await new Promise((r) => setTimeout(r, 20));
  await control.configure(operator, { agentActive: false });
  release();
  expect((await pending).state).toBe("succeeded");
  expect(provider.calls).toBe(1);
});
