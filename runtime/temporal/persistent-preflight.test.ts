import { randomBytes, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { persistentMigrations, persistentMigrationDigests, persistentPrerequisites, type PersistentWorkerArtifact } from "./persistent-preflight";

const schema = `persistent_${randomBytes(8).toString("hex")}`, role = `persistent_role_${randomBytes(8).toString("hex")}`;
const epoch = "11111111-1111-4111-8111-111111111111", token = "t".repeat(40);
const artifact: PersistentWorkerArtifact = { buildId: `ack-${"a".repeat(64)}`, imageId: `sha256:${"b".repeat(64)}`, serviceHash: "c".repeat(64), workflowHash: "d".repeat(64), lockHash: "e".repeat(64) };
const env = { LOOPLABS_RECOVERY_EPOCH: epoch, LOOPLABS_WORKSPACE_ID: "one", LOOPLABS_TEMPORAL_WORKSPACE: "staging",
  LOOPLABS_TEMPORAL_ADDRESS: "temporal.example.test:7233", LOOPLABS_TEMPORAL_NAMESPACE: "isolated", LOOPLABS_TEMPORAL_TASK_QUEUE: "ack",
  LOOPLABS_TEMPORAL_BUILD_ID: artifact.buildId, LOOPLABS_TEMPORAL_RECORD_BUILD_ID: artifact.buildId,
  LOOPLABS_TEMPORAL_API_KEY: "private-fixture-key", LOOPLABS_TEMPORAL_WORKER_TOKEN: token,
  LOOPLABS_CONNECTOR_TWIN_URL: "http://connector-twin:8018", LOOPLABS_CONNECTOR_TWIN_TOKEN: "c".repeat(40),
  LOOPLABS_RECORD_CATALOG: JSON.stringify({ records: [{ version: "record-scope-1", workspaceId: "one", contactId: "2001", recipient: "alice@example.test" }] }) };
let admin: Pool, owner: Pool, runtime: Pool, expected: { version: number; digest: string }[];
beforeAll(async () => {
  if (!process.env.LOOPLABS_TEST_DATABASE_URL) throw Error("Dedicated PostgreSQL required; persistent preflight tests cannot be skipped.");
  admin = new Pool({ connectionString: process.env.LOOPLABS_TEST_DATABASE_URL });
  await admin.query(`CREATE SCHEMA ${schema}`);
  owner = new Pool({ connectionString: process.env.LOOPLABS_TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  await owner.query("CREATE TABLE ll_migrations(version integer PRIMARY KEY,digest text NOT NULL)");
  for (const [, file] of persistentMigrations) await owner.query(await readFile(file, "utf8"));
  expected = await persistentMigrationDigests();
  const password = randomBytes(24).toString("hex");
  await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
  await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
  await admin.query(`GRANT SELECT ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);
  const url = new URL(process.env.LOOPLABS_TEST_DATABASE_URL); url.username = role; url.password = password;
  runtime = new Pool({ connectionString: url.toString(), options: `-c search_path=${schema}` });
}, 20000);
beforeEach(async () => {
  await owner.query("TRUNCATE ll_orgs CASCADE"); await owner.query("TRUNCATE ll_temporal_worker_builds CASCADE");
  await owner.query("TRUNCATE ll_migrations");
  for (const migration of expected) await owner.query("INSERT INTO ll_migrations VALUES($1,$2)", [migration.version, migration.digest]);
  await owner.query("INSERT INTO ll_orgs(id) VALUES('one'),('two')");
  await owner.query("INSERT INTO ll_workspace_recovery(org_id,epoch) VALUES('one',$1)", [epoch]);
  await owner.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('requester','one','Requester','fixture'),('reviewer','one','Reviewer','fixture')");
  await owner.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'one','enquiry-temporal','worker')", [createHash("sha256").update(token).digest("hex")]);
  await owner.query("INSERT INTO ll_temporal_worker_builds(worker_build_id,image_id,service_sha256,workflow_sha256,lock_sha256) VALUES($1,$2,$3,$4,$5)", [artifact.buildId, artifact.imageId, artifact.serviceHash, artifact.workflowHash, artifact.lockHash]);
});
afterAll(async () => {
  await runtime?.end(); await owner?.end();
  if (admin) { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.query(`DROP ROLE IF EXISTS ${role}`); await admin.end(); }
});
it("reads exact released migrations14–18 and active worker enrollment without changing authority", async () => {
  expect(expected.map(m => m.version)).toEqual([1,2,3,4,5,7,8,9,10,11,12,13,14,15,16,17,18]);
  const before = (await owner.query("SELECT row_to_json(t) FROM ll_temporal_worker_builds t")).rows;
  expect(await persistentPrerequisites(runtime, env, artifact)).toEqual([]);
  expect((await owner.query("SELECT row_to_json(t) FROM ll_temporal_worker_builds t")).rows).toEqual(before);
  await expect(runtime.query("UPDATE ll_workspace_recovery SET epoch=$1", [epoch])).rejects.toMatchObject({ code: "42501" });
});
it("refuses each missing/tampered released digest and requires explicit optional quote-plan opt-in", async () => {
  for (const version of [14,15,16,17,18]) {
    await owner.query("DELETE FROM ll_migrations WHERE version=$1", [version]);
    expect(await persistentPrerequisites(runtime, env, artifact)).toEqual([`migration_${version}_missing`]);
    await owner.query("INSERT INTO ll_migrations VALUES($1,'tampered')", [version]);
    expect(await persistentPrerequisites(runtime, env, artifact)).toEqual([`migration_${version}_digest_mismatch`]);
    await owner.query("UPDATE ll_migrations SET digest=$2 WHERE version=$1", [version, expected.find(m => m.version === version)!.digest]);
  }
  expect(await persistentPrerequisites(runtime, env, artifact, { quotePlans: true })).toEqual(["migration_19_missing"]);
  const quote = (await persistentMigrationDigests({ quotePlans: true })).find(m => m.version === 19)!;
  await owner.query(await readFile("lib/quotes/schema.sql", "utf8"));
  await owner.query("INSERT INTO ll_migrations VALUES(19,'tampered')");
  expect(await persistentPrerequisites(runtime, env, artifact, { quotePlans: true })).toEqual(["migration_19_digest_mismatch"]);
  await owner.query("UPDATE ll_migrations SET digest=$1 WHERE version=19", [quote.digest]);
  expect(await persistentPrerequisites(runtime, env, artifact, { quotePlans: true })).toEqual([]);
  // Optional proposal schema deliberately forbids TRUNCATE; retire only this
  // empty test-owned table before the next fixture's existing cleanup routine.
  await owner.query("DROP TABLE ll_quote_plans CASCADE");
});
it("rejects malformed configuration and artifact pins before database inspection", async () => {
  for (const override of [{ LOOPLABS_WORKSPACE_ID: "bad space" }, { LOOPLABS_TEMPORAL_WORKER_TOKEN: "bad" },
    { LOOPLABS_RECOVERY_EPOCH: "bad" }, { LOOPLABS_TEMPORAL_BUILD_ID: "old" }])
    expect((await persistentPrerequisites(runtime, { ...env, ...override }, artifact)).length).toBeGreaterThan(0);
  for (const value of [null, [], {}, { ...artifact, extra: true }, { ...artifact, imageId: "tag" },
    { ...artifact, buildId: `ack-${"f".repeat(64)}` }, { ...artifact, serviceHash: "bad" }])
    expect(await persistentPrerequisites(runtime, env, value)).toEqual(["persistent_worker_artifact_missing_or_invalid"]);
  for (const value of [null, [], {}, { quotePlans: "true" }, { quotePlans: false, executeQuotes: true }]) {
    await expect(persistentMigrationDigests(value)).rejects.toThrow("Explicit bounded");
    expect(await persistentPrerequisites(runtime, env, artifact, value)).toEqual(["persistent_migration_configuration_unavailable"]);
  }
});
it("refuses owner/schema privileges, revoked workload/member authority and mismatched recovery fences", async () => {
  expect(await persistentPrerequisites(owner, env, artifact)).toContain("runtime_database_role_privileged");
  await admin.query(`GRANT CREATE ON SCHEMA ${schema} TO ${role}`);
  expect(await persistentPrerequisites(runtime, env, artifact)).toContain("runtime_database_role_privileged");
  await runtime.query("CREATE TABLE ll_runtime_owned(id integer)"); await admin.query(`REVOKE CREATE ON SCHEMA ${schema} FROM ${role}`);
  expect(await persistentPrerequisites(runtime, env, artifact)).toContain("runtime_database_role_privileged"); await owner.query("DROP TABLE ll_runtime_owned");
  await owner.query("UPDATE ll_tokens SET active=false");
  expect(await persistentPrerequisites(runtime, env, artifact)).toContain("scoped_workload_not_active_in_workspace");
  await owner.query("UPDATE ll_tokens SET active=true"); await owner.query("UPDATE ll_members SET active=false WHERE email='reviewer'");
  expect(await persistentPrerequisites(runtime, env, artifact)).toContain("independent_named_members_missing");
  expect(await persistentPrerequisites(runtime, { ...env, LOOPLABS_RECOVERY_EPOCH: "22222222-2222-4222-8222-222222222222" }, artifact)).toContain("recovery_fence_missing_or_mismatched");
});
it("refuses absent/draining/differently pinned workers and sanitizes unavailable/denied inspections", async () => {
  for (const key of ["imageId", "serviceHash", "workflowHash", "lockHash"] as const) {
    const changed = { ...artifact, [key]: key === "imageId" ? `sha256:${"f".repeat(64)}` : "f".repeat(64) };
    expect(await persistentPrerequisites(runtime, env, changed)).toEqual(["persistent_worker_enrollment_missing_or_mismatched"]);
  }
  const other = { ...artifact, buildId: `ack-${"f".repeat(64)}` };
  expect(await persistentPrerequisites(runtime, { ...env, LOOPLABS_TEMPORAL_BUILD_ID: other.buildId, LOOPLABS_TEMPORAL_RECORD_BUILD_ID: other.buildId }, other)).toEqual(["persistent_worker_enrollment_missing_or_mismatched"]);
  await owner.query("UPDATE ll_temporal_worker_builds SET state='draining',draining_at=clock_timestamp()");
  expect(await persistentPrerequisites(runtime, env, artifact)).toEqual(["persistent_worker_enrollment_missing_or_mismatched"]);
  await admin.query(`REVOKE SELECT ON ${schema}.ll_temporal_worker_builds FROM ${role}`);
  expect(await persistentPrerequisites(runtime, env, artifact)).toEqual(["persistent_database_inspection_denied"]);
  await admin.query(`GRANT SELECT ON ${schema}.ll_temporal_worker_builds TO ${role}`);
  await owner.query("ALTER TABLE ll_temporal_worker_builds RENAME TO ll_missing_worker_builds");
  try { expect(await persistentPrerequisites(runtime, env, artifact)).toEqual(["persistent_database_inspection_unavailable"]); }
  finally { await owner.query("ALTER TABLE ll_missing_worker_builds RENAME TO ll_temporal_worker_builds"); }
});
