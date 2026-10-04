import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { body, credential, failure, sameOrigin } from "./http";
import { ControlError } from "./contracts";
import { database } from "./database";

const request = (headers: Record<string, string> = {}, content = "{}") =>
  new NextRequest("https://looplabs.run/api/durable", {
    method: "POST",
    headers,
    body: content,
  });
describe("Durable HTTP boundary", () => {
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
  it("fails closed without database configuration and reuses the server pool", async () => {
    const original = process.env.LOOPLABS_DATABASE_URL;
    try {
      delete process.env.LOOPLABS_DATABASE_URL;
      expect(() => database()).toThrow("not configured");
      process.env.LOOPLABS_DATABASE_URL =
        process.env.LOOPLABS_TEST_DATABASE_URL;
      const pool = database();
      expect(database()).toBe(pool);
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        expect(
          pool.emit("error", new Error("private database connection")),
        ).toBe(true);
        expect(log).toHaveBeenCalledWith(
          "Durable database idle connection failed. New requests will reconnect.",
        );
      } finally {
        log.mockRestore();
      }
      await pool.end();
    } finally {
      if (original) process.env.LOOPLABS_DATABASE_URL = original;
      else delete process.env.LOOPLABS_DATABASE_URL;
    }
  });
});
