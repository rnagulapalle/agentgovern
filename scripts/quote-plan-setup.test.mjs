import { test, expect } from 'vitest';
import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const command = promisify(execFile);
test('actual optional quote-plan migration CLI is concurrent/idempotent and refuses missing owner/prerequisites/hash drift', async () => {
 const url = process.env.LOOPLABS_TEST_DATABASE_URL;
 if (!url) throw Error('Dedicated test PostgreSQL required; no skip.');
 const schema = `quote_setup_${randomBytes(8).toString('hex')}`, admin = new Pool({ connectionString:url }); let db;
 try {
  await admin.query(`CREATE SCHEMA ${schema}`); db = new Pool({ connectionString:url, options:`-c search_path=${schema}` });
  const isolated = new URL(url); isolated.searchParams.set('options',`-c search_path=${schema}`);
  const env = { ...process.env, LOOPLABS_MIGRATION_DATABASE_URL:isolated.toString() };
  const run = () => command(process.execPath,['--import','tsx','scripts/quote-plan-setup.ts'],{env});
  await expect(command(process.execPath,['--import','tsx','scripts/quote-plan-setup.ts'],{env:{...env,LOOPLABS_MIGRATION_DATABASE_URL:''}})).rejects.toThrow('owner connection');
  await db.query('CREATE TABLE ll_migrations(version int PRIMARY KEY,digest text NOT NULL)');
  await expect(run()).rejects.toThrow('prerequisite migration');
  for (const [version,file] of [[1,'lib/durable/schema.sql'],[3,'lib/workspace/schema.sql'],[10,'lib/durable/recovery-schema.sql']]) {
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
   await expect(command(process.execPath,['--import','tsx','scripts/quote-plan-setup.ts'],{env:{...env,LOOPLABS_MIGRATION_DATABASE_URL:nonowner.toString()}})).rejects.toThrow('quote-plan owner connection');
  } finally { await db.query(`DROP OWNED BY ${role}`); await db.query(`DROP ROLE ${role}`); }
  await Promise.all([run(),run()]); await run();
  expect((await db.query('SELECT count(*)::int n FROM ll_migrations WHERE version=19')).rows[0].n).toBe(1);
  expect((await db.query('SELECT count(*)::int n FROM ll_quote_plans')).rows[0].n).toBe(0);
  await db.query("UPDATE ll_migrations SET digest='changed' WHERE version=19");
  await expect(run()).rejects.toThrow('migration 19 changed');
 } finally { await db?.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
},20_000);
