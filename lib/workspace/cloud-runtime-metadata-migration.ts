import type { PoolClient } from "pg";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
/** Offline owner upgrade; optional INSERT of metadata only for an existing bound web role. */
export async function installCloudRuntimeMetadata(c: PoolClient, binding?: {role:string;org:string}) {
  if (binding && (Object.keys(binding).sort().join()!=="org,role" || !/^[_a-z][_a-z0-9]{0,62}$/.test(binding.role) || !/^[-_a-zA-Z0-9]{1,64}$/.test(binding.org))) throw Error("Exact existing web role and workspace required.");
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL lock_timeout='2s'");
    await c.query("SELECT pg_advisory_xact_lock(68391205)");
    if (!(await c.query("SELECT pg_get_userbyid(relowner)=current_user owned FROM pg_class WHERE oid='ll_cloud_runtime_observations'::regclass")).rows[0]?.owned) throw Error("Separate inventory table owner required.");
    const prerequisite=createHash("sha256").update(await readFile("lib/workspace/cloud-inventory-schema.sql")).digest("hex");
    if ((await c.query("SELECT digest FROM ll_migrations WHERE version=16")).rows[0]?.digest!==prerequisite) throw Error("Inventory prerequisite missing or changed.");
    if (binding && !(await c.query("SELECT 1 FROM ll_runtime_workspace_bindings b JOIN pg_roles r ON r.oid=b.login_oid AND r.rolname=b.login_name JOIN pg_database d ON d.oid=b.database_oid AND d.datname=b.database_name WHERE b.login_name=$1 AND b.org_id=$2 AND b.purpose='web' AND d.datname=current_database() AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolinherit",[binding.role,binding.org])).rows.length) throw Error("Exact existing bound web role required.");
    const sql=await readFile("lib/workspace/cloud-runtime-metadata-schema.sql","utf8"),digest=createHash("sha256").update(sql).digest("hex");
    const old=(await c.query("SELECT digest FROM ll_migrations WHERE version=30")).rows[0];
    if (old && old.digest!==digest) throw Error("Applied runtime metadata migration changed.");
    if (!old) { await c.query(sql);await c.query("INSERT INTO ll_migrations(version,digest) VALUES(30,$1)",[digest]); }
    if (binding) await c.query(`GRANT INSERT(declared_metadata) ON ll_cloud_runtime_observations TO "${binding.role}"`);
    await c.query("COMMIT");
    return {migration:30,repeated:Boolean(old),metadataColumnGrant:Boolean(binding),executionAuthorityGranted:false};
  } catch (e) { await c.query("ROLLBACK");throw e; }
}
