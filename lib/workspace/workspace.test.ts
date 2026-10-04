import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { ControlError } from "../durable/contracts";
import {
  authenticate,
  authorize,
  DurableControl,
  tokenHash,
} from "../durable/service";
import { passwordHash, passwordMatches, signIn } from "./auth";
import { digest, memberSession, WORKSPACE_COOKIE } from "./identity";
import { agentDirectory, parseAgent, registerAgent } from "./agents";
import { parseSales, submitSales } from "./sales";
import { safeNext } from "./navigation";
let admin: Pool;
let db: Pool;
let createdRuntimeRole = false;
const schema = `ws_${randomBytes(8).toString("hex")}`;
const memberEmail = "owner@example.com";
const password = "example-password-for-test";
const agentToken = randomBytes(32).toString("base64url");
vi.mock("../durable/database", async (original) => ({
  ...(await original<typeof import("../durable/database")>()),
  database: () => db,
}));
import {
  POST as login,
  GET as profile,
  DELETE as logout,
} from "@/app/api/workspace/session/route";
import {
  POST as onboard,
  GET as directory,
} from "@/app/api/workspace/agents/route";
import { POST as sales } from "@/app/api/sales/route";
const req = (
  path: string,
  value?: unknown,
  token?: string,
  origin = "https://looplabs.run",
) =>
  new NextRequest(`https://looplabs.run${path}`, {
    method: value === undefined ? "GET" : "POST",
    headers: {
      origin,
      ...(value === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { cookie: `${WORKSPACE_COOKIE}=${token}` } : {}),
    },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  });
