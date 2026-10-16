import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createInstalledTenantFixture} from './installed-tenant-fixture';
import {applyQuoteExecutionMigrations,quoteExecutionMigrations} from './quote-execution-migrations';

const fixture=()=>createInstalledTenantFixture({tenants:['one'],salesOrg:'one',seed:async()=>{}});
it('real concurrent quote migrations are atomic/idempotent and grant no execution authority',async()=>{
 const f=await fixture();try{
  const before=(await f.owner.query('SELECT version,digest FROM ll_migrations ORDER BY version')).rows;
  const roleQuery='SELECT oid::text oid,rolname FROM pg_roles WHERE oid IN(SELECT login_oid FROM ll_runtime_workspace_bindings) ORDER BY oid';
  const roles=(await f.owner.query(roleQuery)).rows;
  const result=await Promise.all([applyQuoteExecutionMigrations(f.owner),applyQuoteExecutionMigrations(f.owner)]);
  expect(result.map(r=>r.installed.length).sort()).toEqual([0,3]);expect(result.every(r=>!r.approved&&!r.executed&&!r.granted)).toBe(true);
  expect((await applyQuoteExecutionMigrations(f.owner)).installed).toEqual([]);
  expect((await f.owner.query('SELECT version,digest FROM ll_migrations WHERE version NOT IN (25,26,27) ORDER BY version')).rows).toEqual(before);
  for(const [version,file] of quoteExecutionMigrations)expect((await f.owner.query('SELECT digest FROM ll_migrations WHERE version=$1',[version])).rows).toEqual([{digest:createHash('sha256').update(await readFile(file)).digest('hex')}]);
  for(const table of ['ll_connector_actions','ll_quote_background_routes','ll_quote_workload_roles','ll_temporal_worker_builds'])expect((await f.owner.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0);
  expect((await f.owner.query(roleQuery)).rows).toEqual(roles);
  await expect(f.web('one').query('SELECT * FROM ll_quote_background_routes')).rejects.toMatchObject({code:'42501'});
 }finally{await f.close();}
},20000);
it('quote admission uses the released active/draining fence and rejects unknown build families',async()=>{
 const f=await fixture();try{
  const build='quote-'+'a'.repeat(64),hash='b'.repeat(64);
  const insert=(id:string)=>f.owner.query('INSERT INTO ll_temporal_worker_builds(worker_build_id,image_id,workflow_sha256,service_sha256,lock_sha256) VALUES($1,$2,$3,$3,$3)',[id,'sha256:'+hash,hash]);
  // Synthetic registry-row fixture tests SQL constraints only, never image provenance.
  await expect(insert(build)).rejects.toMatchObject({code:'23514'});await applyQuoteExecutionMigrations(f.owner);
  await insert(build);await insert('ack-'+'c'.repeat(64));
  for(const id of ['other-'+'d'.repeat(64),'quote-short','quote-'+'G'.repeat(64)])await expect(insert(id)).rejects.toMatchObject({code:'23514'});
  const attached=(await f.owner.query("SELECT p.proname FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid='ll_quote_background_routes'::regclass AND t.tgname='ll_quote_worker_admission'")).rows;
  expect(attached).toEqual([{proname:'ll_record_worker_admission'}]);
  await f.owner.query('CREATE TABLE admission_probe(worker_build_id text)');await f.owner.query('CREATE TRIGGER probe BEFORE INSERT ON admission_probe FOR EACH ROW EXECUTE FUNCTION ll_record_worker_admission()');
  await expect(f.owner.query('INSERT INTO admission_probe VALUES($1)',['quote-'+'e'.repeat(64)])).rejects.toMatchObject({code:'23514'});
  await f.owner.query('INSERT INTO admission_probe VALUES($1)',[build]);
  await f.owner.query("UPDATE ll_temporal_worker_builds SET state='draining',draining_at=clock_timestamp() WHERE worker_build_id=$1",[build]);
  await expect(f.owner.query('INSERT INTO admission_probe VALUES($1)',[build])).rejects.toMatchObject({code:'23514'});
  await expect(f.owner.query("UPDATE ll_temporal_worker_builds SET state='active',draining_at=NULL WHERE worker_build_id=$1",[build])).rejects.toMatchObject({code:'23514'});
  expect((await f.owner.query('SELECT count(*)::int n FROM admission_probe')).rows[0].n).toBe(1);
 }finally{await f.close();}
},20000);
it('missing and changed prerequisites refuse before any quote schema or history is installed',async()=>{
 const f=await fixture();try{
  const old=(await f.owner.query('SELECT digest FROM ll_migrations WHERE version=24')).rows[0].digest;
  await f.owner.query('DELETE FROM ll_migrations WHERE version=24');await expect(applyQuoteExecutionMigrations(f.owner)).rejects.toThrow('prerequisite migration 24');
  await f.owner.query('INSERT INTO ll_migrations(version,digest) VALUES(24,$1)',['changed']);await expect(applyQuoteExecutionMigrations(f.owner)).rejects.toThrow('migration 24 changed');
  expect((await f.owner.query('SELECT count(*)::int n FROM ll_migrations WHERE version IN (25,26,27)')).rows[0].n).toBe(0);
  expect((await f.owner.query("SELECT to_regclass('ll_quote_background_routes') relation")).rows[0].relation).toBeNull();
  await f.owner.query('UPDATE ll_migrations SET digest=$1 WHERE version=24',[old]);
 }finally{await f.close();}
},20000);
it('actual installer CLI refuses missing owner, plaintext and TLS overrides without exposing credentials',()=>{
 const marker='fixture-private-password';const base={PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test' as const,LOOPLABS_MIGRATION_DATABASE_URL:`postgresql://fixture-user:${marker}@127.0.0.1:1/looplabs_test`,LOOPLABS_TENANT_DATABASE_SCHEMA:'owned_fixture'};
 for(const extra of [{LOOPLABS_MIGRATION_DATABASE_URL:''},{LOOPLABS_MIGRATION_DATABASE_TRANSPORT:JSON.stringify({mode:'loopback-plaintext-test-fixture',fixture:'disposable-local-postgres'})},{NODE_TLS_REJECT_UNAUTHORIZED:'0'},{LOOPLABS_MIGRATION_DATABASE_TRANSPORT:JSON.stringify({mode:'verified-tls',trust:'standard',rejectUnauthorized:false})}]){
  const result=spawnSync(process.execPath,['--import','tsx','scripts/quote-execution-setup.ts'],{env:{...base,...extra},encoding:'utf8',timeout:5000});
  expect(result.status).toBe(1);expect(result.stdout).toBe('');expect(result.stderr).toContain('Quote execution installation refused');expect(result.stderr).not.toContain(marker);
 }
},15000);
it('failed second DDL rolls back first schema and both migration records; applied drift is refused',async()=>{
 const f=await fixture();try{
  await f.owner.query('CREATE TABLE ll_quote_background_routes(blocker int)');
  await expect(applyQuoteExecutionMigrations(f.owner)).rejects.toMatchObject({code:'42P07'});
  expect((await f.owner.query('SELECT count(*)::int n FROM ll_migrations WHERE version IN (25,26,27)')).rows[0].n).toBe(0);
  expect((await f.owner.query("SELECT to_regprocedure('ll_quote_action_boundary_proposed()') relation")).rows[0].relation).toBeNull();
  await f.owner.query('DROP TABLE ll_quote_background_routes');await applyQuoteExecutionMigrations(f.owner);
  await f.owner.query("UPDATE ll_migrations SET digest='changed' WHERE version=26");
  await expect(applyQuoteExecutionMigrations(f.owner)).rejects.toThrow('migration 26 changed');
  expect((await f.owner.query('SELECT count(*)::int n FROM ll_migrations WHERE version=25')).rows[0].n).toBe(1);
 }finally{await f.close();}
},20000);
it('installed named web and worker roles cannot install or create quote execution authority',async()=>{
 const f=await fixture();try{
  for(const db of [f.web('one'),await f.workload('one','worker')])await expect(applyQuoteExecutionMigrations(db)).rejects.toThrow();
  expect((await f.owner.query('SELECT count(*)::int n FROM ll_migrations WHERE version IN (25,26,27)')).rows[0].n).toBe(0);
  expect((await f.owner.query("SELECT to_regclass('ll_quote_background_routes') relation")).rows[0].relation).toBeNull();
 }finally{await f.close();}
},20000);

it('an unrelated installation cannot starve quote migrations; same ledger retains bounded exclusion',async()=>{
 const first=await fixture(),second=await fixture();let held;
 try{
  held=await first.owner.connect();await held.query('BEGIN');
  await held.query("SELECT pg_advisory_xact_lock(hashtextextended(current_database() || ':' || 'll_migrations'::regclass::oid::text, 68391205))");
  expect((await applyQuoteExecutionMigrations(second.owner)).installed).toHaveLength(3);
  await expect(applyQuoteExecutionMigrations(first.owner)).rejects.toMatchObject({code:'55P03'});
  expect((await held.query('SELECT count(*)::int n FROM ll_migrations WHERE version IN (25,26,27)')).rows[0].n).toBe(0);
  await held.query('ROLLBACK');held.release();held=undefined;
  expect((await applyQuoteExecutionMigrations(first.owner)).installed).toHaveLength(3);
 }finally{if(held){await held.query('ROLLBACK');held.release();}await second.close();await first.close();}
},20000);
