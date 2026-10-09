import {test,expect} from 'vitest';
import {Pool} from 'pg';
import {readFile,writeFile,mkdtemp,mkdir,rm,symlink} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {resetAssemblyArtifacts,enrollResetAssembly} from './reset-assembly-enrollment.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
test('actual full-schema reset assembly enrolls content-distinct pair and refuses stale boundary or image replacement',async()=>{
 const url=process.env.LOOPLABS_TEST_DATABASE_URL;if(!url)throw Error('Dedicated PostgreSQL required; no skip');
 const schema=`reset_pair_${randomBytes(8).toString('hex')}`,admin=new Pool({connectionString:url});let db;
 const dir=await mkdtemp(resolve(tmpdir(),'ll-reset-pair-'));
 const oldReset=process.env.LOOPLABS_STAGING_RESET_PROOF,oldDrain=process.env.LOOPLABS_STAGING_DRAIN_PROOF;
 process.env.LOOPLABS_STAGING_RESET_PROOF='isolated';process.env.LOOPLABS_STAGING_DRAIN_PROOF='isolated';
 try{
  const dirs=[resolve(dir,'baseline'),resolve(dir,'incompatible')],images=['sha256:'+'a'.repeat(64),'sha256:'+'b'.repeat(64)];
  for(const [i,path] of dirs.entries()){
   await mkdir(path);const service='same service',workflow=`workflow-${i}`,lock='same lock';
   await writeFile(resolve(path,'temporal-service.cjs'),service);await writeFile(resolve(path,'temporal-workflow.cjs'),workflow);await writeFile(resolve(path,'pnpm-lock.yaml'),lock);
   const artifactHash=hash(service+workflow+lock);await writeFile(resolve(path,'temporal-manifest.json'),JSON.stringify({version:1,artifactHash,buildId:`ack-${artifactHash}`}));
  }
  await admin.query(`CREATE SCHEMA ${schema}`);db=new Pool({connectionString:url,options:`-c search_path=${schema}`});
  await db.query('CREATE TABLE ll_migrations(version int PRIMARY KEY,digest text NOT NULL)');
  for(const [version,file] of [[1,'lib/durable/schema.sql'],[3,'lib/workspace/schema.sql'],[2,'lib/refunds/schema.sql'],[4,'lib/connectors/schema.sql'],[5,'lib/workflows/schema.sql'],[11,'lib/durable/proposal-schema.sql'],[7,'lib/enquiries/schema.sql'],[8,'lib/enquiries/managed-schema.sql'],[9,'lib/enquiries/temporal-schema.sql'],[10,'lib/durable/recovery-schema.sql'],[12,'lib/connectors/scope-schema.sql'],[13,'lib/enquiries/record-routing-schema.sql'],[14,'lib/enquiries/worker-admission-schema.sql']]){
   const bytes=await readFile(file);await db.query(bytes.toString());await db.query('INSERT INTO ll_migrations VALUES($1,$2)',[version,hash(bytes)]);
  }
  await expect(enrollResetAssembly(db,dirs,images)).rejects.toThrow('reset boundary');
  expect((await db.query('SELECT count(*)::int n FROM ll_temporal_worker_builds')).rows[0].n).toBe(0);
  const sql=await readFile('lib/enquiries/reset-intent-schema.sql');await db.query(sql.toString());await db.query('INSERT INTO ll_migrations VALUES(15,$1)',[hash(sql)]);
  const result=await enrollResetAssembly(db,dirs,images);expect(result.passed).toBe(true);expect(result.resetIntents).toBe(0);expect(result.builds[0]).not.toBe(result.builds[1]);
  expect(await enrollResetAssembly(db,dirs,images)).toEqual(result);
  await expect(enrollResetAssembly(db,dirs,['sha256:'+'c'.repeat(64),images[1]])).rejects.toThrow('Enrollment conflict');
  await db.query("UPDATE ll_migrations SET digest='changed' WHERE version=15");await expect(enrollResetAssembly(db,dirs,images)).rejects.toThrow('reset boundary');
  expect((await db.query('SELECT count(*)::int n FROM ll_temporal_worker_builds')).rows[0].n).toBe(2);
  delete process.env.LOOPLABS_STAGING_RESET_PROOF;await expect(resetAssemblyArtifacts(dirs,images)).rejects.toThrow();process.env.LOOPLABS_STAGING_RESET_PROOF='isolated';
  await expect(resetAssemblyArtifacts(dirs,[images[0],images[0]])).rejects.toThrow();
  await expect(resetAssemblyArtifacts([dir+'/../escape',dirs[1]],images)).rejects.toThrow();
  await rm(resolve(dirs[0],'temporal-service.cjs'));await symlink(resolve(dirs[1],'temporal-service.cjs'),resolve(dirs[0],'temporal-service.cjs'));await expect(resetAssemblyArtifacts(dirs,images)).rejects.toThrow();
 }finally{
  if(oldReset===undefined)delete process.env.LOOPLABS_STAGING_RESET_PROOF;else process.env.LOOPLABS_STAGING_RESET_PROOF=oldReset;
  if(oldDrain===undefined)delete process.env.LOOPLABS_STAGING_DRAIN_PROOF;else process.env.LOOPLABS_STAGING_DRAIN_PROOF=oldDrain;
  await db?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});
 }
},20000);
