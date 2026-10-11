import { expect, test, vi } from "vitest";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { googleProjectDiscoveryBinding } from "./cloud-google-binding";
const scope = { provider: "google-agent-engine" as const, tenantId: "company-a", connectionId: "google-a", projectId: "company-agents", projectNumber: "123456789012", location: "us-central1" };
const at = Date.now(), session = () => ({ token: "DUMMY_READ_TOKEN_123456789", expiresAt: new Date(at + 600000).toISOString() });
const value = () => ({ scope: { ...scope }, session: session() });
async function fixture(run: (path: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "ll-google-binding-")), path = join(dir, "binding.json");
  try { await writeFile(path, JSON.stringify(value()), { mode: 0o600 }); await run(path); }
  finally { await rm(dir, { recursive: true, force: true }); }
}
test("explicit Google binding rotates credentials and verifies native project identity before each fixed GET", async () => fixture(async path => {
  const tokens: string[] = [], urls: string[] = [];
  const fetcher = vi.fn(async (url: unknown, init: RequestInit | undefined) => {
    urls.push(String(url)); tokens.push((init?.headers as Record<string, string>).Authorization);
    return new Response(JSON.stringify(String(url).includes('cloudresourcemanager') ? { name: `projects/${scope.projectNumber}`, projectId: scope.projectId, state: "ACTIVE" } : { reasoningEngines: [] }), { headers: { "content-type": "application/json" } });
  });
  const api = await googleProjectDiscoveryBinding(scope, path, { now: () => at, fetch: fetcher });
  expect(fetcher).not.toHaveBeenCalled();
  const rotated = value(); rotated.session.token = "DUMMY_ROTATED_TOKEN_123456789"; await writeFile(path, JSON.stringify(rotated));
  await api.list({ parent: `projects/${scope.projectNumber}/locations/${scope.location}/reasoningEngines`, limit: 100 });
  expect(urls).toEqual([`https://cloudresourcemanager.googleapis.com/v3/projects/${scope.projectNumber}`, `https://us-central1-aiplatform.googleapis.com/v1/projects/${scope.projectNumber}/locations/us-central1/reasoningEngines?pageSize=100`]);
  expect(tokens).toEqual([`Bearer ${rotated.session.token}`, `Bearer ${rotated.session.token}`]);
}));
test("missing, unsafe, malformed, foreign, expired and overlong bindings refuse without requests or secret errors", async () => fixture(async path => {
  const fetcher = vi.fn(), opts = { now: () => at, fetch: fetcher };
  await expect(googleProjectDiscoveryBinding(scope, path + '.missing', opts)).rejects.toThrow(/^Reviewed Google discovery access is unavailable\.$/);
  await chmod(path, 0o644); await expect(googleProjectDiscoveryBinding(scope, path, opts)).rejects.toThrow('unavailable'); await chmod(path, 0o600);
  for (const v of [null, [], { ...value(), secret: "DUMMY_SECRET" }, { ...value(), scope: { ...scope, tenantId: "foreign" } }, { ...value(), scope: { ...scope, projectNumber: "999999999999" } }, { ...value(), session: { ...session(), token: "DUMMY_SECRET\r\nInjected" } }, { ...value(), session: { ...session(), expiresAt: new Date(at - 1).toISOString() } }, { ...value(), session: { ...session(), expiresAt: new Date(at + 3600001).toISOString() } }]) {
    await writeFile(path, JSON.stringify(v)); await expect(googleProjectDiscoveryBinding(scope, path, opts)).rejects.toThrow(/^Reviewed Google discovery access is unavailable\.$/);
  }
  expect(fetcher).not.toHaveBeenCalled();
}));
test("changed scope or expired credentials after creation stop before cloud contact; native identity mismatch prevents inventory GET", async () => fixture(async path => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ name: `projects/${scope.projectNumber}`, projectId: "foreign-project", state: "ACTIVE" }), { headers: { "content-type": "application/json" } }));
  for (const changed of [{ ...value(), scope: { ...scope, connectionId: "changed" } }, { ...value(), session: { ...session(), expiresAt: new Date(at - 1).toISOString() } }]) {
    await writeFile(path, JSON.stringify(value())); const api = await googleProjectDiscoveryBinding(scope, path, { now: () => at, fetch: fetcher });
    await writeFile(path, JSON.stringify(changed)); await expect(api.scopeIdentity()).rejects.toThrow(/^Verified read-only project access unavailable$/);
  }
  expect(fetcher).not.toHaveBeenCalled();
  await writeFile(path, JSON.stringify(value())); const api = await googleProjectDiscoveryBinding(scope, path, { now: () => at, fetch: fetcher });
  await expect(api.list({ parent: `projects/${scope.projectNumber}/locations/${scope.location}/reasoningEngines`, limit: 100 })).rejects.toThrow('unavailable'); expect(fetcher).toHaveBeenCalledTimes(1);
}));
