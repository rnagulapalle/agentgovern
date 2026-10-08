import { readFile } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { tokenHash } from "../durable/service";
let db: Pool, admin: Pool;
const schema = `connector_http_${randomBytes(8).toString("hex")}`;
const tokens = {
  operator: randomBytes(32).toString("base64url"),
  second: randomBytes(32).toString("base64url"),
  agent: randomBytes(32).toString("base64url"),
};
vi.mock("../durable/database", async (original) => ({
  ...(await original<typeof import("../durable/database")>()),
  database: () => db,
}));
vi.mock("./twin", async original => ({
  ...(await original<typeof import("./twin")>()),
  FetchSandboxConnectors: class {
    readonly workspaceId = "http";
    readonly bindingId = "a".repeat(64);
    async source() {
      return "v1";
    }
    async write() {
      return {
        outcome: "verified",
        reference: "test",
        detail: "Test effect verified",
      };
    }
    async inspect() {
      return {
        outcome: "verified",
        reference: "test",
        detail: "Test effect verified",
      };
    }
  },
}));
import { GET, POST } from "@/app/api/durable/connectors/route";
const req = (
  value: unknown,
  role: keyof typeof tokens = "operator",
  origin = "https://looplabs.run",
) =>
  new NextRequest("https://looplabs.run/api/durable/connectors", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokens[role]}`,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(value),
  });
beforeAll(async () => {
  if (!process.env.LOOPLABS_TEST_DATABASE_URL)
    throw new Error("Connector API tests require PostgreSQL.");
  admin = new Pool({
    connectionString: process.env.LOOPLABS_TEST_DATABASE_URL,
  });
  await admin.query(`CREATE SCHEMA ${schema}`);
  db = new Pool({
    connectionString: process.env.LOOPLABS_TEST_DATABASE_URL,
    options: `-c search_path=${schema}`,
  });
  for (const file of [
    "lib/durable/schema.sql",
    "lib/workspace/schema.sql",
    "lib/connectors/schema.sql",
    "lib/workflows/schema.sql",
    "lib/enquiries/schema.sql",
  ])
    await db.query(await readFile(file, "utf8"));
  await db.query("INSERT INTO ll_orgs(id) VALUES('http')");
  await db.query(
    "INSERT INTO ll_agents(org_id,id,tools) VALUES('http','agent',ARRAY['twin.crm','twin.email'])",
  );
  await db.query(
    "INSERT INTO ll_connector_policies(org_id,connector) VALUES('http','crm'),('http','email')",
  );
  for (const [role, token] of Object.entries(tokens))
    await db.query(
      "INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'http',$2,$3)",
      [tokenHash(token), role, role === "agent" ? "agent" : "operator"],
    );
});
afterAll(async () => {
  await db?.end();
  await admin?.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin?.end();
});
it("enforces auth, CSRF, named approval and exact supported API fields", async () => {
  expect(
    (await GET(new NextRequest("https://looplabs.run/api/durable/connectors")))
      .status,
  ).toBe(401);
  const proposal = {
    operation: "propose",
    actionId: randomUUID(),
    agentId: "agent",
    connector: "crm",
    payload: { lifecycle: "customer" },
  };
  expect((await POST(req(proposal, "agent", "https://evil.test"))).status).toBe(
    403,
  );
  const r = await POST(req(proposal, "agent"));
  expect(r.status).toBe(200);
  const a = await r.json();
  expect(
    (
      await POST(
        req(
          { operation: "approve", actionId: a.id, payloadHash: a.payload_hash },
          "agent",
        ),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await POST(
        req({ operation: "approve", actionId: a.id, payloadHash: "changed" }),
      )
    ).status,
  ).toBe(409);
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
  expect(
    (
      await POST(
        req({ operation: "execute", actionId: a.id, lostResponse: "true" }),
      )
    ).status,
  ).toBe(400);
  expect(
    (await POST(req({ operation: "execute", actionId: a.id, extra: true })))
      .status,
  ).toBe(400);
  expect(
    (await POST(req({ operation: "execute", actionId: a.id }))).status,
  ).toBe(200);
  expect(
    (await POST(req({ operation: "reconcile", actionId: a.id }))).status,
  ).toBe(200);
  expect(
    (
      await GET(
        new NextRequest(
          `https://looplabs.run/api/durable/connectors?action=${a.id}`,
          { headers: { Authorization: `Bearer ${tokens.agent}` } },
        ),
      )
    ).status,
  ).toBe(200);
  const full = await GET(
    new NextRequest("https://looplabs.run/api/durable/connectors", {
      headers: { Authorization: `Bearer ${tokens.operator}` },
    }),
  );
  expect(full.status).toBe(200);
  expect(full.headers.get("cache-control")).toBe("no-store");
  const human = await (
    await POST(req({ ...proposal, actionId: randomUUID() }))
  ).json();
  expect(
    (
      await POST(
        req({
          operation: "approve",
          actionId: human.id,
          payloadHash: human.payload_hash,
        }),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await POST(
        req(
          {
            operation: "reject",
            actionId: human.id,
            payloadHash: human.payload_hash,
          },
          "second",
        ),
      )
    ).status,
  ).toBe(200);
  for (const data of [
    { operation: "approve", actionId: a.id },
    { operation: "execute", actionId: "bad" },
    { operation: "surprise", actionId: a.id },
    { operation: "contain", connector: "crm", extra: true },
    { operation: "contain" },
    { ...proposal, payload: { lifecycle: "admin" } },
  ])
    expect((await POST(req(data))).status).toBe(400);
  expect(
    (await POST(req({ operation: "contain", connector: "crm" }))).status,
  ).toBe(200);
  expect(
    (await POST(req({ operation: "enable", connector: "crm" }))).status,
  ).toBe(200);
});

it("workflow HTTP enrollment is authenticated, strict and cannot grant an agent approval or execution", async () => {
  const { GET: read, POST: write } = await import(
    "@/app/api/durable/workflows/route"
  );
  const get = (suffix = "", auth = true) =>
    new NextRequest("https://looplabs.run/api/durable/workflows" + suffix, {
      headers: auth ? { Authorization: `Bearer ${tokens.operator}` } : {},
    });
  expect((await read(get("", false))).status).toBe(401);
  expect(
    (
      await write(
        req(
          {
            operation: "create",
            crmAgent: "agent",
            emailAgent: "agent",
            runId: randomUUID(),
          },
          "agent",
        ),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await write(
        req({
          operation: "create",
          crmAgent: "agent",
          emailAgent: "agent",
          runId: randomUUID(),
          extra: true,
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (await write(req({ operation: "unknown", runId: randomUUID() }))).status,
  ).toBe(400);
  const response = await write(
    req({
      operation: "create",
      crmAgent: "agent",
      emailAgent: "agent",
      runId: randomUUID(),
    }),
  );
  expect(response.status).toBe(200);
  const { id } = await response.json();
  expect((await read(get())).status).toBe(200);
  expect((await read(get("?run=" + id))).status).toBe(200);
  expect((await write(req({ operation: "verify", runId: id }))).status).toBe(
    409,
  );
  expect((await write(req({ operation: "pause", runId: id }))).status).toBe(
    200,
  );
  expect(
    (
      await write(
        req({ operation: "pause", runId: id }, "operator", "https://evil.test"),
      )
    ).status,
  ).toBe(403);
});
