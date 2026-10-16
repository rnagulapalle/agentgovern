import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { scopedMigrations, stagingConfiguration, stagingDatabase } from "./staging-preflight";

// Read-only installation prerequisites. No enrollment, dispatch or execution authority.
export const persistentMigrations = [
  // Observation is installed for the web separately. Existing workers keep
  // their released migration contract and receive no observation privileges.
  ...scopedMigrations.filter(([version]) => version <= 24),
  [14, "lib/enquiries/worker-admission-schema.sql"],
  [15, "lib/enquiries/reset-intent-schema.sql"],
  [16, "lib/workspace/cloud-inventory-schema.sql"],
  [17, "lib/workspace/cloud-project-schema.sql"],
  [18, "lib/workspace/cloud-owner-review-schema.sql"],
] as const;
export interface PersistentWorkerArtifact {
  buildId: string; imageId: string; serviceHash: string; workflowHash: string; lockHash: string;
}
function quoteOptIn(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).join() !== "quotePlans" || typeof (value as { quotePlans?: unknown }).quotePlans !== "boolean")
    throw Error("Explicit bounded persistent prerequisite options required");
  return (value as { quotePlans: boolean }).quotePlans;
}
export async function persistentMigrationDigests(options: unknown = { quotePlans: false }) {
  // Quote schema is now a prerequisite of shared membership history, even
  // when quote product access is disabled. Validating the bounded option grants
  // no execution authority and must not duplicate migration 19.
  quoteOptIn(options);
  const files = [...persistentMigrations].sort((a,b)=>a[0]-b[0]);
  return Promise.all(files.map(async ([version, file]) => ({ version, digest: createHash("sha256").update(await readFile(file)).digest("hex") })));
}
function artifactMatches(value: unknown, buildId: string | undefined): value is PersistentWorkerArtifact {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const artifact = value as PersistentWorkerArtifact;
  return Object.keys(artifact).sort().join() === ["buildId", "imageId", "serviceHash", "workflowHash", "lockHash"].sort().join()
    && typeof artifact.buildId === "string" && /^ack-[a-f0-9]{64}$/.test(artifact.buildId) && artifact.buildId === buildId
    && typeof artifact.imageId === "string" && /^sha256:[a-f0-9]{64}$/.test(artifact.imageId)
    && [artifact.serviceHash, artifact.workflowHash, artifact.lockHash].every(hash => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash));
}
export async function persistentPrerequisites(db: Pool, env: Record<string, string | undefined>, artifact: unknown,
  options: unknown = { quotePlans: false }): Promise<string[]> {
  const blockers = stagingConfiguration(env);
  let expected: { version: number; digest: string }[];
  try { expected = await persistentMigrationDigests(options); }
  catch { return [...blockers, "persistent_migration_configuration_unavailable"]; }
  if (!artifactMatches(artifact, env.LOOPLABS_TEMPORAL_RECORD_BUILD_ID)) return [...blockers, "persistent_worker_artifact_missing_or_invalid"];
  if (blockers.length) return blockers;
  try {
    blockers.push(...await stagingDatabase(db, expected, env.LOOPLABS_WORKSPACE_ID!, env.LOOPLABS_TEMPORAL_WORKER_TOKEN!, env.LOOPLABS_RECOVERY_EPOCH));
    if (blockers.length) return blockers;
    const client = await db.connect();
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout='5s'");
      const rows = (await client.query("SELECT worker_build_id,image_id,service_sha256,workflow_sha256,lock_sha256,state FROM ll_temporal_worker_builds WHERE worker_build_id=$1", [artifact.buildId])).rows;
      const row = rows[0];
      if (rows.length !== 1 || row.state !== "active" || row.worker_build_id !== artifact.buildId || row.image_id !== artifact.imageId
        || row.service_sha256 !== artifact.serviceHash || row.workflow_sha256 !== artifact.workflowHash || row.lock_sha256 !== artifact.lockHash)
        blockers.push("persistent_worker_enrollment_missing_or_mismatched");
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  } catch (error) {
    blockers.push((error as { code?: string }).code === "42501" ? "persistent_database_inspection_denied" : "persistent_database_inspection_unavailable");
  }
  // These observations never replace the transactional admission/drain fence.
  return blockers;
}
