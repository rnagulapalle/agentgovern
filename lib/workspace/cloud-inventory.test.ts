import { expect, it, vi } from "vitest";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { CloudInventoryStore } from "./cloud-inventory";
import type { Actor } from "../durable/contracts";
import type { RuntimeInventoryScan } from "./cloud-discovery";
const tenant = "company-a", scope = { tenantId: tenant, connectionId: "aws-a", accountId: "123456789012", region: "us-west-2" };
const id = "service-1234567890", arn = `arn:aws:bedrock-agentcore:${scope.region}:${scope.accountId}:runtime/${id}`;
function scan(at = new Date().toISOString(), version = "1"): RuntimeInventoryScan {
  return { scope: { ...scope }, observedAt: at, completeness: "complete-api-traversal", failures: [], records: [{ scope: { ...scope }, source: "aws-agentcore-runtime", resourceId: id, resourceArn: arn, version, observedAt: at, roleReference: null, workloadIdentityReference: null, gaps: ["runtime-identity-unavailable", "effective-permissions-unknown", "declared-tools-unknown"], coverage: { ownership: "unmapped", activity: "unconnected", enforcement: "unverified" } }] };
}
async function fixture(run: (db: Pool, store: CloudInventoryStore, actor: Actor) => Promise<void>) {
  const url = process.env.LOOPLABS_TEST_DATABASE_URL;
  if (!url) throw new Error("Dedicated test PostgreSQL required; no skip.");
  const admin = new Pool({ connectionString: url }), schema = `inventory_${randomBytes(8).toString("hex")}`, epoch = randomUUID(); let db: Pool | undefined;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`); db = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    for (const file of ["lib/durable/schema.sql", "lib/workspace/schema.sql", "lib/durable/recovery-schema.sql", "lib/workspace/cloud-inventory-schema.sql"]) await db.query(await readFile(file, "utf8"));
    await db.query("INSERT INTO ll_orgs(id) VALUES($1),('company-b')", [tenant]);
    await db.query("INSERT INTO ll_workspace_recovery(org_id,epoch) VALUES($1,$2),('company-b',$2)", [tenant, epoch]);
    await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('owner@example.test',$1,'Owner','test'),('other@example.test','company-b','Other','test')", [tenant]);
    await db.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES('session-a','owner@example.test',now()+interval '1 hour'),('session-b','other@example.test',now()+interval '1 hour')");
    vi.stubEnv("LOOPLABS_RECOVERY_EPOCH", epoch);
    await run(db, new CloudInventoryStore(db), { orgId: tenant, subject: "owner@example.test", tokenHash: "session-a", role: "operator" });
  } finally { vi.unstubAllEnvs(); await db?.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
}
it("configuration and concurrent scan replays persist once, preserve exact evidence and grant no execution authority", async () => fixture(async (db, store, actor) => {
  expect(await store.configureConnection(actor, scope)).toMatchObject({ status: "configured", authorityGranted: false });
  await store.configureConnection(actor, scope); expect(await store.latest(actor, scope.connectionId)).toMatchObject({ status: "no-scan", enforcement: "unverified" });
  const value = scan(), key = randomUUID();
  value.records[0].roleReference = "arn:aws:iam::123456789012:role/runtime";
  value.records[0].workloadIdentityReference = "arn:aws:bedrock-agentcore:us-west-2:123456789012:workload-identity-directory/default/identity/service";
  value.records[0].gaps = ["effective-permissions-unknown", "declared-tools-unknown"];
  const results = await Promise.all([store.recordScan(actor, key, value), store.recordScan(actor, key, value)]);
  expect(results.map(r => r.repeated).sort()).toEqual([false, true]);
  const reordered = { ...value, records: [Object.fromEntries(Object.entries(value.records[0]).reverse())] };
  expect(await store.recordScan(actor, key, reordered as RuntimeInventoryScan)).toMatchObject({ repeated: true });
  const saved = await store.latest(actor, scope.connectionId);
  expect(saved).toMatchObject({ status: "observed", stale: false, records: [{ record: value.records[0], observedInCurrentScan: true }], enforcement: "unverified" });
  for (const table of ["ll_agents", "ll_tokens", "ll_actions"]) expect((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0);
  expect((await db.query("SELECT count(*)::int n FROM ll_cloud_scans")).rows[0].n).toBe(1);
  const changed = scan(value.observedAt, "2"); await expect(store.recordScan(actor, key, changed)).rejects.toThrow("replay changed");
  expect((await db.query("SELECT count(*)::int n FROM ll_cloud_runtime_observations")).rows[0].n).toBe(1);
}));
it("partial, empty and out-of-order scans retain all prior versions and expose stale/unknown evidence", async () => fixture(async (_db, store, actor) => {
  await store.configureConnection(actor, scope);
  const old = new Date(Date.now() - 2_000_000).toISOString(), next = new Date(Date.now() - 1_900_000).toISOString();
  await store.recordScan(actor, randomUUID(), scan(old)); await store.recordScan(actor, randomUUID(), scan(next, "2"));
  const empty = { ...scan(new Date(Date.now() - 1_800_000).toISOString()), records: [], completeness: "partial" as const, failures: ["list-unavailable" as const] };
  await store.recordScan(actor, randomUUID(), empty); await store.recordScan(actor, randomUUID(), scan(new Date(Date.now() - 3_000_000).toISOString(), "3"));
  const latest = await store.latest(actor, scope.connectionId); expect(latest).toMatchObject({ completeness: "partial", stale: true, failures: ["list-unavailable"] });
  expect(latest.records).toHaveLength(3); expect(latest.records.every(r => !r.observedInCurrentScan)).toBe(true);
  await store.recordScan(actor, randomUUID(), { ...scan(), records: [] });
  expect((await store.latest(actor, scope.connectionId)).records).toHaveLength(3);
}));
it("current identity, recovery and tenant checks refuse revoked, expired, forged and cross-company callers", async () => fixture(async (db, store, actor) => {
  await store.configureConnection(actor, scope); const value = scan();
  for (const changed of [{ ...actor, role: "agent" as const }, { ...actor, tokenHash: "unknown" }, { ...actor, subject: "other@example.test" }]) {
    await expect(store.recordScan(changed, randomUUID(), value)).rejects.toThrow("member required"); await expect(store.latest(changed, scope.connectionId)).rejects.toThrow("member required");
  }
  const other: Actor = { orgId: "company-b", subject: "other@example.test", tokenHash: "session-b", role: "operator" };
  await expect(store.latest(other, scope.connectionId)).rejects.toThrow("unavailable"); await expect(store.configureConnection(other, scope)).rejects.toThrow("tenant differs");
  await expect(store.recordScan(actor, randomUUID(), { ...value, scope: { ...scope, tenantId: "company-b" }, records: [] })).rejects.toThrow("scope or observation");
  await db.query("UPDATE ll_sessions SET expires_at=now()-interval '1 second' WHERE hash='session-a'"); await expect(store.recordScan(actor, randomUUID(), value)).rejects.toThrow("member required");
  await db.query("UPDATE ll_sessions SET expires_at=now()+interval '1 hour' WHERE hash='session-a'"); await db.query("UPDATE ll_members SET active=false WHERE email='owner@example.test'"); await expect(store.latest(actor, scope.connectionId)).rejects.toThrow("member required");
  await db.query("UPDATE ll_members SET active=true WHERE email='owner@example.test'"); vi.stubEnv("LOOPLABS_RECOVERY_EPOCH", randomUUID()); await expect(store.latest(actor, scope.connectionId)).rejects.toThrow("contained");
  expect((await db.query("SELECT count(*)::int n FROM ll_cloud_scans")).rows[0].n).toBe(0);
}));
it("rejects malformed/raw/authority-bearing evidence, scope changes, duplicate records and future time before persistence", async () => fixture(async (db, store, actor) => {
  await store.configureConnection(actor, scope); const value = scan();
  await expect(store.configureConnection(actor, { ...scope, accountId: "999999999999" })).rejects.toThrow("immutable");
  await expect(store.recordScan(actor, "bad", value)).rejects.toThrow("Stable");
  const malformed = [{ ...value, raw: "secret" }, { ...value, records: [...value.records, ...value.records] }, { ...value, records: [{ ...value.records[0], raw: "secret" }] }, { ...value, failures: ["unknown"] }, { ...value, failures: ["list-unavailable"] }, { ...value, records: [{ ...value.records[0], coverage: { ownership: "mapped", activity: "connected", enforcement: "verified" } }] }, { ...value, records: [{ ...value.records[0], observedAt: new Date(0).toISOString() }] }, { ...value, observedAt: new Date(Date.now() + 600_000).toISOString(), records: [] }, { ...value, scope: { ...scope, accountId: "999999999999" }, records: [] }, { ...value, records: Array(2001).fill(value.records[0]) }, { ...value, failures: Array(2021).fill("invalid-page") }];
  for (const bad of malformed) await expect(store.recordScan(actor, randomUUID(), bad as RuntimeInventoryScan)).rejects.toThrow();
  expect((await db.query("SELECT count(*)::int n FROM ll_cloud_scans")).rows[0].n).toBe(0);
}));
it("actual PostgreSQL refuses immutable-history mutation, cross-account resource substitution and wrong-tenant ownership", async () => fixture(async (db, store, actor) => {
  await store.configureConnection(actor, scope); const key = randomUUID(); await store.recordScan(actor, key, scan());
  for (const table of ["ll_cloud_connections", "ll_cloud_scans", "ll_cloud_runtime_observations"]) {
    await expect(db.query(`DELETE FROM ${table}`)).rejects.toMatchObject({ code: "23514" });
    await expect(db.query(`UPDATE ${table} SET org_id=org_id`)).rejects.toMatchObject({ code: "23514" });
  }
  await expect(db.query("INSERT INTO ll_cloud_connections(org_id,id,account_id,region,created_by) VALUES('company-b','wrong','123456789012','us-west-2','owner@example.test')")).rejects.toMatchObject({ code: "23514" });
  for (const [resource, role, workload] of [[arn.replace("123456789012", "999999999999"), null, null], [arn, "arn:aws:iam::999999999999:role/runtime", null], [arn, null, "arn:aws:bedrock-agentcore:us-east-1:123456789012:workload-identity-directory/default/identity/x"]])
    await expect(db.query("INSERT INTO ll_cloud_runtime_observations(org_id,connection_id,scan_id,resource_id,resource_arn,version,role_reference,workload_identity_reference) VALUES($1,$2,$3,$4,$5,'2',$6,$7)", [tenant, scope.connectionId, key, id, resource, role, workload])).rejects.toMatchObject({ code: "23514" });
  expect((await db.query("SELECT count(*)::int n FROM ll_cloud_runtime_observations")).rows[0].n).toBe(1);
}));
it("fresh database connection reads persisted version history without credential storage or new execution authority", async () => fixture(async (db, store, actor) => {
  await store.configureConnection(actor, scope); const key = randomUUID(); await store.recordScan(actor, key, scan());
  const connectionString = process.env.LOOPLABS_TEST_DATABASE_URL!, schema = (await db.query("SELECT current_schema() AS schema")).rows[0].schema;
  const fresh = new Pool({ connectionString, options: `-c search_path=${schema}` });
  try { expect(await new CloudInventoryStore(fresh).latest(actor, scope.connectionId)).toMatchObject({ scanId: key, records: [{ observedInCurrentScan: true }], enforcement: "unverified" }); }
  finally { await fresh.end(); }
  const columns = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name LIKE 'll_cloud_%'", [schema])).rows.map(r => r.column_name);
  expect(columns).not.toContain("credentials"); expect(columns).not.toContain("token"); expect(columns).not.toContain("raw_response");
}));

it("restricted PostgreSQL role cannot rewrite, remove or truncate discovery history", async () => fixture(async (db, store, actor) => {
  await store.configureConnection(actor, scope); const key = randomUUID(); await store.recordScan(actor, key, scan());
  const role = `inventory_reader_${randomBytes(8).toString("hex")}`, schema = (await db.query("SELECT current_schema() AS schema")).rows[0].schema;
  await db.query(`CREATE ROLE ${role} NOLOGIN`); const c = await db.connect();
  try {
    await c.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
    await c.query(`GRANT SELECT,INSERT ON ll_cloud_connections,ll_cloud_scans,ll_cloud_runtime_observations TO ${role}`);
    await c.query(`SET ROLE ${role}`);
    for (const table of ["ll_cloud_connections", "ll_cloud_scans", "ll_cloud_runtime_observations"]) {
      expect((await c.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(1);
      for (const sql of [`UPDATE ${table} SET org_id=org_id`, `DELETE FROM ${table}`, `TRUNCATE ${table}`])
        await expect(c.query(sql)).rejects.toMatchObject({ code: "42501" });
    }
  } finally { await c.query("RESET ROLE"); c.release(); await db.query(`DROP OWNED BY ${role}`); await db.query(`DROP ROLE ${role}`); }
}));

it("bounded inventory view explicitly reports truncation while database history remains preserved", async () => fixture(async (db, store, actor) => {
  await store.configureConnection(actor, scope); const key = randomUUID(); await store.recordScan(actor, key, { ...scan(), records: [] });
  await db.query("INSERT INTO ll_cloud_runtime_observations(org_id,connection_id,scan_id,resource_id,resource_arn,version) SELECT $1,$2,$3,'service_'||i||'-1234567890','arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/service_'||i||'-1234567890','1' FROM generate_series(1,2001) i", [tenant, scope.connectionId, key]);
  const latest = await store.latest(actor, scope.connectionId); expect(latest).toMatchObject({ historyTruncated: true, enforcement: "unverified" }); expect(latest.records).toHaveLength(2000);
  expect((await db.query("SELECT count(*)::int n FROM ll_cloud_runtime_observations")).rows[0].n).toBe(2001);
}));

it("lists only current member's tenant scopes and reports the connection view limit", async () => fixture(async (db, store, actor) => {
  expect(await store.connections(actor)).toMatchObject({ connections: [], truncated: false, scanningAvailable: false, enforcement: "unverified" });
  await store.configureConnection(actor, scope);
  const other: Actor = { orgId: "company-b", subject: "other@example.test", tokenHash: "session-b", role: "operator" };
  await store.configureConnection(other, { ...scope, tenantId: "company-b", connectionId: "private-b" });
  expect((await store.connections(actor)).connections.map(c => c.scope.connectionId)).toEqual([scope.connectionId]);
  await expect(store.connections({ ...actor, tokenHash: "unknown" })).rejects.toThrow("member required");
  await db.query("INSERT INTO ll_cloud_connections(org_id,id,account_id,region,created_by) SELECT $1,'scope-'||i,'123456789012','us-west-2','owner@example.test' FROM generate_series(1,100) i", [tenant]);
  const bounded = await store.connections(actor); expect(bounded.truncated).toBe(true); expect(bounded.connections).toHaveLength(100);
  expect((await db.query("SELECT count(*)::int n FROM ll_cloud_connections WHERE org_id=$1", [tenant])).rows[0].n).toBe(101);
  await db.query("UPDATE ll_members SET active=false WHERE email='owner@example.test'"); await expect(store.connections(actor)).rejects.toThrow("member required");
}));
it("scan admission rechecks identity and commits the shared per-connection throttle without holding a network lock", async () => fixture(async (db, store, actor) => {
  await store.configureConnection(actor, scope);
  for (let i = 0; i < 3; i++) expect(await store.beginScan(actor, scope.connectionId)).toEqual({ scope, allowed: true });
  expect(await store.beginScan(actor, scope.connectionId)).toEqual({ scope, allowed: false });
  expect(await store.beginScan(actor, scope.connectionId)).toEqual({ scope, allowed: false });
  expect((await db.query("SELECT count FROM ll_access_attempts WHERE key=$1", [`cloud-discovery:${tenant}:${scope.connectionId}`])).rows[0].count).toBe(5);
  await db.query("UPDATE ll_members SET active=false WHERE email='owner@example.test'"); await expect(store.beginScan(actor, scope.connectionId)).rejects.toThrow("member required");
}));
