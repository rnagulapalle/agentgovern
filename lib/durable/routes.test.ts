import { randomBytes, randomUUID } from "node:crypto";
import { createInstalledTenantFixture } from "../workspace/installed-tenant-fixture";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { tokenHash } from "./service";

let fixture: Awaited<ReturnType<typeof createInstalledTenantFixture>>;
const tokens = {
  operator: randomBytes(32).toString("base64url"),
  agent: randomBytes(32).toString("base64url"),
  worker: randomBytes(32).toString("base64url"),
};
vi.mock("../workspace/tenant-context", async original => ({...(await original<typeof import("../workspace/tenant-context")>()),tenantContext:()=>fixture.context}));
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
      ...(role === "operator" ? {cookie:`looplabs_workspace_session=${tokens[role]}`} : {authorization:`Bearer ${tokens[role]}`}),
      origin,
      "content-type": "application/json",
    },
    body: JSON.stringify(value),
  });
beforeAll(async()=>{fixture=await createInstalledTenantFixture({tenants:['http','foreign'],salesOrg:'http',seed:async owner=>{
 await owner.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('operator@test.example','http','Operator','fixture'),('second@test.example','http','Reviewer','fixture')");
 for(const[role,token]of Object.entries(tokens)){if(role==='operator'||role==='second')await owner.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES($1,$2,now()+interval '1 hour')",[tokenHash(token),role+'@test.example']);else await owner.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'http',$2,$3)",[tokenHash(token),role==='agent'?'http-agent':role,role]);}
 await owner.query("INSERT INTO ll_agents(org_id,id,tools) VALUES('http','http-agent',ARRAY['proof.discount'])");await owner.query("INSERT INTO ll_records(org_id) VALUES('http')");}});},20000);
 afterAll(async()=>fixture?.close());
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
  it("issues Secure sessions through the internal HTTP reverse proxy and rejects spoofed origins", async () => {
    vi.stubEnv("LOOPLABS_DURABLE_ORIGIN", "https://looplabs.run");
    try {
      const proxy = (origin: string) => new NextRequest("http://0.0.0.0:3000/api/durable/session", {
        method: "POST", headers: { origin, "content-type": "application/json", "x-forwarded-host": "evil.example" },
        body: JSON.stringify({ token: tokens.operator }),
      });
      const result = await login(proxy("https://looplabs.run"));
      expect(result.status).toBe(200);
      expect(result.headers.get("set-cookie")).toContain("Secure");
      expect(result.headers.get("set-cookie")).toContain("HttpOnly");
      expect((await login(proxy("https://evil.example"))).status).toBe(403);
    } finally { vi.unstubAllEnvs(); }
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
