import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { PAYMENT } from "./contracts";
import { tokenHash } from "../durable/service";
import { createInstalledTenantFixture } from "../workspace/installed-tenant-fixture";
let fixture: Awaited<ReturnType<typeof createInstalledTenantFixture>>;
const tokens = {
  operator: randomBytes(32).toString("base64url"),
  agent: randomBytes(32).toString("base64url"),
  worker: randomBytes(32).toString("base64url"),
};
vi.mock("../workspace/tenant-context", async (original) => ({
  ...(await original<typeof import("../workspace/tenant-context")>()),
  tenantContext: () => fixture.context,
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
      ...(role === "operator"
        ? { cookie: `looplabs_workspace_session=${tokens.operator}` }
        : { authorization: `Bearer ${tokens[role]}` }),
      origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
beforeAll(async () => {
  fixture = await createInstalledTenantFixture({
    tenants: ["http"], salesOrg: "http", seed: async (owner) => {
      await owner.query("INSERT INTO ll_refund_policies(org_id) VALUES('http')");
      await owner.query(
        "INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('operator@test.example','http','Operator','fixture')",
      );
      await owner.query(
        "INSERT INTO ll_sessions(hash,email,expires_at) VALUES($1,'operator@test.example',now()+interval '1 hour')",
        [tokenHash(tokens.operator)],
      );
      await owner.query(
        "INSERT INTO ll_agents(org_id,id,tools) VALUES('http','refund-agent',ARRAY['stripe.refund'])",
      );
      // Distinct scoped legacy agent/worker identities remain authenticated by
      // the installed broker; named human requests use the actual session table.
      for (const role of ["agent", "worker"] as const)
        await owner.query(
          "INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'http',$2,$3)",
          [tokenHash(tokens[role]), role === "agent" ? "refund-agent" : role, role],
        );
    },
  });
}, 20000);
afterAll(async () => { await fixture?.close(); });
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
        { headers: role === "operator"
          ? { cookie: `looplabs_workspace_session=${tokens.operator}` }
          : { authorization: `Bearer ${tokens[role]}` } },
      ),
    );
  expect((await get("operator")).status).toBe(200);
  expect((await get("agent")).status).toBe(403);
  expect((await get("agent", a.id)).status).toBe(200);
  expect(await (await get("operator")).text()).not.toContain(tokens.operator);
});
