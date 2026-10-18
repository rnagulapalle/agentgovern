import { test, expect } from 'vitest';
import { Pool } from 'pg';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const command = promisify(execFile);
test('actual optional quote-authority migration CLI is concurrent/idempotent and refuses missing owner/prerequisites/hash drift', async () => {
 const url = process.env.LOOPLABS_TEST_DATABASE_URL;
 if (!url) throw Error('Dedicated test PostgreSQL required; no skip.');
 const schema = `quote_authority_setup_${randomBytes(8).toString('hex')}`, admin = new Pool({ connectionString:url }); let db, guard;
 try {
  // Fixture isolation only: production concurrency inside each CLI test remains actual.
  guard=await admin.connect();await guard.query("SET lock_timeout='10s'");
  await guard.query('SELECT pg_advisory_lock(99784131)');
  await admin.query(`CREATE SCHEMA ${schema}`); db = new Pool({ connectionString:url, options:`-c search_path=${schema}` });
  const isolated = new URL(url); isolated.searchParams.set('options',`-c search_path=${schema}`);
  const env = { ...process.env, LOOPLABS_MIGRATION_DATABASE_URL:isolated.toString() };
  const run = () => command(process.execPath,['--import','tsx','scripts/quote-authority-setup.ts'],{env});
  await expect(command(process.execPath,['--import','tsx','scripts/quote-authority-setup.ts'],{env:{...env,LOOPLABS_MIGRATION_DATABASE_URL:''}})).rejects.toThrow('owner connection');
  await db.query('CREATE TABLE ll_migrations(version int PRIMARY KEY,digest text NOT NULL)');
  await expect(run()).rejects.toThrow('prerequisite migration');
  for (const [version,file] of [[1,'lib/durable/schema.sql'],[3,'lib/workspace/schema.sql'],[10,'lib/durable/recovery-schema.sql'],[12,'lib/connectors/scope-schema.sql']]) {
   const bytes = await readFile(file); await db.query(bytes.toString());
   await db.query('INSERT INTO ll_migrations VALUES($1,$2)',[version,createHash('sha256').update(bytes).digest('hex')]);
  }
  await db.query("UPDATE ll_migrations SET digest='changed' WHERE version=3");
  await expect(run()).rejects.toThrow('prerequisite migration 3 changed');
  await db.query('UPDATE ll_migrations SET digest=$1 WHERE version=3',[createHash('sha256').update(await readFile('lib/workspace/schema.sql')).digest('hex')]);
  const role = `quote_nonowner_${randomBytes(8).toString('hex')}`; await db.query(`CREATE ROLE ${role} NOLOGIN`);
  try {
   await db.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`); await db.query(`GRANT SELECT ON ll_migrations,ll_orgs TO ${role}`);
   const nonowner = new URL(isolated); nonowner.searchParams.set('options',`-c search_path=${schema} -c role=${role}`);
   await expect(command(process.execPath,['--import','tsx','scripts/quote-authority-setup.ts'],{env:{...env,LOOPLABS_MIGRATION_DATABASE_URL:nonowner.toString()}})).rejects.toThrow('quote-authority owner connection');
  } finally { await db.query(`DROP OWNED BY ${role}`); await db.query(`DROP ROLE ${role}`); }
  const temp=await mkdtemp(join(tmpdir(),'quote-authority-diagnostics-'));
  try {
   const preload=join(temp,'inject.mjs'), marker='postgresql://fixture-user:fixture-private-password@private-host/db';
   await writeFile(preload,`import {createRequire} from 'node:module'; const require=createRequire(${JSON.stringify(join(process.cwd(),'package.json'))}); const {Client}=require('pg'); const original=Client.prototype.query; Client.prototype.query=function(...args){if(args[0]==='BEGIN')throw new Error(${JSON.stringify(marker)});return original.apply(this,args);};`);
   const result=await command(process.execPath,['--import',preload,'--import','tsx','scripts/quote-authority-setup.ts'],{env}).then(()=>null,error=>error);
   expect(result.code).toBe(1);expect(result.stderr).toContain('Quote authority setup failed');expect(result.stderr+result.stdout).not.toContain(marker);expect(result.stderr+result.stdout).not.toContain('fixture-private-password');
   expect((await db.query('SELECT count(*)::int n FROM ll_migrations WHERE version=20')).rows[0].n).toBe(0);
  }finally{await rm(temp,{recursive:true,force:true});}
  const ownerLock=await db.connect();
  try{
   await ownerLock.query('BEGIN');await ownerLock.query('SELECT pg_advisory_xact_lock(68391205)');
   const started=Date.now(), result=await run().then(()=>null,error=>error);
   expect(result.code).toBe(1);expect(result.stderr).toContain('Quote authority setup failed');expect(Date.now()-started).toBeLessThan(6500);
   expect((await db.query('SELECT count(*)::int n FROM ll_migrations WHERE version=20')).rows[0].n).toBe(0);
  }finally{await ownerLock.query('ROLLBACK');ownerLock.release();}
  await Promise.all([run(),run()]); await run();
  expect((await db.query('SELECT count(*)::int n FROM ll_migrations WHERE version=20')).rows[0].n).toBe(1);
  expect((await db.query('SELECT count(*)::int n FROM ll_quote_manager_grants')).rows[0].n).toBe(0);
  await db.query("UPDATE ll_migrations SET digest='changed' WHERE version=20");
  await expect(run()).rejects.toThrow('migration 20 changed');
 } finally { await db?.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); if(guard){await guard.query('SELECT pg_advisory_unlock(99784131)');guard.release();} await admin.end(); }
},20_000);
