import { expect, it, vi } from "vitest";
import { mkdtemp, writeFile, chmod, symlink, link, rm, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const child = vi.hoisted(() => ({ calls: 0 }));
vi.mock("node:child_process", async original => ({ ...await original<object>(), execFile: (_path: string, _args: unknown, _options: unknown, callback: (error: null, out: string) => void) => { child.calls++; callback(null, JSON.stringify({ Account: "123456789012" })); } }));
import { cloudDiscoveryBinding, cloudObservationBinding } from "./cloud-binding";
const scope = { tenantId: "company-a", connectionId: "aws-a", accountId: "123456789012", region: "us-west-2" };
const now = Date.now();
const value = () => ({ scope: { ...scope }, executable: "/usr/bin/false", session: { accessKeyId: `ASIA${"A".repeat(16)}`, secretAccessKey: "b".repeat(40), sessionToken: "c".repeat(40), expiresAt: new Date(now + 600000).toISOString() } });
async function fixture(run: (path: string, dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "ll-discovery-binding-")), path = join(dir, "binding.json");
  try { await writeFile(path, JSON.stringify(value()), { mode: 0o600 }); child.calls = 0; await run(path, dir); }
  finally { await rm(dir, { recursive: true, force: true }); }
}
it("matching private binding creates only fixed read transport and rereads rotated short-lived sessions", async () => fixture(async path => {
  const api = await cloudDiscoveryBinding(scope, path, () => now); expect(child.calls).toBe(0);
  const rotated = value(); rotated.session.sessionToken = "d".repeat(40); await writeFile(path, JSON.stringify(rotated));
  expect(await api.callerIdentity()).toEqual({ Account: scope.accountId }); expect(child.calls).toBe(1);
}));
it("missing, broad-readable, linked, oversized, malformed and foreign-scope bindings refuse without cloud requests", async () => fixture(async (path, dir) => {
  for (const missing of [join(dir, "missing"), "relative.json", `${dir}/../binding.json`]) await expect(cloudDiscoveryBinding(scope, missing, () => now)).rejects.toThrow("access is unavailable");
  await chmod(path, 0o640); await expect(cloudDiscoveryBinding(scope, path, () => now)).rejects.toThrow("access is unavailable"); await chmod(path, 0o600);
  const sym = join(dir, "symlink"); await symlink(path, sym); await expect(cloudDiscoveryBinding(scope, sym, () => now)).rejects.toThrow("access is unavailable");
  const fifo = join(dir, "fifo");
  const actualChild = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  await new Promise<void>((resolve, reject) => actualChild.execFile("mkfifo", [fifo], { timeout: 1000 }, error => error ? reject(error) : resolve()));
  expect((await lstat(fifo)).isFIFO()).toBe(true);
  await chmod(fifo, 0o600); await expect(cloudDiscoveryBinding(scope, fifo, () => now)).rejects.toThrow("access is unavailable");
  const hard = join(dir, "hardlink"); await link(path, hard); await expect(cloudDiscoveryBinding(scope, path, () => now)).rejects.toThrow("access is unavailable"); await rm(hard);
  const bad = ["null", "[]", '"not-a-binding"', "x".repeat(65537), "broken", JSON.stringify({ ...value(), raw: "private" }), JSON.stringify({ ...value(), scope: { ...scope, tenantId: "company-b" } }), JSON.stringify({ ...value(), executable: "relative" }), JSON.stringify({ ...value(), session: { ...value().session, expiresAt: new Date(now - 1).toISOString() } })];
  for (const input of bad) { await writeFile(path, input); await expect(cloudDiscoveryBinding(scope, path, () => now)).rejects.toThrow(); }
  expect(child.calls).toBe(0);
}));
it("scope or executable changes and credential expiry after binding creation stop before spawning a child", async () => fixture(async path => {
  for (const changed of [{ ...value(), scope: { ...scope, accountId: "999999999999" } }, { ...value(), executable: "/usr/bin/true" }, { ...value(), session: { ...value().session, expiresAt: new Date(now - 1).toISOString() } }]) {
    await writeFile(path, JSON.stringify(value())); const api = await cloudDiscoveryBinding(scope, path, () => now);
    await writeFile(path, JSON.stringify(changed)); await expect(api.callerIdentity()).rejects.toThrow("credentials unavailable");
  }
  expect(child.calls).toBe(0);
}));

it("observation reuses private scoped session binding and refuses scope drift before a log read", async () => fixture(async path => {
  const api = await cloudObservationBinding(scope, path, () => now);
  expect(child.calls).toBe(0);
  expect(await api.callerIdentity()).toEqual({ Account: scope.accountId });
  const changed = value(); changed.scope.connectionId = "foreign";
  await writeFile(path, JSON.stringify(changed));
  await expect(api.listEvents({ logGroupName: "/aws/bedrock-agentcore/runtimes/pilot-DEFAULT", startTime: 1, endTime: 2, limit: 100 })).rejects.toThrow("credentials unavailable");
  expect(child.calls).toBe(1);
}));
it("observation refuses broad-readable bindings and untrusted executable without cloud access", async () => fixture(async path => {
  await chmod(path, 0o644);
  await expect(cloudObservationBinding(scope, path, () => now)).rejects.toThrow("access is unavailable");
  await chmod(path, 0o600);
  await writeFile(path, JSON.stringify({ ...value(), executable: "ambient-aws" }));
  await expect(cloudObservationBinding(scope, path, () => now)).rejects.toThrow("transport is unavailable");
  expect(child.calls).toBe(0);
}));
