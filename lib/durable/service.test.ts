import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { spawn } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { authenticate, DurableControl, tokenHash } from "./service";
import { parseProposal, type Actor } from "./contracts";

const schema = `proof_${randomBytes(8).toString("hex")}`;
let db: Pool;
let admin: Pool;
let control: DurableControl;
let operator: Actor;
let agent: Actor;
let worker: Actor;
let outsider: Actor;
const tokens = {
  operator: randomBytes(32).toString("base64url"),
  agent: randomBytes(32).toString("base64url"),
  worker: randomBytes(32).toString("base64url"),
  outsider: randomBytes(32).toString("base64url"),
};
const proposal = (discount = 5, version = 1) => ({
  actionId: randomUUID(),
  agentId: "test-agent",
  discount,
  expectedVersion: version,
});

beforeAll(async () => {
  const url = process.env.LOOPLABS_TEST_DATABASE_URL;
  if (!url)
    throw new Error(
      "Durable tests require LOOPLABS_TEST_DATABASE_URL. See docs/DURABLE_CONTROL_PLANE.md; tests never silently skip PostgreSQL.",
    );
  admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA ${schema}`);
  db = new Pool({
    connectionString: url,
    options: `-c search_path=${schema}`,
    max: 12,
  });
  await db.query(await readFile("lib/durable/schema.sql", "utf8"));
  control = new DurableControl(db);
}, 20000);
beforeEach(async () => {
  await db.query(
    "TRUNCATE ll_events,ll_effects,ll_actions,ll_tokens,ll_agents,ll_records,ll_orgs RESTART IDENTITY CASCADE",
  );
  await db.query("INSERT INTO ll_orgs(id) VALUES('one'),('two')");
  await db.query("INSERT INTO ll_records(org_id) VALUES('one'),('two')");
  await db.query(
    "INSERT INTO ll_agents(org_id,id) VALUES('one','test-agent'),('two','other-agent')",
  );
  for (const [key, token] of Object.entries(tokens)) {
    await db.query(
      "INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,$2,$3,$4)",
      [
        tokenHash(token),
        key === "outsider" ? "two" : "one",
        key === "agent" ? "test-agent" : key,
        key === "outsider" ? "operator" : key,
      ],
    );
  }
  operator = await authenticate(db, tokens.operator);
  agent = await authenticate(db, tokens.agent);
  worker = await authenticate(db, tokens.worker);
  outsider = await authenticate(db, tokens.outsider);
});
afterAll(async () => {
  await db?.end();
  if (admin) {
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});

describe("PostgreSQL control boundary", () => {
  it("rejects missing/malformed input and unknown or revoked credentials", async () => {
    for (const p of [
      null,
      [],
      {},
      { ...proposal(), discount: NaN },
      { ...proposal(), expectedVersion: 0 },
      { ...proposal(), discount: 1.1 },
      { ...proposal(), extra: true },
      { ...proposal(), actionId: "x" },
      { ...proposal(), agentId: "" },
    ])
      expect(() => parseProposal(p)).toThrow();
    await expect(authenticate(db, "bad")).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      authenticate(db, randomBytes(32).toString("hex")),
    ).rejects.toMatchObject({ status: 401 });
    await db.query("UPDATE ll_tokens SET active=false WHERE hash=$1", [
      agent.tokenHash,
    ]);
    await expect(control.propose(agent, proposal())).rejects.toMatchObject({
      status: 403,
    });
  });
  it("matches agent identity and prevents cross-tenant read, approve, and execute", async () => {
    await expect(
      control.propose(agent, { ...proposal(), agentId: "other-agent" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      control.propose(operator, { ...proposal(), agentId: "missing" }),
    ).rejects.toMatchObject({ status: 403 });
    const p = proposal(25);
    const a = await control.propose(agent, p);
    for (const attempt of [
      () => control.readAction(outsider, a.id),
      () => control.review(outsider, a.id, true, a.payload_hash),
      () => control.execute(outsider, a.id),
    ])
      await expect(attempt()).rejects.toMatchObject({ status: 404 });
    await expect(control.snapshot(agent)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      control.review(agent, a.id, true, a.payload_hash),
    ).rejects.toMatchObject({ status: 403 });
    await expect(control.execute(agent, a.id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(control.readAction(operator, "invalid")).rejects.toMatchObject(
      { status: 400 },
    );
  });
  it("serializes concurrent duplicate submissions and never duplicates capacity or effect", async () => {
    const p = proposal();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => control.propose(agent, p)),
    );
    expect(new Set(results.map((a) => a.id)).size).toBe(1);
    await expect(
      control.propose(agent, { ...p, discount: 6 }),
    ).rejects.toMatchObject({ status: 409 });
    await Promise.all(
      Array.from({ length: 8 }, () => control.execute(worker, p.actionId)),
    );
    const s = await control.snapshot(operator);
    expect(s.agents[0].reserved).toBe(1);
    expect(s.actions).toHaveLength(1);
    expect(s.effects).toHaveLength(1);
    expect(s.record).toEqual({ version: 2, discount: 5 });
    expect(s.actions[0].state).toBe("succeeded");
    expect((await control.execute(worker, p.actionId)).state).toBe("succeeded");
  });
  it("default-denies missing capability, paused agents, stale evidence, and excessive discounts", async () => {
    expect((await control.propose(agent, proposal(70))).state).toBe("blocked");
    expect((await control.propose(agent, proposal(5, 9))).state).toBe(
      "blocked",
    );
    await db.query(
      "UPDATE ll_agents SET tools=ARRAY[]::text[] WHERE org_id='one'",
    );
    expect((await control.propose(agent, proposal())).state).toBe("blocked");
    await control.configure(operator, { agentActive: false });
    expect((await control.propose(agent, proposal())).state).toBe("blocked");
    expect((await control.snapshot(operator)).agents[0].reserved).toBe(0);
  });
  it("reserves bounded action capacity atomically", async () => {
    await db.query("UPDATE ll_agents SET action_limit=1 WHERE org_id='one'");
    const result = await Promise.all([
      control.propose(agent, proposal()),
      control.propose(agent, proposal()),
    ]);
    expect(result.filter((a) => a.state === "ready")).toHaveLength(1);
    expect(result.filter((a) => a.state === "blocked")).toHaveLength(1);
  });
  it("binds approval to the exact payload and rejects approval replay", async () => {
    const a = await control.propose(agent, proposal(25));
    expect((await control.execute(worker, a.id)).state).toBe("held");
    await expect(
      control.review(operator, a.id, true, "different"),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await control.review(operator, a.id, false, a.payload_hash)).state,
    ).toBe("rejected");
    expect(
      (await control.review(operator, a.id, true, a.payload_hash)).state,
    ).toBe("rejected");
    expect((await control.execute(worker, a.id)).state).toBe("rejected");
  });
  it("executes a held action only after a named unexpired approval", async () => {
    const a = await control.propose(agent, proposal(25));
    const approved = await control.review(operator, a.id, true, a.payload_hash);
    expect(approved.approved_by).toBe("operator");
    expect((await control.execute(worker, a.id)).state).toBe("succeeded");
    const b = await control.propose(agent, proposal(30, 2));
    await control.review(operator, b.id, true, b.payload_hash);
    await db.query(
      "UPDATE ll_actions SET approval_until=now()-interval '1 second' WHERE id=$1",
      [b.id],
    );
    expect((await control.execute(worker, b.id)).state).toBe("cancelled");
  });
  it("revalidates approver authority, agent permissions, policy and source state", async () => {
    const a = await control.propose(agent, proposal(25));
    await control.review(operator, a.id, true, a.payload_hash);
    await db.query("UPDATE ll_tokens SET active=false WHERE hash=$1", [
      operator.tokenHash,
    ]);
    expect((await control.execute(worker, a.id)).state).toBe("cancelled");
    await db.query("UPDATE ll_tokens SET active=true WHERE hash=$1", [
      operator.tokenHash,
    ]);
    const b = await control.propose(agent, proposal(25));
    await db.query("UPDATE ll_records SET version=2 WHERE org_id='one'");
    expect(
      (await control.review(operator, b.id, true, b.payload_hash)).state,
    ).toBe("cancelled");
    const c = await control.propose(agent, proposal(5, 2));
    await db.query(
      "UPDATE ll_agents SET tools=ARRAY[]::text[] WHERE org_id='one'",
    );
    expect((await control.execute(worker, c.id)).state).toBe("cancelled");
  });
  it("invalidates pending work on policy changes and containment", async () => {
    const a = await control.propose(agent, proposal(25));
    await control.configure(operator, { autoLimit: 8 });
    expect(
      (await control.review(operator, a.id, true, a.payload_hash)).state,
    ).toBe("cancelled");
    const b = await control.propose(agent, proposal());
    const lease = await control.claim(worker, b.id);
    await control.configure(operator, { agentActive: false });
    await expect(
      control.applyEffect(worker, b.id, lease.lease_token!),
    ).rejects.toMatchObject({ status: 409 });
    expect((await control.reconcile(operator, b.id)).state).toBe("cancelled");
    await control.configure(operator, { agentActive: true });
    expect((await control.execute(worker, a.id)).state).toBe("cancelled");
    await expect(
      control.configure(operator, { autoLimit: -1 }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(control.configure(operator, {})).rejects.toMatchObject({
      status: 400,
    });
  });
  it("keeps a lost response uncertain and reconciles without a second write", async () => {
    const a = await control.propose(agent, proposal());
    expect((await control.execute(worker, a.id, true)).state).toBe("uncertain");
    expect((await control.execute(worker, a.id)).state).toBe("uncertain");
    expect((await control.reconcile(operator, a.id)).state).toBe("succeeded");
    expect((await control.snapshot(operator)).record.version).toBe(2);
    expect((await control.snapshot(operator)).effects).toHaveLength(1);
  });
  it("recovers after a worker crash before the effect and fences the old worker", async () => {
    const a = await control.propose(agent, proposal());
    const lease = await control.claim(worker, a.id);
    await expect(control.reconcile(operator, a.id)).rejects.toMatchObject({
      status: 409,
    });
    await db.query(
      "UPDATE ll_actions SET lease_until=now()-interval '1 second' WHERE id=$1",
      [a.id],
    );
    expect((await control.execute(worker, a.id)).state).toBe("uncertain");
    expect((await control.reconcile(operator, a.id)).state).toBe("ready");
    await expect(
      control.applyEffect(worker, a.id, lease.lease_token!),
    ).rejects.toMatchObject({ status: 409 });
    expect((await control.execute(worker, a.id)).state).toBe("succeeded");
  });
  it("persists a post-effect crash across fresh process connections", async () => {
    const a = await control.propose(agent, proposal());
    const lease = await control.claim(worker, a.id);
    await control.applyEffect(worker, a.id, lease.lease_token!);
    await db.query(
      "UPDATE ll_actions SET lease_until=now()-interval '1 second' WHERE id=$1",
      [a.id],
    );
    const fresh = new Pool({
      connectionString: process.env.LOOPLABS_TEST_DATABASE_URL,
      options: `-c search_path=${schema}`,
    });
    try {
      const restarted = new DurableControl(fresh);
      expect((await restarted.execute(worker, a.id)).state).toBe("uncertain");
      expect((await restarted.reconcile(operator, a.id)).state).toBe(
        "succeeded",
      );
      expect((await restarted.snapshot(operator)).record).toEqual({
        version: 2,
        discount: 5,
      });
    } finally {
      await fresh.end();
    }
  });
  it.each(["before-effect", "after-effect"])(
    "survives SIGKILL of a real worker %s",
    async (phase) => {
      const a = await control.propose(agent, proposal());
      const child = spawn(
        process.execPath,
        ["--import", "tsx", "scripts/durable-crash-probe.ts"],
        {
          stdio: ["ignore", "ignore", "ignore", "ipc"],
          env: {
            ...process.env,
            LOOPLABS_PROBE_TOKEN: tokens.worker,
            LOOPLABS_PROBE_SCHEMA: schema,
            LOOPLABS_PROBE_ACTION_ID: a.id,
            LOOPLABS_PROBE_PHASE: phase,
          },
        },
      );
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Crash probe did not reach its boundary.")),
            8000,
          );
          child.once("error", (e) => {
            clearTimeout(timer);
            reject(e);
          });
          child.once("exit", () => {
            clearTimeout(timer);
            reject(new Error("Crash probe exited early."));
          });
          child.once("message", (m) => {
            clearTimeout(timer);
            if ((m as { ready?: boolean }).ready) resolve();
            else reject(new Error("Crash probe failed."));
          });
        });
        const exited = new Promise((resolve) => child.once("exit", resolve));
        child.kill("SIGKILL");
        await exited;
        await db.query(
          "UPDATE ll_actions SET lease_until=now()-interval '1 second' WHERE id=$1",
          [a.id],
        );
        expect((await control.claim(worker, a.id)).state).toBe("uncertain");
        expect((await control.reconcile(operator, a.id)).state).toBe(
          phase === "after-effect" ? "succeeded" : "ready",
        );
        if (phase === "before-effect") await control.execute(worker, a.id);
        const s = await control.snapshot(operator);
        expect(s.effects).toHaveLength(1);
        expect(s.record.version).toBe(2);
      } finally {
        child.kill("SIGKILL");
      }
    },
    10000,
  );
  it("refuses reconciliation after a concurrent source write", async () => {
    const a = await control.propose(agent, proposal());
    await control.execute(worker, a.id, true);
    await db.query(
      "UPDATE ll_records SET version=3,discount=7 WHERE org_id='one'",
    );
    expect((await control.reconcile(operator, a.id)).state).toBe("conflict");
    expect((await control.snapshot(operator)).record.discount).toBe(7);
  });
  it("restores reversible fields once, only after containment and version verification", async () => {
    const a = await control.propose(agent, proposal());
    await control.execute(worker, a.id);
    await expect(control.recover(operator, a.id)).rejects.toMatchObject({
      status: 409,
    });
    await control.configure(operator, { agentActive: false });
    expect((await control.recover(operator, a.id)).state).toBe("recovered");
    expect((await control.recover(operator, a.id)).state).toBe("recovered");
    const s = await control.snapshot(operator);
    expect(s.record).toEqual({ version: 3, discount: 0 });
    expect(s.agents[0].active).toBe(false);
    expect(s.effects[0].recovered).toBe(true);
  });
  it("refuses recovery over concurrent writes and prevents audit edits", async () => {
    const a = await control.propose(agent, proposal());
    await control.execute(worker, a.id);
    await control.configure(operator, { agentActive: false });
    await db.query(
      "UPDATE ll_records SET version=3,discount=9 WHERE org_id='one'",
    );
    expect((await control.recover(operator, a.id)).state).toBe("conflict");
    await expect(db.query("UPDATE ll_events SET kind='fake'")).rejects.toThrow(
      "cannot be updated or deleted",
    );
    await expect(db.query("DELETE FROM ll_events")).rejects.toThrow(
      "cannot be updated or deleted",
    );
    expect((await control.snapshot(operator)).record.discount).toBe(9);
  });
});
