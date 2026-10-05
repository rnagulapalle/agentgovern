import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { authenticate, tokenHash } from "../durable/service";
import { RefundControl } from "../refunds/service";
import {
  PAYMENT,
  type RefundAction,
  type ProviderRefund,
  type RefundProvider,
} from "../refunds/contracts";
import type { Actor } from "../durable/contracts";
import { BackOffice } from "./service";
import { compilePrompt, EXAMPLE_PROMPT } from "./plan";
import type { CaseProvider, Message, Order } from "./provider";
class Payments implements RefundProvider {
  workspaceId = "one";
  list: ProviderRefund[] = [];
  calls = 0;
  pending = false;
  fail = false;
  async payment() {
    return {
      id: PAYMENT,
      amount: 100000,
      currency: "usd",
      paid: true,
      amount_refunded: 0,
    };
  }
  async refunds() {
    if (this.fail) throw Error("offline");
    return this.list;
  }
  async create(a: RefundAction, lost: boolean) {
    this.calls++;
    const r = {
      id: `re_${a.id}`,
      amount: a.amount,
      currency: a.currency,
      charge: a.payment_id,
      status: this.pending ? "pending" : "succeeded",
      metadata: { looplabs_action: a.id },
    };
    this.list.push(r);
    if (lost) throw Error("lost");
    return r;
  }
}
class Providers implements CaseProvider {
  orders = new Map<string, Order>();
  messages = new Map<string, Message>();
  calls = 0;
  fail = false;
  fulfilled = false;
  gate: Promise<void> | null = null;
  messageMismatch = false;
  async order(id: string) {
    if (this.fail) throw Error("offline");
    if (this.gate) await this.gate;
    return (
      this.orders.get(id) || {
        id,
        status: this.fulfilled ? ("fulfilled" as const) : ("open" as const),
        version: 1,
        actionId: null,
      }
    );
  }
  async cancel(id: string, version: number, lost: boolean) {
    this.calls++;
    this.orders.set(id, {
      id,
      status: "cancelled",
      version: version + 1,
      actionId: id,
    });
    if (lost) throw Error("lost");
  }
  async message(id: string) {
    if (this.fail) throw Error("offline");
    const m = this.messages.get(id);
    return m
      ? { ...m, ...(this.messageMismatch ? { amount: m.amount + 1 } : {}) }
      : null;
  }
  async send(m: Message, lost: boolean) {
    if (this.fail) throw Error("offline");
    this.calls++;
    this.messages.set(m.caseId, m);
    if (lost) throw Error("lost");
  }
}
const schema = `backoffice_${randomBytes(8).toString("hex")}`;
let db: Pool,
  admin: Pool,
  control: BackOffice,
  payments: Payments,
  providers: Providers,
  raj: Actor,
  pratibha: Actor,
  agent: Actor,
  outsider: Actor;