beforeAll(async () => {
  if (!process.env.LOOPLABS_TEST_DATABASE_URL)
    throw new Error("Dedicated PostgreSQL required for workspace auth tests.");
  admin = new Pool({
    connectionString: process.env.LOOPLABS_TEST_DATABASE_URL,
  });
  await admin.query(`CREATE SCHEMA ${schema}`);
  if (
    !(await admin.query("SELECT 1 FROM pg_roles WHERE rolname='ll_runtime'"))
      .rows[0]
  ) {
    await admin.query("CREATE ROLE ll_runtime");
    createdRuntimeRole = true;
  }
  db = new Pool({
    connectionString: process.env.LOOPLABS_TEST_DATABASE_URL,
    options: `-c search_path=${schema}`,
  });
  await db.query(await readFile("lib/durable/schema.sql", "utf8"));
  await db.query(await readFile("lib/workspace/schema.sql", "utf8"));
  await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ll_runtime`);
  await db.query("GRANT INSERT ON ll_tokens TO ll_runtime");
  await db.query("INSERT INTO ll_orgs(id) VALUES('local-proof'),('other')");
  await db.query("INSERT INTO ll_records(org_id) VALUES('local-proof')");
  await db.query(
    "INSERT INTO ll_members(email,org_id,name,password_hash) VALUES($1,'local-proof','Owner',$2),('disabled@example.com','local-proof','Disabled',$2)",
    [memberEmail, passwordHash(password)],
  );
  await db.query(
    "UPDATE ll_members SET active=false WHERE email='disabled@example.com'",
  );
  await db.query(
    "INSERT INTO ll_agents(org_id,id) VALUES('local-proof','existing-agent')",
  );
  await db.query(
    "INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'local-proof','existing-agent','agent')",
    [tokenHash(agentToken)],
  );
});
beforeEach(async () => {
  await db.query("DELETE FROM ll_sessions");
  await db.query("DELETE FROM ll_access_attempts");
  await db.query("UPDATE ll_members SET active=true WHERE email=$1", [
    memberEmail,
  ]);
});
afterAll(async () => {
  await db.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  if (createdRuntimeRole) await admin.query("DROP ROLE ll_runtime");
  await admin.end();
});
async function signed() {
  const token = await signIn(db, { email: memberEmail, password });
  return { token, actor: await authenticate(db, token) };
}
const proposal = (id: string) => ({
  id,
  name: "Offers agent",
  owner: memberEmail,
  role: "discount_agent",
  connector: "discount_record",
  actionLimit: 2,
});
const lead = {
  email: "buyer@example.com",
  name: "Buyer Example",
  company: "Example Company",
  companySize: "201–500",
  role: "VP Operations",
  workflow: "Review uncertain customer credits",
  website: "",
};
describe("workspace identity boundary", () => {
  it("stores password and session hashes and authenticates a named operator", async () => {
    const { token, actor } = await signed();
    expect(actor.subject).toBe(memberEmail);
    expect(actor.role).toBe("operator");
    const row = (await db.query("SELECT hash FROM ll_sessions")).rows[0];
    expect(row.hash).toBe(digest(token));
    expect(row.hash).not.toBe(token);
    expect(passwordMatches(password, passwordHash(password))).toBe(true);
    expect(passwordMatches("wrong", passwordHash(password))).toBe(false);
    expect(passwordMatches("x", "malformed")).toBe(false);
    expect(passwordMatches("x".repeat(257), passwordHash(password))).toBe(
      false,
    );
  });
  it("denies unknown, disabled, malformed and overlong sign-ins without role escalation", async () => {
    for (const email of ["unknown@example.com", "disabled@example.com"])
      await expect(signIn(db, { email, password })).rejects.toMatchObject({
        status: 401,
      });
    for (const v of [
      { email: memberEmail, password: "" },
      { email: 3, password },
      { email: memberEmail, password, role: "worker" },
      { email: memberEmail, password: "x".repeat(257) },
    ])
      await expect(signIn(db, v)).rejects.toMatchObject({ status: 400 });
    expect(
      (await db.query("SELECT count(*)::int n FROM ll_sessions")).rows[0].n,
    ).toBe(0);
  });
  it("persists rate limits for failed attempts and applies a global limit", async () => {
    for (let i = 0; i < 8; i++)
      await expect(
        signIn(db, { email: memberEmail, password: "wrong" }),
      ).rejects.toMatchObject({ status: 401 });
    await expect(
      signIn(db, { email: memberEmail, password }),
    ).rejects.toMatchObject({ status: 429 });
    await db.query(
      "UPDATE ll_access_attempts SET window_start=now()-interval '16 minutes'",
    );
    await signIn(db, { email: memberEmail, password });
    await db.query(
      "UPDATE ll_access_attempts SET count=120 WHERE key='login-global'",
    );
    await expect(
      signIn(db, { email: "another@example.com", password }),
    ).rejects.toMatchObject({ status: 429 });
  });
  it("rejects expired or revoked sessions and prevents cross-workspace authorization", async () => {
    const { token, actor } = await signed();
    expect(await memberSession(db, "malformed")).toBeNull();
    const c = await db.connect();
    try {
      await expect(
        authorize(c, { ...actor, orgId: "other" }, ["operator"]),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        authorize(c, { ...actor, role: "worker" }, ["worker"]),
      ).rejects.toMatchObject({ status: 403 });
    } finally {
      c.release();
    }
    await db.query(
      "UPDATE ll_sessions SET expires_at=now()-interval '1 second'",
    );
    await expect(authenticate(db, token)).rejects.toMatchObject({
      status: 401,
    });
    const fresh = await signed();
    await db.query("UPDATE ll_members SET active=false WHERE email=$1", [
      memberEmail,
    ]);
    expect(await memberSession(db, fresh.token)).toBeNull();
  });
  it("keeps named approval authority tied to an active member", async () => {
    const { actor } = await signed();
    const service = new DurableControl(db);
    const a = await service.propose(actor, {
      actionId: randomUUID(),
      agentId: "existing-agent",
      discount: 25,
      expectedVersion: 1,
    });
    expect(a.state).toBe("held");
    const approved = await service.review(actor, a.id, true, a.payload_hash);
    expect(approved.approved_by).toBe(memberEmail);
    await db.query("UPDATE ll_members SET active=false WHERE email=$1", [
      memberEmail,
    ]);
    await expect(service.execute(actor, a.id)).rejects.toMatchObject({
      status: 403,
    });
    await db.query(
      "UPDATE ll_members SET active=true WHERE email='disabled@example.com'",
    );
    try {
      const otherToken = await signIn(db, {
        email: "disabled@example.com",
        password,
      });
      const other = await authenticate(db, otherToken);
      expect((await service.execute(other, a.id)).state).toBe("cancelled");
      expect(
        (
          await db.query(
            "SELECT count(*)::int n FROM ll_effects WHERE action_id=$1",
            [a.id],
          )
        ).rows[0].n,
      ).toBe(0);
    } finally {
      await db.query(
        "UPDATE ll_members SET active=false WHERE email='disabled@example.com'",
      );
    }
  });
  it("issues secure same-site cookies, rejects foreign origins and invalidates logout", async () => {
    const r = await login(
      req("/api/workspace/session", { email: memberEmail, password }),
    );
    expect(r.status).toBe(200);
    const cookie = r.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=strict");
    expect(cookie).toContain("Path=/");
    const token = cookie.match(/looplabs_workspace_session=([^;]+)/)![1];
    expect(
      (await profile(req("/api/workspace/session", undefined, token))).status,
    ).toBe(200);
    expect((await profile(req("/api/workspace/session"))).status).toBe(401);
    expect(
      (
        await login(
          req(
            "/api/workspace/session",
            { email: memberEmail, password },
            undefined,
            "https://foreign.example",
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await login(
          req("/api/workspace/session", {
            email: memberEmail,
            password,
            role: "operator",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await logout(
          new NextRequest("https://looplabs.run/api/workspace/session", {
            method: "DELETE",
            headers: {
              origin: "https://looplabs.run",
              cookie: `${WORKSPACE_COOKIE}=${token}`,
            },
          }),
        )
      ).status,
    ).toBe(200);
    expect(await memberSession(db, token)).toBeNull();
    expect(
      (
        await logout(
          new NextRequest("https://looplabs.run/api/workspace/session", {
            method: "DELETE",
          }),
        )
      ).status,
    ).toBe(403);
  });
});
describe("agent provisioning boundary", () => {
  it("restricts database runtime provisioning to agent tokens", async () => {
    const c = await db.connect();
    try {
      await c.query("BEGIN");
      await c.query("SET LOCAL ROLE ll_runtime");
      await c.query(
        "INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'local-proof','existing-agent','agent')",
        [tokenHash(randomBytes(32).toString("base64url"))],
      );
      await expect(
        c.query(
          "INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'local-proof','escalated','operator')",
          [tokenHash(randomBytes(32).toString("base64url"))],
        ),
      ).rejects.toThrow("limited to agent keys");
    } finally {
      await c.query("ROLLBACK");
      c.release();
    }
    expect(
      (await db.query("SELECT 1 FROM ll_tokens WHERE subject='escalated'"))
        .rows,
    ).toHaveLength(0);
  });
  it("registers a scoped agent that can propose but cannot approve or execute", async () => {
    const { actor } = await signed();
    const id = `agent-${randomUUID()}`;
    const a = await registerAgent(db, actor, proposal(id));
    const machine = await authenticate(db, a.agentToken);
    expect(machine.role).toBe("agent");
    expect(machine.subject).toBe(id);
    const v = await new DurableControl(db).propose(machine, {
      actionId: randomUUID(),
      agentId: id,
      discount: 5,
      expectedVersion: 1,
    });
    expect(v.state).toBe("ready");
    await expect(
      new DurableControl(db).execute(machine, v.id),
    ).rejects.toMatchObject({ status: 403 });
    await expect(agentDirectory(db, machine)).rejects.toMatchObject({
      status: 403,
    });
    const list = await agentDirectory(db, actor);
    expect(list.agents.find((a) => a.id === id).owner).toBe(memberEmail);
    expect(JSON.stringify(list)).not.toContain(a.agentToken);
  });
  it("rejects unsupported connectors, roles, owners, spoofed fields and duplicate registrations", async () => {
    const { actor } = await signed();
    for (const change of [
      { connector: "live_stripe" },
      { role: "operator" },
      { id: "../escape" },
      { actionLimit: 0 },
      { actionLimit: 1001 },
      { name: "" },
      { owner: "x".repeat(255) },
      { tools: ["any"] },
    ])
      expect(() => parseAgent({ ...proposal("bad"), ...change })).toThrow(
        ControlError,
      );
    await expect(
      registerAgent(db, actor, {
        ...proposal("bad-owner"),
        owner: "someone@example.com",
      }),
    ).rejects.toMatchObject({ status: 400 });
    const id = `agent-${randomUUID()}`;
    await registerAgent(db, actor, proposal(id));
    await expect(registerAgent(db, actor, proposal(id))).rejects.toMatchObject({
      status: 409,
    });
    const other = { ...actor, orgId: "other" };
    await expect(
      registerAgent(db, other, proposal("foreign")),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("denies onboarding without connector evidence and enforces endpoint authorization", async () => {
    const { token, actor } = await signed();
    await db.query("DELETE FROM ll_records WHERE org_id='local-proof'");
    try {
      await expect(
        registerAgent(db, actor, proposal("missing-connector")),
      ).rejects.toMatchObject({ status: 409 });
    } finally {
      await db.query("INSERT INTO ll_records(org_id) VALUES('local-proof')");
    }
    expect(
      (await directory(req("/api/workspace/agents", undefined, token))).status,
    ).toBe(200);
    expect((await directory(req("/api/workspace/agents"))).status).toBe(401);
    const r = await onboard(
      req("/api/workspace/agents", proposal(`agent-${randomUUID()}`), token),
    );
    expect(r.status).toBe(200);
    expect(
      (await onboard(req("/api/workspace/agents", proposal("no-access"))))
        .status,
    ).toBe(401);
    expect(
      (
        await onboard(
          req(
            "/api/workspace/agents",
            proposal("foreign"),
            token,
            "https://foreign.example",
          ),
        )
      ).status,
    ).toBe(403);
  });
});
describe("sales intake and redirects", () => {
  it("validates bounded contact data and stores an inquiry without claiming email delivery", async () => {
    for (const change of [
      { email: "invalid" },
      { companySize: "unknown" },
      { name: "x" },
      { workflow: "tiny" },
      { website: "bot" },
      { secret: "unexpected" },
      { company: 3 },
    ])
      expect(() => parseSales({ ...lead, ...change })).toThrow(ControlError);
    await submitSales(db, lead);
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM ll_sales_requests WHERE email=$1",
          [lead.email],
        )
      ).rows[0].n,
    ).toBeGreaterThan(0);
    expect((await sales(req("/api/sales", lead))).status).toBe(200);
    expect(
      (
        await sales(
          req("/api/sales", lead, undefined, "https://foreign.example"),
        )
      ).status,
    ).toBe(403);
    expect((await sales(req("/api/sales", {}))).status).toBe(400);
    await db.query(
      "UPDATE ll_access_attempts SET count=10 WHERE key='sales-global'",
    );
    expect((await sales(req("/api/sales", lead))).status).toBe(429);
  });
  it("restricts sign-in return destinations to workspace routes", () => {
    expect(safeNext("/control-plane/agents")).toBe("/control-plane/agents");
    for (const v of [
      undefined,
      "https://foreign.example",
      "//foreign.example",
      "/control-plane/../api",
      "/api/durable",
      "/control-plane?next=evil",
    ])
      expect(safeNext(v)).toBe("/control-plane");
  });
});
