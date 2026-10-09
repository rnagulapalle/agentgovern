import {test,expect} from 'vitest';
import {Pool} from 'pg';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {scopedArchiveClient} from './reset-archive-client.mjs';
import {containRestoredWorkerBuilds} from './restored-worker-containment.mjs';
import {claimResetIntent,observeResetIntent} from './reset-intent-store.mjs';
import {quarantineRestore} from '../lib/durable/recovery.ts';
import {verifyRestoredPendingReset} from './restored-reset-verification.mjs';
const migrations=[[1,'lib/durable/schema.sql'],[3,'lib/workspace/schema.sql'],[2,'lib/refunds/schema.sql'],[4,'lib/connectors/schema.sql'],[5,'lib/workflows/schema.sql'],[11,'lib/durable/proposal-schema.sql'],[7,'lib/enquiries/schema.sql'],[8,'lib/enquiries/managed-schema.sql'],[9,'lib/enquiries/temporal-schema.sql'],[10,'lib/durable/recovery-schema.sql'],[12,'lib/connectors/scope-schema.sql'],[13,'lib/enquiries/record-routing-schema.sql'],[14,'lib/enquiries/worker-admission-schema.sql']];
const hash=b=>createHash('sha256').update(b).digest('hex');
test('real post15 archive contains stale intents and active builds until explicit recovery quarantine',async()=>{
 const url=process.env.LOOPLABS_TEST_DATABASE_URL;if(!url)throw Error('Dedicated PostgreSQL required; archive tests must not skip.');
 const schema=`reset_archive_${randomBytes(8).toString('hex')}`,role=`${schema}_role`,admin=new Pool({connectionString:url});let db,runtime,roleCreated=false,archiveDir;
 const previous={epoch:process.env.LOOPLABS_RECOVERY_EPOCH,ack:process.env.LOOPLABS_RESTORE_ACK,reset:process.env.LOOPLABS_STAGING_RESET_PROOF};
 const epoch=randomUUID(),next=randomUUID(),plan=randomUUID(),scope=randomUUID(),build=`ack-${'a'.repeat(64)}`,image=`sha256:${'a'.repeat(64)}`;
 const input={org_id:'proof',operation_id:randomUUID(),plan_id:plan,namespace:'default',workflow_id:`archive-proof-${plan}`,original_run_id:randomUUID(),task_finish_event_id:4,original_history_sha256:'b'.repeat(64),worker_build_id:build,image_id:image,recovery_epoch:epoch};
 try{
  process.env.LOOPLABS_RECOVERY_EPOCH=epoch;process.env.LOOPLABS_STAGING_RESET_PROOF='isolated';delete process.env.LOOPLABS_RESTORE_ACK;
  await admin.query(`CREATE SCHEMA ${schema}`);db=new Pool({connectionString:url,options:`-c search_path=${schema}`});
  await db.query('CREATE TABLE ll_migrations(version int PRIMARY KEY,digest text NOT NULL)');
  for(const [version,file] of migrations){const bytes=await readFile(file);await db.query(bytes.toString());await db.query('INSERT INTO ll_migrations VALUES($1,$2)',[version,hash(bytes)]);}
  await db.query("INSERT INTO ll_orgs(id) VALUES('proof')");await db.query("INSERT INTO ll_workspace_recovery VALUES('proof',$1)",[epoch]);
  await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('owner@example.test','proof','Fixture owner','not-a-real-password')");
  await db.query("INSERT INTO ll_agents(org_id,id,reserved) VALUES('proof','fixture-agent',1)");
  await db.query("INSERT INTO ll_connector_scopes(org_id,id,contact_id,recipient,binding_id,contract_version,created_by) VALUES('proof',$1,'3001','customer@example.test',$2,'private-record-twin-2','owner@example.test')",[scope,'c'.repeat(64)]);
  await db.query("INSERT INTO ll_workflow_runs(org_id,id,state,created_by) VALUES('proof',$1,'completed','owner@example.test')",[plan]);
  await db.query("INSERT INTO ll_enquiry_plans(org_id,id,fixture_id,source_version,policy_versions,plan,plan_hash,created_by,run_id) VALUES('proof',$1,'archive-fixture','version', '{}','{}',$2,'owner@example.test',$1)",[plan,'b'.repeat(64)]);
  await db.query("INSERT INTO ll_enquiry_dispatch(org_id,plan_id,created_by) VALUES('proof',$1,'owner@example.test')",[plan]);
  await db.query("INSERT INTO ll_temporal_dispatch(org_id,plan_id,workflow_id,plan_hash,plan_version,connector_version,state) VALUES('proof',$1,$2,$3,'acknowledgement-1','private-record-twin-2','started')",[plan,input.workflow_id,'b'.repeat(64)]);
  await db.query('INSERT INTO ll_temporal_worker_builds(worker_build_id,image_id,workflow_sha256,service_sha256,lock_sha256) VALUES($1,$2,$3,$3,$3)',[build,image,'a'.repeat(64)]);
  await db.query("INSERT INTO ll_temporal_record_routes(org_id,plan_id,scope_id,worker_build_id,scope_version,binding_id) VALUES('proof',$1,$2,$3,1,$4)",[plan,scope,build,'c'.repeat(64)]);
  await db.query("INSERT INTO ll_connector_policies(org_id,connector) VALUES('proof','crm')");
  await db.query("INSERT INTO ll_connector_actions(org_id,id,agent_id,connector,payload,payload_hash,policy_version,state,reason,proposed_by,approved_by) VALUES('proof',$1,'fixture-agent','crm','{}',$2,1,'ready','Fixture','owner@example.test','owner@example.test')",[randomUUID(),'b'.repeat(64)]);
  const client=scopedArchiveClient(url,schema),pre15=client.dump();
  const sql=await readFile('lib/enquiries/reset-intent-schema.sql');await db.query(sql.toString());await db.query('INSERT INTO ll_migrations VALUES(15,$1)',[hash(sql)]);
  await claimResetIntent(db,input);const archive=client.dump(),backupHash=hash(archive);
  await observeResetIntent(db,input,{resetRunId:randomUUID(),historySha256:'d'.repeat(64)});
  await db.query("UPDATE ll_temporal_worker_builds SET state='draining',draining_at=now() WHERE worker_build_id=$1",[build]);
  // An older archive cannot drop current FK-dependent optional tables. Single
  // transaction refusal leaves the current source data intact; never mask them.
  expect(()=>client.restore(pre15)).toThrow();
  expect((await db.query('SELECT state FROM ll_temporal_reset_intents')).rows[0].state).toBe('observed');
  expect((await db.query('SELECT state FROM ll_temporal_worker_builds')).rows[0].state).toBe('draining');
  process.env.LOOPLABS_RECOVERY_EPOCH=next;
  client.restore(archive);
  expect((await db.query('SELECT state,recovery_epoch FROM ll_temporal_reset_intents')).rows[0]).toEqual({state:'uncertain',recovery_epoch:epoch});
  expect((await db.query('SELECT state FROM ll_temporal_worker_builds')).rows[0].state).toBe('active');
  await expect(claimResetIntent(db,input)).rejects.toThrow('external recovery epoch');
  await expect(containRestoredWorkerBuilds(db,{orgId:'proof',epoch:next,backupHash})).rejects.toThrow();
  process.env.LOOPLABS_RESTORE_ACK='WRITERS_STOPPED_AND_EPOCH_ROTATED';
  await expect(containRestoredWorkerBuilds(db,{orgId:'proof',epoch:next,backupHash})).rejects.toThrow('quarantine must complete');
  const verified=await verifyRestoredPendingReset(db,{input,epoch:next,backupHash});expect(verified).toMatchObject({passed:true,staleResetRefused:true,replacementIntentRefused:true,restoredAuthorityRevoked:true,actionIdentitiesPreserved:true,reservationsPreserved:true,buildsDraining:1,actions:1});
  await quarantineRestore(db,'proof',next,backupHash);
  await db.query("UPDATE ll_migrations SET digest='changed' WHERE version=15");
  await expect(containRestoredWorkerBuilds(db,{orgId:'proof',epoch:next,backupHash})).rejects.toThrow('Compatible post-admission archive');
  await db.query('UPDATE ll_migrations SET digest=$1 WHERE version=15',[hash(sql)]);
  await admin.query(`CREATE ROLE ${role} NOLOGIN`);roleCreated=true;
  await db.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}; GRANT SELECT ON ALL TABLES IN SCHEMA ${schema} TO ${role}`);
  runtime=new Pool({connectionString:url,options:`-c search_path=${schema} -c role=${role}`});
  await expect(containRestoredWorkerBuilds(runtime,{orgId:'proof',epoch:next,backupHash})).rejects.toMatchObject({code:'42501'});
  await expect(containRestoredWorkerBuilds(db,{orgId:'proof',epoch:next,backupHash:'e'.repeat(64)})).rejects.toThrow('Exact archive');
  archiveDir=await mkdtemp(join(tmpdir(),'ll-worker-archive-'));const archivePath=join(archiveDir,'workspace.dump');
  await writeFile(archivePath,archive,{flag:'wx',mode:0o600});
  const isolated=new URL(url);isolated.searchParams.set('options',`-c search_path=${schema}`);
  const output=execFileSync(process.execPath,['scripts/worker-restore-contain.mjs'],{env:{...process.env,LOOPLABS_MIGRATION_DATABASE_URL:isolated.toString(),LOOPLABS_RESTORE_ARCHIVE:archivePath,LOOPLABS_WORKSPACE_ID:'proof'},encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']});
  expect(output.trim()).toBe('Restored worker admission contained: 1 retained builds draining. No reset sent, authority granted or artifact removed.');
  const result=await containRestoredWorkerBuilds(db,{orgId:'proof',epoch:next,backupHash});
  expect(result).toEqual({contained:true,builds:[{worker_build_id:build,image_id:image,state:'draining'}]});
  expect(await containRestoredWorkerBuilds(db,{orgId:'proof',epoch:next,backupHash})).toEqual(result);
  await expect(claimResetIntent(db,input)).rejects.toThrow('external recovery epoch');
  await expect(claimResetIntent(db,{...input,recovery_epoch:next})).rejects.toThrow('Reset intent conflict');
  await expect(claimResetIntent(db,{...input,operation_id:randomUUID(),recovery_epoch:next})).rejects.toThrow('another reset intent');
  await expect(db.query("UPDATE ll_temporal_worker_builds SET state='active',draining_at=NULL")).rejects.toMatchObject({code:'23514'});
  await expect(db.query("INSERT INTO ll_temporal_record_routes(org_id,plan_id,scope_id,worker_build_id,scope_version,binding_id) VALUES('proof',$1,$2,$3,1,$4)",[randomUUID(),scope,build,'c'.repeat(64)])).rejects.toMatchObject({code:'23514'});
  expect((await db.query('SELECT reserved FROM ll_agents')).rows[0].reserved).toBe(1);
  expect((await db.query('SELECT active FROM ll_members')).rows[0].active).toBe(false);
  expect((await db.query('SELECT active FROM ll_connector_scopes')).rows[0].active).toBe(false);
  // Global worker registry: do not silently apply a single-workspace quarantine
  // to a multi-workspace deployment without a separately designed policy.
  await db.query("INSERT INTO ll_orgs(id) VALUES('other')");
  const otherBuild=`ack-${'f'.repeat(64)}`;
  await db.query('INSERT INTO ll_temporal_worker_builds(worker_build_id,image_id,workflow_sha256,service_sha256,lock_sha256) VALUES($1,$2,$3,$3,$3)',[otherBuild,`sha256:${'f'.repeat(64)}`,'f'.repeat(64)]);
  await expect(containRestoredWorkerBuilds(db,{orgId:'proof',epoch:next,backupHash})).rejects.toThrow('Single-workspace');
  expect((await db.query('SELECT state FROM ll_temporal_worker_builds WHERE worker_build_id=$1',[otherBuild])).rows[0].state).toBe('active');
 }finally{
  if(previous.reset===undefined)delete process.env.LOOPLABS_STAGING_RESET_PROOF;else process.env.LOOPLABS_STAGING_RESET_PROOF=previous.reset;
  if(previous.epoch===undefined)delete process.env.LOOPLABS_RECOVERY_EPOCH;else process.env.LOOPLABS_RECOVERY_EPOCH=previous.epoch;
  if(previous.ack===undefined)delete process.env.LOOPLABS_RESTORE_ACK;else process.env.LOOPLABS_RESTORE_ACK=previous.ack;
  await runtime?.end();await db?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  if(roleCreated){await admin.query(`DROP OWNED BY ${role}`);await admin.query(`DROP ROLE ${role}`);}await admin.end();if(archiveDir)await rm(archiveDir,{recursive:true,force:true});
 }
},30000);
test('scoped archive client refuses arbitrary schema and non-custom input before restore',()=>{
 expect(()=>scopedArchiveClient('postgresql://localhost/test','public')).toThrow();
 const client=scopedArchiveClient(process.env.LOOPLABS_TEST_DATABASE_URL||'postgresql://localhost/test','reset_archive_aaaaaaaaaaaaaaaa');
 expect(()=>client.restore(Buffer.from('not a custom archive'))).toThrow();
});
test('offline restore command refuses before opening files or connecting without explicit configuration',()=>{
 let failure;
 try{execFileSync(process.execPath,['scripts/worker-restore-contain.mjs'],{env:{PATH:process.env.PATH},encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe']});}catch(error){failure=error;}
 expect(failure.status).toBe(1);expect(failure.stdout).toBe('');expect(failure.stderr.trim()).toBe('Restored worker containment refused; no raw archive, credentials or database error printed.');
});
