import { expect, it, vi } from "vitest";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { CloudInventoryStore } from "./cloud-inventory";
import { canonicalProjectScan } from "./cloud-project-evidence";
import type { Actor } from "../durable/contracts";
import type { ProjectDiscoveryScope, ProjectInventoryScan } from "./cloud-project-discovery";
const google = { provider: "google-agent-engine", tenantId: "company-a", connectionId: "google", projectId: "company-agents", projectNumber: "123456789012", location: "us-central1" } as const;
const azure = { provider: "azure-foundry", tenantId: "company-a", connectionId: "azure", directoryId: "12345678-1234-1234-1234-123456789012", endpoint: "https://company.services.ai.azure.com/api/projects/ops" } as const;
function scan(scope: ProjectDiscoveryScope = google, at = new Date().toISOString(), version = "1"): ProjectInventoryScan {
  return { scope, observedAt: at, completeness: "complete-api-traversal", failures: [], records: [{ scope, observedAt: at,
    resource: scope.provider === "azure-foundry" ? `${scope.endpoint}/agents/ops/versions/${version}` : `projects/${scope.projectNumber}/locations/${scope.location}/reasoningEngines/1234`,
    version: scope.provider === "azure-foundry" ? version : null, identityKind: "unknown", identityReference: null,
    gaps: ["workload-principal-unresolved", ...(scope.provider === "google-agent-engine" ? ["execution-version-unresolved"] : []), "effective-permissions-unknown", "declared-tools-unknown"], coverage: { ownership: "unmapped", activity: "unconnected", enforcement: "unverified" } }] };
}
async function fixture(run: (db: Pool, store: CloudInventoryStore, actor: Actor, reconnect: () => Pool) => Promise<void>) {
  const url = process.env.LOOPLABS_TEST_DATABASE_URL;
  if (!url) throw Error("Dedicated test PostgreSQL required; no skip.");
  const admin = new Pool({ connectionString: url }), schema = `project_inventory_${randomBytes(8).toString("hex")}`, epoch = randomUUID(); let db: Pool | undefined;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const reconnect = () => new Pool({ connectionString: url, options: `-c search_path=${schema}` }); db = reconnect();
    for (const file of ["lib/durable/schema.sql", "lib/workspace/schema.sql", "lib/durable/recovery-schema.sql", "lib/workspace/cloud-inventory-schema.sql", "lib/workspace/cloud-project-schema.sql"]) await db.query(await readFile(file, "utf8"));
    await db.query("INSERT INTO ll_orgs(id) VALUES('company-a'),('company-b')");
    await db.query("INSERT INTO ll_workspace_recovery(org_id,epoch) VALUES('company-a',$1),('company-b',$1)", [epoch]);
    await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('owner@example.test','company-a','Owner','test'),('other@example.test','company-b','Other','test')");
    await db.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES('session-a','owner@example.test',now()+interval '1 hour'),('session-b','other@example.test',now()+interval '1 hour')");
    vi.stubEnv("LOOPLABS_RECOVERY_EPOCH", epoch);
    await run(db, new CloudInventoryStore(db), { orgId: "company-a", subject: "owner@example.test", tokenHash: "session-a", role: "operator" }, reconnect);
  } finally { vi.unstubAllEnvs(); await db?.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
}
it("Azure and Google scans persist concurrently once, refuse changed replay and survive a fresh database client without granting authority", async () => fixture(async (db, store, actor, reconnect) => {
  for (const scope of [azure, google]) {
    await store.configureProjectConnection(actor, scope); await store.configureProjectConnection(actor, scope);
    expect(await store.latestProject(actor, scope.connectionId)).toMatchObject({ status: "no-scan" });
    const value = scan(scope), id = randomUUID();
    const r = await Promise.all([store.recordProjectScan(actor, id, value), store.recordProjectScan(actor, id, value)]);
    expect(r.map(x => x.repeated).sort()).toEqual([false, true]);
    const reordered = { ...value, records: [{ ...value.records[0], coverage: { enforcement: "unverified", activity: "unconnected", ownership: "unmapped" } }] } as ProjectInventoryScan;
    expect(await store.recordProjectScan(actor, id, reordered)).toMatchObject({ repeated: true });
    await expect(store.recordProjectScan(actor, id, { ...value, records: [] })).rejects.toThrow("replay changed");
    const fresh = reconnect(); try { expect(await new CloudInventoryStore(fresh).latestProject(actor, scope.connectionId)).toMatchObject({ records: [{ record: value.records[0], observedInCurrentScan: true }], enforcement: "unverified" }); } finally { await fresh.end(); }
  }
  expect((await db.query("SELECT count(*)::int n FROM ll_cloud_project_scans")).rows[0].n).toBe(2);
  for (const table of ["ll_agents", "ll_tokens", "ll_actions"]) expect((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0);
  expect((await store.projectConnections(actor)).connections).toHaveLength(2);
  await expect(store.configureProjectConnection(actor, { ...google, projectNumber: "999999999999" })).rejects.toThrow("immutable");
}));
it("partial, complete-empty and out-of-order project scans retain history and unresolved execution versions", async () => fixture(async (_db, store, actor) => {
  for (const scope of [azure, google]) {
    await store.configureProjectConnection(actor, scope);
    const old = new Date(Date.now() - 2_000_000).toISOString(), next = new Date(Date.now() - 1_800_000).toISOString();
    await store.recordProjectScan(actor, randomUUID(), scan(scope, old));
    await store.recordProjectScan(actor, randomUUID(), { ...scan(scope, next), records: [], completeness: "partial", failures: ["list-unavailable"] });
    await store.recordProjectScan(actor, randomUUID(), scan(scope, new Date(Date.now() - 3_000_000).toISOString(), "2"));
    const saved = await store.latestProject(actor, scope.connectionId);
    expect(saved).toMatchObject({ observedAt: next, stale: true, completeness: "partial", failures: ["list-unavailable"] });
    expect(saved.records).toHaveLength(scope.provider === "azure-foundry" ? 2 : 1);
    expect(saved.records.every(r => !r.observedInCurrentScan && r.stale)).toBe(true);
    await store.recordProjectScan(actor, randomUUID(), { ...scan(scope), records: [] });
    expect((await store.latestProject(actor, scope.connectionId)).records).toHaveLength(saved.records.length);
  }
}));
it("current session, tenant, revocation and recovery containment fence every project operation", async () => fixture(async (db, store, actor) => {
  await store.configureProjectConnection(actor, google);
  const other: Actor = { orgId: "company-b", subject: "other@example.test", tokenHash: "session-b", role: "operator" };
  await expect(store.latestProject(other, "google")).rejects.toThrow("unavailable");
  expect((await store.projectConnections(other)).connections).toEqual([]);
  await expect(store.configureProjectConnection(other, google)).rejects.toThrow("tenant differs");
  await db.query("UPDATE ll_members SET active=false WHERE email='owner@example.test'");
  for (const work of [() => store.projectConnections(actor), () => store.beginProjectScan(actor, "google"), () => store.configureProjectConnection(actor, google), () => store.recordProjectScan(actor, randomUUID(), scan()), () => store.latestProject(actor, "google")]) await expect(work()).rejects.toThrow("member required");
  await db.query("UPDATE ll_members SET active=true WHERE email='owner@example.test'");
  vi.stubEnv("LOOPLABS_RECOVERY_EPOCH", randomUUID()); await expect(store.recordProjectScan(actor, randomUUID(), scan())).rejects.toThrow("contained");
  expect((await db.query("SELECT count(*)::int n FROM ll_cloud_project_scans")).rows[0].n).toBe(0);
}));
it("raw fields, invented authority, foreign references, duplicates and malformed or future times refuse before saving", async () => fixture(async (db, store, actor) => {
  await store.configureProjectConnection(actor, google); const value = scan(), r = value.records[0];
  for (const bad of [null, { ...value, raw: "SECRET" }, { ...value, completeness: "unknown" }, { ...value, observedAt: "2026-02-30T00:00:00.000Z" }, { ...value, records: [r, r] }, { ...value, records: [{ ...r, version: "etag" }] }, { ...value, records: [{ ...r, identityKind: "service-account", identityReference: "worker-agent@foreign-project.iam.gserviceaccount.com" }] }, { ...value, records: [{ ...r, coverage: { ...r.coverage, enforcement: "verified" } }] }, { ...value, failures: ["list-unavailable"] }, { ...value, observedAt: new Date(Date.now()+600_000).toISOString(), records: [] }])
    await expect(store.recordProjectScan(actor, randomUUID(), bad as ProjectInventoryScan)).rejects.toThrow();
  expect((await db.query("SELECT count(*)::int n FROM ll_cloud_project_scans")).rows[0].n).toBe(0);
  const normalized = canonicalProjectScan(value); value.records[0].gaps.push("SECRET"); expect(normalized.records[0].gaps).not.toContain("SECRET");
}));
it("database boundaries reject rewrites and direct foreign-project/version/principal substitution", async () => fixture(async (db, store, actor) => {
  for (const scope of [google, azure]) { await store.configureProjectConnection(actor, scope); await store.recordProjectScan(actor, randomUUID(), scan(scope)); }
  for (const table of ["ll_cloud_project_connections", "ll_cloud_project_scans", "ll_cloud_project_observations"]) {
    await expect(db.query(`DELETE FROM ${table}`)).rejects.toMatchObject({ code: "23514" });
    await expect(db.query(`UPDATE ${table} SET org_id=org_id`)).rejects.toMatchObject({ code: "23514" });
  }
  const row = (await db.query("SELECT id FROM ll_cloud_project_scans WHERE connection_id='google'")).rows[0];
  for (const [resource, version, kind, principal] of [["projects/999999999999/locations/us-central1/reasoningEngines/1234", "", "unknown", null], [scan().records[0].resource, "invented-version", "unknown", null], [scan().records[0].resource, "", "service-account", "worker-agent@foreign-project.iam.gserviceaccount.com"]])
    await expect(db.query("INSERT INTO ll_cloud_project_observations(org_id,connection_id,scan_id,resource,provider_version,identity_kind,identity_reference) VALUES('company-a','google',$1,$2,$3,$4,$5)", [row.id, resource, version, kind, principal])).rejects.toMatchObject({ code: "23514" });
}));
it("project scan throttling commits refused attempts without collecting or authorizing work", async () => fixture(async (db, store, actor) => {
  await store.configureProjectConnection(actor, google);
  for (const allowed of [true,true,true,false,false]) expect((await store.beginProjectScan(actor, "google")).allowed).toBe(allowed);
  expect((await db.query("SELECT count(*)::int n FROM ll_cloud_project_scans")).rows[0].n).toBe(0);
}));
it("restricted observation writers cannot update, delete or truncate history", async () => fixture(async (db, store, actor) => {
  await store.configureProjectConnection(actor, google); await store.recordProjectScan(actor, randomUUID(), scan());
  const role = `project_reader_${randomBytes(8).toString("hex")}`, schema = (await db.query("SELECT current_schema() AS schema")).rows[0].schema;
  await db.query(`CREATE ROLE ${role} NOLOGIN`); const c = await db.connect();
  try {
    await c.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
    await c.query(`GRANT SELECT,INSERT ON ll_cloud_project_connections,ll_cloud_project_scans,ll_cloud_project_observations TO ${role}`);
    await c.query(`SET ROLE ${role}`);
    for (const table of ["ll_cloud_project_connections", "ll_cloud_project_scans", "ll_cloud_project_observations"]) {
      expect((await c.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(1);
      for (const sql of [`UPDATE ${table} SET org_id=org_id`, `DELETE FROM ${table}`, `TRUNCATE ${table}`]) await expect(c.query(sql)).rejects.toMatchObject({ code: "42501" });
    }
  } finally { await c.query("RESET ROLE"); c.release(); await db.query(`DROP OWNED BY ${role}`); await db.query(`DROP ROLE ${role}`); }
}));
it("bounded project views report limits without deleting stored observations or connections", async () => fixture(async (db, store, actor) => {
  await store.configureProjectConnection(actor, google); const id = randomUUID(); await store.recordProjectScan(actor, id, { ...scan(), records: [] });
  await db.query("INSERT INTO ll_cloud_project_observations(org_id,connection_id,scan_id,resource,provider_version,identity_kind) SELECT 'company-a','google',$1,'projects/123456789012/locations/us-central1/reasoningEngines/'||i,'','unknown' FROM generate_series(1,2001) i", [id]);
  const saved = await store.latestProject(actor, "google"); expect(saved.historyTruncated).toBe(true); expect(saved.records).toHaveLength(2000);
  expect((await db.query("SELECT count(*)::int n FROM ll_cloud_project_observations")).rows[0].n).toBe(2001);
  await db.query("INSERT INTO ll_cloud_project_connections(org_id,id,provider,project_id,project_number,location,created_by) SELECT 'company-a','google-'||i,'google-agent-engine','company-agents','123456789012','us-central1','owner@example.test' FROM generate_series(1,100) i");
  expect(await store.projectConnections(actor)).toMatchObject({ truncated: true, scanningAvailable: false });
  expect((await store.projectConnections(actor)).connections).toHaveLength(100);
}));
it("minimization rejects malformed records and preserves distinct provider identity gaps", () => {
  for (const scope of [azure, google]) {
    const value = scan(scope), r = value.records[0];
    for (const bad of [{ ...value, records: [null] }, { ...value, records: [{ ...r, raw: "SECRET" }] }, { ...value, records: [{ ...r, resource: "foreign" }] }, { ...value, records: [{ ...r, observedAt: "bad" }] }, { ...value, records: [{ ...r, identityKind: "future" }] }, { ...value, records: [{ ...r, gaps: [] }] }, { ...value, records: [{ ...r, scope: { ...scope, tenantId: "foreign" } }] }, { ...value, failures: ["unknown"] }, { ...value, records: Array(4001).fill(r) }, { ...value, failures: Array(10001).fill("invalid-page") }]) expect(() => canonicalProjectScan(bad as ProjectInventoryScan)).toThrow();
  }
  const value = scan(), r = value.records[0]; r.identityKind = "service-account"; r.identityReference = `worker-agent@${google.projectId}.iam.gserviceaccount.com`; r.gaps = ["execution-version-unresolved", "effective-permissions-unknown", "declared-tools-unknown"];
  expect(canonicalProjectScan(value).records[0]).toEqual(r);
  r.identityKind = "agent-identity"; r.identityReference = null; r.gaps.unshift("workload-principal-unresolved");
  expect(canonicalProjectScan(value).records[0].identityKind).toBe("agent-identity");
  const av = scan(azure); av.records[0].version = "2"; expect(() => canonicalProjectScan(av)).toThrow();
});
