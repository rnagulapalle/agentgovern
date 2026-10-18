import {test,expect} from 'vitest';
import {Pool} from 'pg';
import {readFile} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const command=promisify(execFile);
test('actual optional inventory migration CLI is repeatable/concurrent and refuses absent owner, prerequisites and digest drift',async()=>{
 const url=process.env.LOOPLABS_TEST_DATABASE_URL;if(!url)throw Error('Dedicated test PostgreSQL required; no skip.');
 const schema=`inventory_setup_${randomBytes(8).toString('hex')}`,admin=new Pool({connectionString:url});let db;
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);db=new Pool({connectionString:url,options:`-c search_path=${schema}`});
  const isolated=new URL(url);isolated.searchParams.set('options',`-c search_path=${schema}`);
  const env={...process.env,LOOPLABS_MIGRATION_DATABASE_URL:isolated.toString()};
  const run=()=>command(process.execPath,['--import','tsx','scripts/cloud-inventory-setup.ts'],{env});
  await expect(command(process.execPath,['--import','tsx','scripts/cloud-inventory-setup.ts'],{env:{...env,LOOPLABS_MIGRATION_DATABASE_URL:''}})).rejects.toThrow('owner connection');
  await db.query('CREATE TABLE ll_migrations(version int PRIMARY KEY,digest text NOT NULL)');await expect(run()).rejects.toThrow('prerequisite migration');
  for(const [version,file] of [[1,'lib/durable/schema.sql'],[3,'lib/workspace/schema.sql'],[10,'lib/durable/recovery-schema.sql']]){
   const bytes=await readFile(file);await db.query(bytes.toString());await db.query('INSERT INTO ll_migrations VALUES($1,$2)',[version,createHash('sha256').update(bytes).digest('hex')]);
  }
  await db.query("UPDATE ll_migrations SET digest='changed' WHERE version=3");await expect(run()).rejects.toThrow('prerequisite migration 3 changed');
  await db.query('UPDATE ll_migrations SET digest=$1 WHERE version=3',[createHash('sha256').update(await readFile('lib/workspace/schema.sql')).digest('hex')]);
  const role=`inventory_nonowner_${randomBytes(8).toString('hex')}`;await db.query(`CREATE ROLE ${role} NOLOGIN`);
  try{
   await db.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);await db.query(`GRANT SELECT ON ll_migrations,ll_orgs TO ${role}`);
   const nonowner=new URL(isolated);nonowner.searchParams.set('options',`-c search_path=${schema} -c role=${role}`);
   await expect(command(process.execPath,['--import','tsx','scripts/cloud-inventory-setup.ts'],{env:{...env,LOOPLABS_MIGRATION_DATABASE_URL:nonowner.toString()}})).rejects.toThrow('inventory-owner connection');
  }finally{await db.query(`DROP OWNED BY ${role}`);await db.query(`DROP ROLE ${role}`);}
  await Promise.all([run(),run()]);await run();
  expect((await db.query('SELECT count(*)::int n FROM ll_migrations WHERE version=16')).rows[0].n).toBe(1);
  for(const table of ['ll_cloud_connections','ll_cloud_scans','ll_cloud_runtime_observations','ll_agents','ll_tokens','ll_actions'])expect((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0);
  await db.query("UPDATE ll_migrations SET digest='changed' WHERE version=16");await expect(run()).rejects.toThrow('migration 16 changed');
 }finally{await db?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
},20000);
