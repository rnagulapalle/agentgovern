import { test, expect } from 'vitest';
import { Pool } from 'pg';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const command = promisify(execFile);
test('actual optional enquiry-revision migration CLI is concurrent/idempotent and refuses missing owner/prerequisites/hash drift', async () => {
 const url = process.env.LOOPLABS_TEST_DATABASE_URL;
 if (!url) throw Error('Dedicated test PostgreSQL required; no skip.');
 const suffix=randomBytes(8).toString('hex'), schema=`enquiry_revision_setup_${suffix}`, database=`enquiry_revision_${suffix}`, provisioner=new Pool({connectionString:url}); let admin, db, created=false;
 try {
  // This CLI creates no shared runtime role. A disposable database gives
  // it its own database-scoped advisory lock without queuing behind unrelated
  // quote fixtures. Production lock/deadline assertions below remain unchanged.
  await provisioner.query(`CREATE DATABASE ${database}`);created=true;
  const isolated=new URL(url);isolated.pathname=`/${database}`;isolated.searchParams.set('options',`-c search_path=${schema}`);
  const base=new URL(isolated);base.searchParams.delete('options');
  admin=new Pool({connectionString:base.toString()});
  await admin.query(`CREATE SCHEMA ${schema}`);db=new Pool({connectionString:isolated.toString()});
  const env = { ...process.env, LOOPLABS_MIGRATION_DATABASE_URL:isolated.toString() };
  const run = () => command(process.execPath,['--import','tsx','scripts/enquiry-revision-setup.ts'],{env});
  await expect(command(process.execPath,['--import','tsx','scripts/enquiry-revision-setup.ts'],{env:{...env,LOOPLABS_MIGRATION_DATABASE_URL:''}})).rejects.toThrow('owner connection');
  await db.query('CREATE TABLE ll_migrations(version int PRIMARY KEY,digest text NOT NULL)');
  await expect(run()).rejects.toThrow('prerequisite migration');
  for (const [version,file] of [[1,'lib/durable/schema.sql'],[2,'lib/refunds/schema.sql'],[3,'lib/workspace/schema.sql'],[4,'lib/connectors/schema.sql'],[5,'lib/workflows/schema.sql'],[7,'lib/enquiries/schema.sql'],[8,'lib/enquiries/managed-schema.sql'],[10,'lib/durable/recovery-schema.sql'],[11,'lib/durable/proposal-schema.sql'],[12,'lib/connectors/scope-schema.sql'],[19,'lib/quotes/schema.sql'],[20,'lib/quotes/authority-schema.sql'],[21,'lib/quotes/plan-v2-schema.sql'],[22,'lib/quotes/membership-schema.sql'],[23,'lib/workspace/membership-authority-schema.sql'],[9,'lib/enquiries/temporal-schema.sql'],[13,'lib/enquiries/record-routing-schema.sql']]) {
   const bytes = await readFile(file); await db.query(bytes.toString());
   await db.query('INSERT INTO ll_migrations VALUES($1,$2)',[version,createHash('sha256').update(bytes).digest('hex')]);
  }
  await db.query("UPDATE ll_migrations SET digest='changed' WHERE version=3");
  await expect(run()).rejects.toThrow('prerequisite migration 3 changed');
  await db.query('UPDATE ll_migrations SET digest=$1 WHERE version=3',[createHash('sha256').update(await readFile('lib/workspace/schema.sql')).digest('hex')]);
  const role = `revision_nonowner_${randomBytes(8).toString('hex')}`; await db.query(`CREATE ROLE ${role} NOLOGIN`);
  try {
   await db.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`); await db.query(`GRANT SELECT ON ll_migrations,ll_orgs TO ${role}`);
   const nonowner = new URL(isolated); nonowner.searchParams.set('options',`-c search_path=${schema} -c role=${role}`);
   await expect(command(process.execPath,['--import','tsx','scripts/enquiry-revision-setup.ts'],{env:{...env,LOOPLABS_MIGRATION_DATABASE_URL:nonowner.toString()}})).rejects.toThrow('revision owner connection');
  } finally { await db.query(`DROP OWNED BY ${role}`); await db.query(`DROP ROLE ${role}`); }
  const temp=await mkdtemp(join(tmpdir(),'enquiry-revision-diagnostics-'));
  try {
   const preload=join(temp,'inject.mjs'), marker='postgresql://fixture-user:fixture-private-password@private-host/db';
   await writeFile(preload,`import {createRequire} from 'node:module'; const require=createRequire(${JSON.stringify(join(process.cwd(),'package.json'))}); const {Client}=require('pg'); const original=Client.prototype.query; Client.prototype.query=function(...args){if(args[0]==='BEGIN')throw new Error(${JSON.stringify(marker)});return original.apply(this,args);};`);
   const result=await command(process.execPath,['--import',preload,'--import','tsx','scripts/enquiry-revision-setup.ts'],{env}).then(()=>null,error=>error);
   expect(result.code).toBe(1);expect(result.stderr).toContain('Plan revision setup failed');expect(result.stderr+result.stdout).not.toContain(marker);expect(result.stderr+result.stdout).not.toContain('fixture-private-password');
   expect((await db.query('SELECT count(*)::int n FROM ll_migrations WHERE version=24')).rows[0].n).toBe(0);
  }finally{await rm(temp,{recursive:true,force:true});}
  const ownerLock=await db.connect();
  try{
   await ownerLock.query('BEGIN');await ownerLock.query('SELECT pg_advisory_xact_lock(68391205)');
   const started=Date.now(), result=await run().then(()=>null,error=>error);
   expect(result.code).toBe(1);expect(result.stderr).toContain('Plan revision setup failed');expect(Date.now()-started).toBeLessThan(6500);
   expect((await db.query('SELECT count(*)::int n FROM ll_migrations WHERE version=24')).rows[0].n).toBe(0);
  }finally{await ownerLock.query('ROLLBACK');ownerLock.release();}
  await Promise.all([run(),run()]); await run();
  const runtime=`revision_runtime_${suffix}`;await db.query(`CREATE ROLE ${runtime} NOLOGIN`);
  try{
   await command(process.execPath,['--import','tsx','scripts/enquiry-revision-setup.ts'],{env:{...env,LOOPLABS_MIGRATION_RUNTIME_ROLE:runtime}});
   expect((await db.query("SELECT has_table_privilege($1,'ll_enquiry_revisions','SELECT') r,has_table_privilege($1,'ll_enquiry_revisions','INSERT') i,has_table_privilege($1,'ll_enquiry_revisions','UPDATE') u,has_table_privilege($1,'ll_enquiry_revisions','DELETE') d,has_table_privilege($1,'ll_enquiry_revisions','TRUNCATE') t",[runtime])).rows[0]).toEqual({r:true,i:true,u:false,d:false,t:false});
   expect((await db.query("SELECT has_table_privilege($1,'ll_quote_member_generations','UPDATE') ledger,has_schema_privilege($1,current_schema(),'CREATE') schema",[runtime])).rows[0]).toEqual({ledger:false,schema:false});
   const bad=await command(process.execPath,['--import','tsx','scripts/enquiry-revision-setup.ts'],{env:{...env,LOOPLABS_MIGRATION_RUNTIME_ROLE:'bad;grant'}}).then(()=>null,e=>e);expect(bad.stderr).toContain('Invalid explicit runtime role');
  }finally{await db.query(`DROP OWNED BY ${runtime}`);await db.query(`DROP ROLE ${runtime}`);}

  expect((await db.query('SELECT count(*)::int n FROM ll_migrations WHERE version=24')).rows[0].n).toBe(1);
  expect((await db.query('SELECT count(*)::int n FROM ll_connector_actions')).rows[0].n).toBe(0);
  expect((await db.query("SELECT to_regclass('ll_enquiry_revisions') installed")).rows[0].installed).toBeTruthy();
  expect((await db.query("SELECT bool_or(prosecdef) elevated FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1 AND p.proname LIKE '%24'",[schema])).rows[0].elevated).toBe(false);
  await db.query("UPDATE ll_migrations SET digest='changed' WHERE version=24");
  await expect(run()).rejects.toThrow('migration 24 changed');
 } finally { await db?.end(); await admin?.end(); try{if(created)await provisioner.query(`DROP DATABASE ${database}`);}finally{await provisioner.end();} }
},20_000);
