import {test,expect} from 'vitest';
import {Pool} from 'pg';
import {readFile} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const command=promisify(execFile);
test('actual owner CLI applies optional migration15 on full schema concurrently and refuses drift',async()=>{
 const url=process.env.LOOPLABS_TEST_DATABASE_URL;if(!url)throw Error('Dedicated PostgreSQL required; no skip.');
 const schema=`reset_setup_${randomBytes(8).toString('hex')}`,admin=new Pool({connectionString:url});let db;
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);db=new Pool({connectionString:url,options:`-c search_path=${schema}`});
  const isolated=new URL(url);isolated.searchParams.set('options',`-c search_path=${schema}`);
  const env={...process.env,LOOPLABS_MIGRATION_DATABASE_URL:isolated.toString()};
  const run=()=>command(process.execPath,['--import','tsx','scripts/reset-intent-setup.ts'],{env});
  await expect(command(process.execPath,['--import','tsx','scripts/reset-intent-setup.ts'],{env:{...env,LOOPLABS_MIGRATION_DATABASE_URL:''}})).rejects.toThrow('owner connection');
  await db.query('CREATE TABLE ll_migrations(version int PRIMARY KEY,digest text NOT NULL)');
  await expect(run()).rejects.toThrow('prerequisite migration');
  for(const [version,file] of [[1,'lib/durable/schema.sql'],[3,'lib/workspace/schema.sql'],[2,'lib/refunds/schema.sql'],[4,'lib/connectors/schema.sql'],[5,'lib/workflows/schema.sql'],[11,'lib/durable/proposal-schema.sql'],[7,'lib/enquiries/schema.sql'],[8,'lib/enquiries/managed-schema.sql'],[9,'lib/enquiries/temporal-schema.sql'],[10,'lib/durable/recovery-schema.sql'],[12,'lib/connectors/scope-schema.sql'],[13,'lib/enquiries/record-routing-schema.sql'],[14,'lib/enquiries/worker-admission-schema.sql']]){
   const bytes=await readFile(file);await db.query(bytes.toString());await db.query('INSERT INTO ll_migrations VALUES($1,$2)',[version,createHash('sha256').update(bytes).digest('hex')]);
  }
  await Promise.all([run(),run()]);await run();
  expect((await db.query('SELECT count(*)::int n FROM ll_temporal_reset_intents')).rows[0].n).toBe(0);
  expect((await db.query('SELECT count(*)::int n FROM ll_migrations WHERE version=15')).rows[0].n).toBe(1);
  await db.query("UPDATE ll_migrations SET digest='changed' WHERE version=15");await expect(run()).rejects.toThrow('migration 15 changed');
 }finally{await db?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
},20000);
