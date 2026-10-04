import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { PAYMENT } from "./contracts";
import { tokenHash } from "../durable/service";
let db: Pool, admin: Pool;
const schema = `refund_http_${randomBytes(8).toString("hex")}`;
const tokens = {
  operator: randomBytes(32).toString("base64url"),
  agent: randomBytes(32).toString("base64url"),
  worker: randomBytes(32).toString("base64url"),
};
vi.mock("../durable/database", async (original) => ({
  ...(await original<typeof import("../durable/database")>()),
  database: () => db,
}));
vi.mock("./twin", () => ({
  FetchSandboxStripe: class {
    readonly workspaceId = "http";
    async payment() {
      return {
        id: "ch_looplabs_refund_demo",
        amount: 100000,
        currency: "usd",
        paid: true,
        amount_refunded: 0,
      };
    }
    async refunds() {
      return [];
    }
    async create(a: { id: string; amount: number; payment_id: string }) {
      return {
        id: "re_test",
        amount: a.amount,
        currency: "usd",
        charge: a.payment_id,
        status: "succeeded",
        metadata: { looplabs_action: a.id },
      };
    }
  },
}));
import { GET, POST } from "@/app/api/durable/refunds/route";
const req = (
  data: unknown,
  role: keyof typeof tokens = "operator",
  origin = "https://looplabs.run",
) =>
  new NextRequest("https://looplabs.run/api/durable/refunds", {
    method: "POST",
    headers: {
      authorization: `Bearer ${tokens[role]}`,
      origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
beforeAll(async () => {
  if (!process.env.LOOPLABS_TEST_DATABASE_URL)
    throw new Error("PostgreSQL is required for refund API tests.");
  admin = new Pool({
    connectionString: process.env.LOOPLABS_TEST_DATABASE_URL,
  });
  await admin.query(`CREATE SCHEMA ${schema}`);
  db = new Pool({
    connectionString: process.env.LOOPLABS_TEST_DATABASE_URL,
    options: `-c search_path=${schema}`,
  });
  await db.query(await readFile("lib/durable/schema.sql", "utf8"));
  await db.query(await readFile("lib/refunds/schema.sql", "utf8"));
  await db.query("INSERT INTO ll_orgs(id) VALUES('http')");
  await db.query("INSERT INTO ll_refund_policies(org_id) VALUES('http')");
  await db.query(
    "INSERT INTO ll_agents(org_id,id,tools) VALUES('http','refund-agent',ARRAY['stripe.refund'])",
  );
  for (const [role, token] of Object.entries(tokens))
    await db.query(
      "INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'http',$2,$3)",
      [tokenHash(token), role === "agent" ? "refund-agent" : role, role],
    );
}, 20000);
afterAll(async () => {
  await db?.end();
  if (admin) {
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
it("refund API denies anonymous, cross-origin, malformed and unknown operations", async () => {
  expect(
    (await GET(new NextRequest("https://looplabs.run/api/durable/refunds")))
      .status,
  ).toBe(401);
  expect(
    (
      await POST(
        req(
          { operation: "configure", agentActive: true },
          "operator",
          "https://evil.example",
        ),
      )
    ).status,
  ).toBe(403);
  for (const value of [
    { operation: "unknown", actionId: randomUUID() },
    { operation: "execute" },
    { operation: "execute", actionId: randomUUID(), extra: 1 },
    { operation: "execute", actionId: randomUUID(), lostResponse: "yes" },
    { operation: "approve", actionId: randomUUID() },
  ])
    expect((await POST(req(value))).status).toBe(400);
  expect(
    (await POST(req({ operation: "configure", agentActive: true }))).status,
  ).toBe(200);
});
it("refund API binds approvals and serves operator evidence and agent-scoped action status", async () => {
  const p = {
    operation: "propose",
    actionId: randomUUID(),
    agentId: "refund-agent",
    paymentId: PAYMENT,
    amount: 2500,
    currency: "usd",
  };
  const response = await POST(req(p, "agent"));
  expect(response.status).toBe(200);
  const a = await response.json();
  expect(a.state).toBe("held");
  expect(
    (
      await POST(
        req({
          operation: "approve",
          actionId: a.id,
          payloadHash: a.payload_hash,
        }),
      )
    ).status,
  ).toBe(200);
  const executed = await POST(
    req({ operation: "execute", actionId: a.id }, "worker"),
  );
  expect((await executed.json()).state).toBe("succeeded");
  expect(
    (await POST(req({ operation: "reconcile", actionId: a.id }))).status,
  ).toBe(200);
  const held = await (
    await POST(req({ ...p, actionId: randomUUID() }, "agent"))
  ).json();
  expect(
    (
      await POST(
        req({
          operation: "reject",
          actionId: held.id,
          payloadHash: held.payload_hash,
        }),
      )
    ).status,
  ).toBe(200);
  const get = (role: keyof typeof tokens, id = "") =>
    GET(
      new NextRequest(
        "https://looplabs.run/api/durable/refunds" +
          (id ? "?action=" + id : ""),
        { headers: { authorization: `Bearer ${tokens[role]}` } },
      ),
    );
  expect((await get("operator")).status).toBe(200);
  expect((await get("agent")).status).toBe(403);
  expect((await get("agent", a.id)).status).toBe(200);
  expect(await (await get("operator")).text()).not.toContain(tokens.operator);
});
