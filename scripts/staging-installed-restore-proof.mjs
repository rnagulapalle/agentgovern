import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import pg from 'pg';
import {authenticate,authorize,tokenHash} from '../lib/durable/service.ts';
import {quarantineRestore} from '../lib/durable/recovery.ts';
import {scopedPoolOptions} from '../lib/durable/pg-transport.ts';
import {createWorkloadPool} from '../lib/durable/workload-pool.ts';
import {withOwnedInstalledStagingFixture,waitForOwnedSessionDrain} from './staging-owned-installed-fixture.mjs';
export async function installedRestoreProof(){
 return withOwnedInstalledStagingFixture(async f=>{
  const token=randomBytes(32).toString('base64url'),newEpoch=randomUUID(),env=f.environment('worker');
  await f.owner.query("INSERT INTO ll_tokens(hash,org_id,subject,role)VALUES($1,'local-proof','enquiry-temporal','worker')",[tokenHash(token)]);
  const actor=await authenticate(f.worker,token),tokenCount=(await f.owner.query('SELECT count(*)::int n FROM ll_tokens')).rows[0].n;
  const originalOid=(await f.admin.query('SELECT oid::text oid FROM pg_namespace WHERE nspname=$1',[f.schema])).rows[0].oid;
  const archive=execFileSync('docker',['exec',f.container,'pg_dump','-U','ll_gate_owner','-d','looplabs_gate','--schema='+f.schema,'-Fc'],{timeout:30000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});
  assert.equal(archive.subarray(0,5).toString(),'PGDMP');await writeFile(join(f.directory,'installed.archive'),archive,{mode:0o600,flag:'wx'});
  await f.owner.query("UPDATE ll_tokens SET active=false WHERE subject='enquiry-temporal'");
  await assert.rejects(authenticate(f.owner,token),e=>e.status===401);
  await assert.rejects(authenticate(f.worker,token),e=>e.code==='42501');
  await f.stopRuntimePools();await f.closeOwner();
  await waitForOwnedSessionDrain(f.admin,Object.keys(f.roles));
  await f.admin.query('DROP SCHEMA '+f.schema+' CASCADE');
  execFileSync('docker',['exec','-i',f.container,'pg_restore','--no-owner','--exit-on-error','-U','ll_gate_owner','-d','looplabs_gate'],{input:archive,timeout:30000,stdio:['pipe','ignore','pipe']});
  const owner=await f.openOwner(),restoredOid=await f.observeRestoredSchema();
  assert.notEqual(restoredOid,originalOid);
  assert.equal((await owner.query("SELECT active FROM ll_tokens WHERE subject='enquiry-temporal'")).rows[0].active,true,'Archive must restore the actually revoked workload row');
  assert.equal((await owner.query('SELECT ll_runtime_classification() classification')).rows[0].classification,'offline');
  await assert.rejects(createWorkloadPool({...env,LOOPLABS_RECOVERY_EPOCH:newEpoch},'worker'),e=>e.status===503&&e.message==='Scoped workload installation unavailable.');
  assert.equal((await owner.query('SELECT count(*)::int n FROM ll_tokens')).rows[0].n,tokenCount);
  const stale=new pg.Pool(await scopedPoolOptions({url:env.LOOPLABS_DATABASE_URL,schema:f.schema,purpose:'worker',transport:f.transport}));
  try{
   // A restored credential plus SQL purpose is insufficient without the original
   // registered construction; delayed authority cannot adopt restored state.
   await assert.rejects(authenticate(stale,token),e=>e.status===503);
   const c=await stale.connect();try{await assert.rejects(authorize(c,actor,['worker'],'enquiries'),e=>e.status===503);}finally{c.release();}
   const hash=createHash('sha256').update(archive).digest('hex'),counts=await quarantineRestore(owner,'local-proof',newEpoch,hash);
   assert(counts.tokens>0&&counts.members===2);
   assert.deepEqual(await quarantineRestore(owner,'local-proof',newEpoch,hash),counts);
   assert.equal((await owner.query('SELECT count(*)::int n FROM ll_workspace_recovery_events')).rows[0].n,1);
   await assert.rejects(quarantineRestore(owner,'local-proof',newEpoch,'0'.repeat(64)),e=>e.status===409);
   await assert.rejects(authenticate(owner,token),e=>e.status===401);
   await assert.rejects(authenticate(stale,token),e=>e.code==='42501');
   await assert.rejects(createWorkloadPool(env,'worker'),e=>e.status===503&&e.message==='Scoped workload installation unavailable.');
   assert.equal((await owner.query('SELECT count(*)::int n FROM ll_tokens')).rows[0].n,tokenCount,'Stale installed startup must refuse before issuing replacement authority');
   assert.equal((await owner.query('SELECT count(*)::int n FROM ll_tokens WHERE active=true')).rows[0].n,0);
   assert.equal((await owner.query('SELECT epoch FROM ll_workspace_recovery')).rows[0].epoch,newEpoch);
   return{scope:'actual owned verified-TLS installed PostgreSQL archive recovery',archiveRestore:true,restoredAuthorityContained:true,restoreCounts:counts,observedTLS:true,plaintextRefused:true,wrongPasswordRefused:true,originalSchemaOid:originalOid,restoredSchemaOid:restoredOid,releaseAccepted:false};
  }finally{await stale.end();}
 });
}
