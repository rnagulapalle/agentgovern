import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { tokenHash } from "./service";

let db: Pool;
let admin: Pool;
const schema = `proof_${randomBytes(8).toString("hex")}`;
const tokens = {
  operator: randomBytes(32).toString("base64url"),
  agent: randomBytes(32).toString("base64url"),
  worker: randomBytes(32).toString("base64url"),
};
vi.mock("./database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./database")>()),
  database: () => db,
}));
import { GET, POST } from "@/app/api/durable/route";
import {
  POST as login,
  DELETE as logout,
} from "@/app/api/durable/session/route";

const req = (
  value: unknown,
  role: keyof typeof tokens = "operator",
  origin = "https://looplabs.run",
) =>
  new NextRequest("https://looplabs.run/api/durable", {
    method: "POST",
    headers: {
      authorization: `Bearer ${tokens[role]}`,
      origin,
      "content-type": "application/json",
    },
    body: JSON.stringify(value),
  });
beforeAll(async () => {
  const url = process.env.LOOPLABS_TEST_DATABASE_URL;
  if (!url) throw new Error("PostgreSQL is required for HTTP-boundary tests.");
  admin = new Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA ${schema}`);
  db = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  await db.query(await readFile("lib/durable/schema.sql", "utf8"));
  await db.query("INSERT INTO ll_orgs(id) VALUES('http')");
  await db.query("INSERT INTO ll_records(org_id) VALUES('http')");
  await db.query(
    "INSERT INTO ll_agents(org_id,id) VALUES('http','http-agent')",
  );
  for (const [role, token] of Object.entries(tokens))
    await db.query(
      "INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'http',$2,$3)",
      [tokenHash(token), role === "agent" ? "http-agent" : role, role],
    );
});
afterAll(async () => {
  await db?.end();
  if (admin) {
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
describe("Actual durable API routes", () => {
  it("fails closed for anonymous access and cross-site browser mutations", async () => {
    expect(
      (await GET(new NextRequest("https://looplabs.run/api/durable"))).status,
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
    expect((await POST(req({ operation: "configure", extra: 1 }))).status).toBe(
      400,
    );
    expect(
      (await POST(req({ operation: "unknown", actionId: randomUUID() })))
        .status,
    ).toBe(400);
    expect((await POST(req({ operation: "execute" }))).status).toBe(400);
    expect(
      (
        await POST(
          req({
            operation: "execute",
            actionId: randomUUID(),
            lostResponse: "yes",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (await POST(req({ operation: "approve", actionId: randomUUID() })))
        .status,
    ).toBe(400);
    expect(
      (
        await POST(
          req({ operation: "reconcile", actionId: randomUUID(), extra: true }),
        )
      ).status,
    ).toBe(400);
  });
  it("uses protected sessions, excludes secrets, and denies agent operator access", async () => {
    expect((await login(req({ token: tokens.agent }))).status).toBe(403);
    expect((await login(req({ token: 1 }))).status).toBe(400);
    const signedIn = await login(req({ token: tokens.operator }));
    expect(signedIn.status).toBe(200);
    const cookie = signedIn.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie.toLowerCase()).toContain("samesite=strict");
    expect(await signedIn.text()).not.toContain(tokens.operator);
    const snapshot = await GET(
      new NextRequest("https://looplabs.run/api/durable", {
        headers: { cookie: cookie.split(";")[0] },
      }),
    );
    expect(snapshot.status).toBe(200);
    expect(await snapshot.text()).not.toContain(tokens.operator);
    expect(
      (
        await GET(
          new NextRequest("https://looplabs.run/api/durable", {
            headers: { authorization: `Bearer ${tokens.agent}` },
          }),
        )
      ).status,
    ).toBe(403);
    expect((await logout(req({}))).headers.get("set-cookie")).toContain(
      "Max-Age=0",
    );
    expect(
      (await logout(req({}, "operator", "https://evil.example"))).status,
    ).toBe(403);
  });
  it("holds a real agent proposal and requires exact-payload operator approval", async () => {
    const actionId = randomUUID();
    const result = await POST(
      req(
        {
          operation: "propose",
          actionId,
          agentId: "http-agent",
          discount: 25,
          expectedVersion: 1,
        },
        "agent",
      ),
    );
    expect(result.status).toBe(200);
    const a = await result.json();
    expect(a.state).toBe("held");
    expect(a.lease_token).toBeNull();
    expect(
      (
        await POST(
          req(
            { operation: "approve", actionId, payloadHash: a.payload_hash },
            "agent",
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await POST(
          req({ operation: "approve", actionId, payloadHash: "wrong" }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await POST(
          req({ operation: "approve", actionId, payloadHash: a.payload_hash }),
        )
      ).status,
    ).toBe(200);
    expect(
      (await POST(req({ operation: "execute", actionId }, "agent"))).status,
    ).toBe(403);
    const execute = await POST(
      req({ operation: "execute", actionId, lostResponse: true }, "worker"),
    );
    expect((await execute.json()).state).toBe("uncertain");
    expect(
      (await (await POST(req({ operation: "reconcile", actionId }))).json())
        .state,
    ).toBe("succeeded");
    const read = await GET(
      new NextRequest(`https://looplabs.run/api/durable?action=${actionId}`, {
        headers: { authorization: `Bearer ${tokens.agent}` },
      }),
    );
    expect((await read.json()).state).toBe("succeeded");
    expect(
      (await POST(req({ operation: "configure", agentActive: false }))).status,
    ).toBe(200);
    expect(
      (await (await POST(req({ operation: "recover", actionId }))).json())
        .state,
    ).toBe("recovered");
  });
});
