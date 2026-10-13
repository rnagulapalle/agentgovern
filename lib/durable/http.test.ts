import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { body, browserOrigin, credential, failure, sameOrigin } from "./http";
import { ControlError } from "./contracts";
import { database } from "./database";
import { Pool } from "pg";
import { assertTenantPool } from "./tenant-pool";
import { tenantContext } from "../workspace/tenant-context";

const request = (headers: Record<string, string> = {}, content = "{}") =>
  new NextRequest("https://looplabs.run/api/durable", {
    method: "POST",
    headers,
    body: content,
  });
afterEach(() => vi.unstubAllEnvs());
describe("Durable HTTP boundary", () => {
  it("permits only the explicit canonical HTTPS staging origin and ignores forged proxy headers", () => {
    const staging = "https://staging.example.test:8443";
    const proxy = (origin: string) => new NextRequest("http://0.0.0.0:3000/api/workspace/session", {
      headers: { origin, "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" },
    });
    vi.stubEnv("LOOPLABS_DURABLE_ORIGIN", staging);
    vi.stubEnv("LOOPLABS_TEMPORAL_WORKSPACE", "production");
    expect(() => browserOrigin(proxy(staging))).toThrow("not configured correctly");
    vi.stubEnv("LOOPLABS_TEMPORAL_WORKSPACE", "staging");
    expect(browserOrigin(proxy(staging))).toBe(staging);
    expect(() => sameOrigin(proxy(staging), true)).not.toThrow();
    for (const origin of ["https://looplabs.run", "https://evil.example", "http://0.0.0.0:3000", "https://staging.example.test", staging + ".evil"])
      expect(() => sameOrigin(proxy(origin), true)).toThrow("Same-origin");
    for (const bad of ["http://staging.example.test", "https://user:secret@staging.example.test", "https://staging.example.test/", "https://staging.example.test/path", "https://staging.example.test?q=1", "https://staging.example.test#fragment", "https://STAGING.example.test", "not-a-url"]){
      vi.stubEnv("LOOPLABS_DURABLE_ORIGIN", bad);
      expect(() => browserOrigin(proxy(staging))).toThrow("not configured correctly");
    }
  });
  it("uses the configured public origin behind TLS proxies without trusting forwarded headers", () => {
    vi.stubEnv("LOOPLABS_DURABLE_ORIGIN", "https://looplabs.run");
    const proxy = (origin: string) => new NextRequest("http://0.0.0.0:3000/api/durable/session", {
      headers: { origin, "x-forwarded-host": "evil.example", "x-forwarded-proto": "http" },
    });
    expect(browserOrigin(proxy("https://looplabs.run"))).toBe("https://looplabs.run");
    expect(() => sameOrigin(proxy("https://looplabs.run"), true)).not.toThrow();
    expect(() => sameOrigin(proxy("https://evil.example"), true)).toThrow("Same-origin");
    expect(() => sameOrigin(proxy("http://0.0.0.0:3000"), true)).toThrow("Same-origin");
    for (const bad of ["https://evil.example", "https://looplabs.run/path", "not-a-url"]) {
      vi.stubEnv("LOOPLABS_DURABLE_ORIGIN", bad);
      expect(() => browserOrigin(proxy("https://looplabs.run"))).toThrow("not configured correctly");
    }
  });
  it("accepts same-origin operations and bearer workers, but rejects cross-site cookie requests", () => {
    expect(() =>
      sameOrigin(request({ origin: "https://looplabs.run" })),
    ).not.toThrow();
    expect(() =>
      sameOrigin(request({ authorization: "Bearer token" })),
    ).not.toThrow();
    expect(() => sameOrigin(request())).toThrow("Same-origin");
    expect(() =>
      sameOrigin(
        request({
          origin: "https://evil.example",
          authorization: "Bearer token",
        }),
      ),
    ).toThrow("Same-origin");
    expect(() =>
      sameOrigin(request({ authorization: "Bearer token" }), true),
    ).toThrow("Same-origin");
  });
  it("extracts credentials without allowing a malformed bearer to bypass authentication", () => {
    expect(credential(request())).toBe("");
    expect(
      credential(request({ cookie: "looplabs_durable_session=cookie" })),
    ).toBe("cookie");
    expect(
      credential(
        request({
          authorization: "Bearer header",
          cookie: "looplabs_durable_session=cookie",
        }),
      ),
    ).toBe("header");
    expect(credential(request({ authorization: "Basic malformed" }))).toBe("");
  });
  it("bounds and validates request bodies including streaming bodies", async () => {
    await expect(body(request())).rejects.toMatchObject({ status: 415 });
    await expect(
      body(request({ "content-type": "application/json" }, "bad")),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      body(request({ "content-type": "application/json" }, "[]")),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      body(request({ "content-type": "application/json" }, "null")),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      body(request({ "content-type": "application/json" }, "x".repeat(9000))),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      body(
        new NextRequest("https://looplabs.run/api/durable", {
          method: "POST",
          headers: { "content-type": "application/json" },
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      await body(
        request(
          { "content-type": "application/json" },
          '{"operation":"propose"}',
        ),
      ),
    ).toEqual({ operation: "propose" });
  });
  it("returns safe failures and disables caching", async () => {
    const specific = failure(new ControlError(409, "Conflict"));
    expect(specific.status).toBe(409);
    expect(specific.headers.get("cache-control")).toBe("no-store");
    const unsafe = failure(new Error("postgres secret URI"));
    expect(unsafe.status).toBe(503);
    expect(await unsafe.text()).not.toContain("secret URI");
  });
  it("refuses singleton access whether database environment is absent or supplied", async () => {
    for (const configured of [undefined, "postgresql://unregistered:private-fixture@127.0.0.1:1/never_connect"]) {
      vi.stubEnv("LOOPLABS_DATABASE_URL", configured);
      vi.stubEnv("LOOPLABS_RECOVERY_EPOCH", "11111111-1111-4111-8111-111111111111");
      vi.stubEnv("LOOPLABS_TEMPORAL_ORG", "forged-workspace");
      expect(() => database()).toThrow("Authenticated scoped database context required");
      try {
        database();
      } catch (error) {
        expect(error).toBeInstanceOf(ControlError);
        const response = failure(error);
        expect(response.status).toBe(503);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.text()).not.toContain("private-fixture");
      }
      expect(() => tenantContext()).toThrow("Tenant context unavailable");
    }
  });
  it("refuses a real but unregistered pool before SQL instead of adopting caller workspace identity", async () => {
    const pool = new Pool({ connectionString: "postgresql://unregistered:private-fixture@127.0.0.1:1/never_connect" });
    const query = vi.spyOn(pool, "query");
    try {
      for (const org of [undefined, "forged-workspace", "another-workspace"])
        await expect(assertTenantPool(pool, org)).rejects.toMatchObject({
          status: 403,
          message: "Scoped database context required.",
        });
      expect(query).not.toHaveBeenCalled();
    } finally {
      query.mockRestore();
      await pool.end();
    }
  });
});
