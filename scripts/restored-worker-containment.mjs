// Offline deployment-owner operation after existing workspace quarantine.
// Current candidate supports one workspace per deployment, never tenant-wide API access.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export async function containRestoredWorkerBuilds(db,{orgId,epoch,backupHash}){
 assert.equal(process.env.LOOPLABS_RESTORE_ACK,'WRITERS_STOPPED_AND_EPOCH_ROTATED');
 assert(/^[a-zA-Z0-9_-]{1,64}$/.test(orgId));assert(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(epoch));
 assert.equal(process.env.LOOPLABS_RECOVERY_EPOCH,epoch);assert(/^[a-f0-9]{64}$/.test(backupHash));
 const c=await db.connect();
 try{
  await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='10s'");
  await c.query('SELECT pg_advisory_xact_lock(68391204)');
  const orgs=(await c.query('SELECT id FROM ll_orgs ORDER BY id FOR UPDATE')).rows;
  assert(orgs.length===1&&orgs[0].id===orgId,'Single-workspace deployment restore required');
  for(const table of ['ll_temporal_worker_builds','ll_temporal_reset_intents','ll_workspace_recovery_events']){
   const owner=(await c.query('SELECT pg_get_userbyid(relowner)=current_user AS owned FROM pg_class WHERE oid=to_regclass($1)',[table])).rows;
   assert(owner.length===1&&owner[0].owned===true,'Separate deployment-owner connection required');
  }
  for(const [version,file] of [[14,'lib/enquiries/worker-admission-schema.sql'],[15,'lib/enquiries/reset-intent-schema.sql']]){
   const digest=createHash('sha256').update(await readFile(file)).digest('hex');
   const applied=(await c.query('SELECT digest FROM ll_migrations WHERE version=$1',[version])).rows;
   assert(applied.length===1&&applied[0].digest===digest,'Compatible post-admission archive required');
  }
  const fence=(await c.query('SELECT epoch FROM ll_workspace_recovery WHERE org_id=$1 FOR SHARE',[orgId])).rows;
  assert(fence.length===1&&fence[0].epoch===epoch,'Workspace quarantine must complete first');
  const recovery=(await c.query('SELECT backup_hash FROM ll_workspace_recovery_events WHERE org_id=$1 AND epoch=$2',[orgId,epoch])).rows;
  assert(recovery.length===1&&recovery[0].backup_hash===backupHash,'Exact archive quarantine evidence required');
  await c.query("UPDATE ll_temporal_worker_builds SET state='draining',draining_at=clock_timestamp() WHERE state='active'");
  const builds=(await c.query('SELECT worker_build_id,image_id,state FROM ll_temporal_worker_builds ORDER BY worker_build_id')).rows;
  assert(builds.every(b=>b.state==='draining'));await c.query('COMMIT');return {contained:true,builds};
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}
