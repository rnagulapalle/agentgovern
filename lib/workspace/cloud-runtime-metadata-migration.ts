import type { PoolClient } from "pg";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
/** Offline table-owner upgrade; no role, credential, trust or execution grants. */
export async function installCloudRuntimeMetadata(c: PoolClient) {
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL lock_timeout='2s'");
    await c.query("SELECT pg_advisory_xact_lock(68391205)");
    if (!(await c.query("SELECT pg_get_userbyid(relowner)=current_user owned FROM pg_class WHERE oid='ll_cloud_runtime_observations'::regclass")).rows[0]?.owned) throw Error("Separate inventory table owner required.");
    const prerequisite=createHash("sha256").update(await readFile("lib/workspace/cloud-inventory-schema.sql")).digest("hex");
    if ((await c.query("SELECT digest FROM ll_migrations WHERE version=16")).rows[0]?.digest!==prerequisite) throw Error("Inventory prerequisite missing or changed.");
    const sql=await readFile("lib/workspace/cloud-runtime-metadata-schema.sql","utf8"),digest=createHash("sha256").update(sql).digest("hex");
    const old=(await c.query("SELECT digest FROM ll_migrations WHERE version=30")).rows[0];
    if (old && old.digest!==digest) throw Error("Applied runtime metadata migration changed.");
    if (!old) { await c.query(sql);await c.query("INSERT INTO ll_migrations(version,digest) VALUES(30,$1)",[digest]); }
    await c.query("COMMIT");
    return {migration:30,repeated:Boolean(old),executionAuthorityGranted:false};
  } catch (e) { await c.query("ROLLBACK");throw e; }
}
