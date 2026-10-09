import {test,expect} from 'vitest';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,basename} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Pool} from 'pg';
import {inspectedWorkerArtifact,enrollInspectedWorker} from './worker-artifact-enrollment.mjs';
const bytes={service:'// inert image extraction fixture\n',workflow:'// inert workflow fixture\n',lock:'fixture lock bytes\n'};
const hash=createHash('sha256').update(bytes.service).update(bytes.workflow).update(bytes.lock).digest('hex');
const fixture={'temporal-manifest.json':JSON.stringify({version:1,artifactHash:hash,buildId:`ack-${hash}`}),'temporal-service.cjs':bytes.service,'temporal-workflow.cjs':bytes.workflow,'pnpm-lock.yaml':bytes.lock};
test('mutable image names refuse before Docker; changed image identity and symlink/corrupt artifact extraction refuse',async()=>{
 let calls=0;await expect(inspectedWorkerArtifact('image:latest',()=>{calls++;})).rejects.toThrow();expect(calls).toBe(0);
 for(const mode of ['identity','manifest','symlink']){
  let label,removed=false;
  const image=`sha256:${'a'.repeat(64)}`;
  const docker=(...args)=>{
   if(args[0]==='image')return JSON.stringify([{Id:image,Os:'linux',Architecture:'amd64',Config:{}}]);
   if(args[0]==='create'){label=args[args.indexOf('--label')+1].split('=')[1];return 'created';}
   if(args[0]==='inspect')return JSON.stringify([{Image:mode==='identity'?`sha256:${'b'.repeat(64)}`:image,Config:{Labels:{'looplabs.artifact.owner':label}},State:{Running:false}}]);
   if(args[0]==='cp'){
    const target=args[2],name=basename(target);
    if(mode==='symlink'&&name==='temporal-service.cjs')execFileSync('ln',['-s','/does-not-exist',target]);
    else writeFileSync(target,mode==='manifest'&&name==='temporal-manifest.json'?'{}':fixture[name]);return '';
   }
   if(args[0]==='rm'){removed=true;return '';}
   throw Error('Unexpected Docker operation');
  };
  await expect(inspectedWorkerArtifact(image,docker)).rejects.toThrow();expect(removed).toBe(true);
 }
});
test('actual nonexecuted image extraction enrolls bytes idempotently; changed digest and draining enrollment refuse without reactivation',async()=>{
 if(!process.env.LOOPLABS_TEST_DATABASE_URL)throw Error('Dedicated PostgreSQL required; never skip enrollment proof.');
 const suffix=randomBytes(8).toString('hex'),schema=`artifact_${suffix}`,tag=`ll-artifact-fixture:${suffix}`,owner=randomBytes(24).toString('hex');
 const dir=await mkdtemp(resolve(tmpdir(),'ll-enroll-test-')),admin=new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL});let db,image,otherImage,limited;const role=`artifact_role_${suffix}`;let roleCreated=false;
 const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}).trim();
 try{
  mkdirSync(resolve(dir,'.worker'));
  for(const [name,value] of Object.entries(fixture))writeFileSync(resolve(dir,name==='pnpm-lock.yaml'?name:`.worker/${name}`),value);
  await writeFile(resolve(dir,'Dockerfile'),`FROM scratch\nLABEL looplabs.enrollment.fixture=${owner}\nCOPY .worker /app/.worker\nCOPY pnpm-lock.yaml /app/pnpm-lock.yaml\n`);
  docker('build','--platform','linux/amd64','--network','none','-t',tag,dir);image=docker('image','inspect',tag,'--format','{{.Id}}');
  const artifact=await inspectedWorkerArtifact(image,docker);expect(artifact.buildId).toBe(`ack-${hash}`);
  expect(artifact.imageId).toBe(image);
  await admin.query(`CREATE SCHEMA ${schema}`);db=new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL,options:`-c search_path=${schema}`});
  await db.query('CREATE TABLE ll_temporal_record_routes(worker_build_id text)');
  await db.query(await readFile('lib/enquiries/worker-admission-schema.sql','utf8'));
  const migrationHash=createHash('sha256').update(await readFile('lib/enquiries/worker-admission-schema.sql')).digest('hex');
  await db.query('CREATE TABLE ll_migrations(version int PRIMARY KEY,digest text NOT NULL)');await db.query('INSERT INTO ll_migrations VALUES(14,$1)',[migrationHash]);
  await Promise.all([enrollInspectedWorker(db,image,docker),enrollInspectedWorker(db,image,docker)]);
  expect((await db.query('SELECT count(*)::int n FROM ll_temporal_worker_builds')).rows[0].n).toBe(1);
  docker('build','--platform','linux/amd64','--network','none','--label','looplabs.fixture.variant=second','-t',`${tag}-other`,dir);otherImage=docker('image','inspect',`${tag}-other`,'--format','{{.Id}}');
  expect(otherImage).not.toBe(image);await expect(enrollInspectedWorker(db,otherImage,docker)).rejects.toThrow('Enrollment conflict');
  await admin.query(`CREATE ROLE ${role} NOLOGIN`);roleCreated=true;await db.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);await db.query(`GRANT SELECT ON ll_temporal_worker_builds,ll_migrations TO ${role}`);
  limited=new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL,options:`-c search_path=${schema} -c role=${role}`});
  await expect(enrollInspectedWorker(limited,image,docker)).rejects.toThrow('Registry owner connection required');

  await db.query("UPDATE ll_migrations SET digest='corrupt' WHERE version=14");await expect(enrollInspectedWorker(db,image,docker)).rejects.toThrow('Exact admission migration');
  await db.query('UPDATE ll_migrations SET digest=$1 WHERE version=14',[migrationHash]);
  await db.query("UPDATE ll_temporal_worker_builds SET state='draining',draining_at=now()");
  await expect(enrollInspectedWorker(db,image,docker)).rejects.toThrow('cannot reactivate');
  expect((await db.query('SELECT state FROM ll_temporal_worker_builds')).rows[0].state).toBe('draining');
 }finally{
  await limited?.end();await db?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);if(roleCreated){await admin.query(`DROP OWNED BY ${role}`);await admin.query(`DROP ROLE ${role}`);}await admin.end();
  for(const id of [otherImage,image].filter(Boolean)){const actual=JSON.parse(docker('image','inspect',id))[0];expect(actual.Config.Labels['looplabs.enrollment.fixture']).toBe(owner);docker('image','rm',id);}
  await rm(dir,{recursive:true,force:true});
 }
},30000);