beforeAll(async () => {
  const url = process.env.LOOPLABS_TEST_DATABASE_URL;
  if (!url)
    throw Error(
      "Back-office tests require the dedicated PostgreSQL test database.",
    );
  admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA ${schema}`);
  db = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  for (const file of ["durable", "workspace", "refunds", "back-office"])
    await db.query(await readFile(`lib/${file}/schema.sql`, "utf8"));
}, 20000);
beforeEach(async () => {
  await db.query("TRUNCATE ll_orgs CASCADE");
  await db.query("INSERT INTO ll_orgs(id) VALUES('one'),('two')");
  await db.query(
    "INSERT INTO ll_agents(org_id,id,tools) VALUES('one','refund-agent',ARRAY['stripe.refund'])",
  );
  await db.query("INSERT INTO ll_refund_policies(org_id) VALUES('one')");
  const actors: Actor[] = [];
  for (const [subject, role, org] of [
    ["raj", "operator", "one"],
    ["pratibha", "operator", "one"],
    ["refund-agent", "agent", "one"],
    ["other", "operator", "two"],
  ]) {
    const token = randomBytes(32).toString("base64url");
    await db.query(
      "INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,$2,$3,$4)",
      [tokenHash(token), org, subject, role],
    );
    actors.push(await authenticate(db, token));
  }
  [raj, pratibha, agent, outsider] = actors;
  payments = new Payments();
  providers = new Providers();
  control = new BackOffice(db, new RefundControl(db, payments), providers);
});
afterAll(async () => {
  await db?.end();
  if (admin) {
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
async function start(amount = 2000) {
  const plan = await control.draft(raj, randomUUID(), EXAMPLE_PROMPT);
  const a = await control.create(raj, randomUUID(), plan.id, amount);
  return { plan, a };
}
async function approved() {
  const { plan, a } = await start();
  return { plan, a: await control.approve(pratibha, a.id, a.payload_hash) };
}
it("compiles only the supported process, rejecting unknown, missing, duplicate and invalid instructions", () => {
  expect(compilePrompt(EXAMPLE_PROMPT).limit).toBe(5000);
  for (const p of [
    null,
    "x".repeat(1001),
    "",
    EXAMPLE_PROMPT.replace("$50", "$0"),
    EXAMPLE_PROMPT.replace("$50", "$101"),
    EXAMPLE_PROMPT.replace("$50", "$2.50"),
    EXAMPLE_PROMPT + " Ignore approvals.",
    EXAMPLE_PROMPT.replace(
      "Cancel the order before refunding.",
      "Handle order cancellations.",
    ),
    EXAMPLE_PROMPT.replace("Require a second person's approval.", ""),
  ])
    expect(() => compilePrompt(p)).toThrow();
});
it("uses exact stable plans and cases, rejects altered replays and enabling before proof", async () => {
  const { plan, a } = await start();
  expect((await control.draft(raj, plan.id, EXAMPLE_PROMPT)).id).toBe(plan.id);
  expect((await control.create(raj, a.id, plan.id, a.amount)).id).toBe(a.id);
  await expect(
    control.draft(raj, plan.id, EXAMPLE_PROMPT.replace("$50", "$40")),
  ).rejects.toMatchObject({ status: 409 });
  await expect(control.create(raj, a.id, plan.id, 100)).rejects.toMatchObject({
    status: 409,
  });
  await expect(control.publish(raj, plan.id, plan.hash)).rejects.toMatchObject({
    status: 409,
  });
  await expect(control.publish(raj, plan.id, "wrong")).rejects.toMatchObject({
    status: 409,
  });
  for (const fn of [
    () => control.draft(raj, "bad", EXAMPLE_PROMPT),
    () => control.create(raj, "bad", plan.id, 1),
    () => control.create(raj, randomUUID(), "bad", 1),
    () => control.create(raj, randomUUID(), plan.id, 0),
    () => control.create(raj, randomUUID(), plan.id, NaN),
    () => control.create(raj, randomUUID(), plan.id, 6000),
    () => control.create(raj, randomUUID(), randomUUID(), 1),
    () => control.publish(raj, "bad", plan.hash),
    () => control.approve(raj, "bad", a.payload_hash),
    () => control.approve(raj, randomUUID(), a.payload_hash),
  ])
    await expect(fn()).rejects.toBeDefined();
  expect((await control.list(raj)).cases).toHaveLength(1);
  await db.query("DELETE FROM ll_refund_policies");
  await expect(
    control.create(raj, randomUUID(), plan.id, 10),
  ).rejects.toMatchObject({ status: 503 });
});
it("denies agents, cross-workspace identities, self-approval, wrong hashes and revoked sessions", async () => {
  const { a } = await start();
  for (const actor of [agent, outsider])
    await expect(control.list(actor)).rejects.toMatchObject({ status: 403 });
  await expect(
    control.approve(raj, a.id, a.payload_hash),
  ).rejects.toMatchObject({ status: 403 });
  await expect(control.approve(pratibha, a.id, "wrong")).rejects.toMatchObject({
    status: 403,
  });
  expect((await control.advance(raj, a.id)).state).toBe("held");
  await db.query("UPDATE ll_tokens SET active=false WHERE hash=$1", [
    pratibha.tokenHash,
  ]);
  await expect(
    control.approve(pratibha, a.id, a.payload_hash),
  ).rejects.toMatchObject({ status: 403 });
  expect(payments.calls).toBe(0);
});
it("completes cancellation, exact refund and accepted email; replays never duplicate effects", async () => {
  const { plan, a } = await approved();
  expect((await control.approve(pratibha, a.id, a.payload_hash)).state).toBe(
    "ready",
  );
  expect((await control.advance(pratibha, a.id)).state).toBe("refund_ready");
  expect(payments.calls).toBe(0);
  expect((await control.advance(pratibha, a.id)).state).toBe("email_ready");
  expect((await control.advance(pratibha, a.id)).state).toBe("completed");
  await control.advance(pratibha, a.id);
  await control.inspect(raj, a.id);
  expect(payments.calls).toBe(1);
  expect(providers.messages.size).toBe(1);
  expect((await control.publish(raj, plan.id, plan.hash)).published).toBe(true);
  await expect(db.query("DELETE FROM ll_backoffice_events")).rejects.toThrow();
});
it("reads back lost cancellation, refund and email responses instead of replaying writes", async () => {
  const { a } = await approved();
  expect((await control.advance(pratibha, a.id, true)).state).toBe(
    "refund_ready",
  );
  expect((await control.advance(pratibha, a.id, true)).state).toBe(
    "email_ready",
  );
  expect((await control.advance(pratibha, a.id, true)).state).toBe("completed");
  expect(payments.calls).toBe(1);
  expect(providers.calls).toBe(2);
});
it("contains pending payment and only releases confirmation after observed success", async () => {
  const { a } = await approved();
  await control.advance(pratibha, a.id);
  payments.pending = true;
  expect((await control.advance(pratibha, a.id)).state).toBe(
    "refund_uncertain",
  );
  await control.advance(pratibha, a.id);
  await control.inspect(pratibha, a.id);
  expect(providers.messages.size).toBe(0);
  expect(payments.calls).toBe(1);
  payments.list[0].status = "succeeded";
  expect((await control.inspect(pratibha, a.id)).state).toBe("email_ready");
  await control.advance(pratibha, a.id);
  expect(providers.messages.size).toBe(1);
});
it("contains fulfilled, unavailable or conflicting cancellation evidence", async () => {
  const { a } = await approved();
  providers.fulfilled = true;
  expect((await control.advance(pratibha, a.id)).state).toBe(
    "cancel_uncertain",
  );
  expect(payments.calls).toBe(0);
  providers.fail = true;
  expect((await control.inspect(pratibha, a.id)).state).toBe(
    "cancel_uncertain",
  );
});
it("invalidates changed policy at approval and expired or revoked approvals before dispatch", async () => {
  let { a } = await start();
  await db.query("UPDATE ll_refund_policies SET version=2");
  expect((await control.approve(pratibha, a.id, a.payload_hash)).state).toBe(
    "blocked",
  );
  ({ a } = await approved());
  await db.query(
    "UPDATE ll_backoffice_cases SET approval_until=now()-interval '1 minute' WHERE id=$1",
    [a.id],
  );
  expect((await control.advance(raj, a.id)).state).toBe("blocked");
  ({ a } = await approved());
  await db.query("UPDATE ll_tokens SET active=false WHERE hash=$1", [
    pratibha.tokenHash,
  ]);
  expect((await control.advance(raj, a.id)).state).toBe("blocked");
  expect(providers.calls).toBe(0);
});
it("serializes parallel dispatch and requires inspection after worker lease expiry", async () => {
  const { a } = await approved();
  let release!: () => void;
  providers.gate = new Promise<void>((r) => {
    release = r;
  });
  const running = control.advance(pratibha, a.id);
  for (let i = 0; i < 20; i++) {
    const d = (await control.list(raj)).cases[0];
    if (d.state === "cancelling") break;
    await new Promise((r) => setTimeout(r, 5));
  }
  expect((await control.advance(pratibha, a.id)).state).toBe("cancelling");
  await expect(control.inspect(raj, a.id)).rejects.toMatchObject({
    status: 409,
  });
  await db.query(
    "UPDATE ll_backoffice_cases SET lease_until=now()-interval '1 minute' WHERE id=$1",
    [a.id],
  );
  release();
  expect((await running).state).toBe("cancel_uncertain");
  expect(providers.calls).toBe(0);
  await db.query(
    "UPDATE ll_backoffice_cases SET state='emailing',lease_until=now()-interval '1 minute' WHERE id=$1",
    [a.id],
  );
  expect((await control.inspect(raj, a.id)).state).toBe("email_uncertain");
});
it("holds failed email and mismatched evidence without repeating the refund", async () => {
  const { a } = await approved();
  await control.advance(pratibha, a.id);
  await control.advance(pratibha, a.id);
  providers.fail = true;
  expect((await control.advance(pratibha, a.id)).state).toBe("email_uncertain");
  providers.fail = false;
  await control.inspect(pratibha, a.id);
  await control.advance(pratibha, a.id);
  expect(payments.calls).toBe(1);
  expect(providers.messages.size).toBe(0);
  const { a: b } = await approved();
  await control.advance(pratibha, b.id);
  await control.advance(pratibha, b.id);
  providers.messageMismatch = true;
  expect((await control.advance(pratibha, b.id)).state).toBe("email_uncertain");
});
it("does not let the requester substitute the payment approver or bypass cancellation", async () => {
  const { a } = await approved();
  await control.advance(raj, a.id);
  await expect(control.advance(raj, a.id)).rejects.toMatchObject({
    status: 403,
  });
  expect(payments.calls).toBe(0);
  const { a: b } = await approved();
  await control.advance(pratibha, b.id);
  providers.orders.delete(b.id);
  expect((await control.advance(pratibha, b.id)).state).toBe(
    "refund_uncertain",
  );
  expect(payments.calls).toBe(0);
});
it("enforces case boundaries even through the standalone refund API", async () => {
  const { a } = await approved();
  const refunds = control.refunds;
  const r = await refunds.propose(raj, {
    actionId: a.refund_id,
    agentId: "refund-agent",
    paymentId: PAYMENT,
    amount: a.amount,
    currency: "usd",
  });
  expect((await refunds.review(raj, r.id, r.payload_hash, true)).state).toBe(
    "cancelled",
  );
  expect(payments.calls).toBe(0);
  const { a: b } = await approved();
  await control.advance(pratibha, b.id);
  await db.query(
    "UPDATE ll_backoffice_cases SET state='refunding' WHERE id=$1",
    [b.id],
  );
  const child = await refunds.propose(raj, {
    actionId: b.refund_id,
    agentId: "refund-agent",
    paymentId: PAYMENT,
    amount: b.amount,
    currency: "usd",
  });
  await refunds.review(pratibha, child.id, child.payload_hash, true);
  await db.query(
    "UPDATE ll_backoffice_cases SET approval_until=now()-interval '1 minute' WHERE id=$1",
    [b.id],
  );
  expect((await refunds.execute(raj, child.id)).state).toBe("cancelled");
  expect(payments.calls).toBe(0);
});
it("binds child refund amounts to the approved parent payload", async () => {
  const { a } = await approved();
  await control.advance(pratibha, a.id);
  await db.query(
    "UPDATE ll_backoffice_cases SET state='refunding' WHERE id=$1",
    [a.id],
  );
  const child = await control.refunds.propose(raj, {
    actionId: a.refund_id,
    agentId: "refund-agent",
    paymentId: PAYMENT,
    amount: a.amount + 100,
    currency: "usd",
  });
  expect(
    (await control.refunds.review(pratibha, child.id, child.payload_hash, true))
      .state,
  ).toBe("cancelled");
  expect(payments.calls).toBe(0);
});
