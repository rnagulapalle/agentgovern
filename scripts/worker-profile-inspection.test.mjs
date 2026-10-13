import {test,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {basename} from 'node:path';
import {workerArtifactProfile,profileArtifactBytes,inspectedWorkerArtifact,enrollInspectedWorker} from './worker-artifact-enrollment.mjs';
const service=Buffer.from('profile service bytes'),workflow=Buffer.from('profile workflow bytes'),lock=Buffer.from('locked dependencies');
const hash=createHash('sha256').update(service).update(workflow).update(lock).digest('hex');
const manifest=profile=>({version:1,artifactHash:hash,buildId:`${profile}-${hash}`});
test('profile selection is exact and default acknowledgement remains unchanged',()=>{
 expect(workerArtifactProfile()).toEqual({profile:'ack',prefix:'temporal'});
 expect(workerArtifactProfile('quote')).toEqual({profile:'quote',prefix:'quote-temporal'});
 for(const value of ['QUOTE','ack quote','',null,{},'refund'])expect(()=>workerArtifactProfile(value)).toThrow();
});
test('compiled profile identities bind exact service workflow and lock bytes',()=>{
 for(const profile of ['ack','quote']){
  expect(profileArtifactBytes(profile,manifest(profile),service,workflow,lock).buildId).toBe(`${profile}-${hash}`);
  expect(()=>profileArtifactBytes(profile,manifest(profile==='ack'?'quote':'ack'),service,workflow,lock)).toThrow();
  for(const field of [0,1,2]){const bytes=[service,workflow,lock];bytes[field]=Buffer.from('changed');expect(()=>profileArtifactBytes(profile,manifest(profile),...bytes)).toThrow();}
  for(const m of [{...manifest(profile),version:2},{...manifest(profile),artifactHash:'0'.repeat(64)},{...manifest(profile),extra:true}])expect(()=>profileArtifactBytes(profile,m,service,workflow,lock)).toThrow();
 }
});
test('unknown profile refuses before inspecting Docker or opening registry owner connection',async()=>{
 let calls=0;const docker=()=>{calls++;};const db={connect(){calls++;}};
 await expect(inspectedWorkerArtifact(`sha256:${'a'.repeat(64)}`,docker,'other')).rejects.toThrow();
 await expect(enrollInspectedWorker(db,`sha256:${'a'.repeat(64)}`,docker,'other')).rejects.toThrow();expect(calls).toBe(0);
});
test('real inspector logic selects quote filenames and refuses mixed extracted bytes with owned cleanup (injected Docker operations, not image proof)',async()=>{
 for(const failure of ['manifest','workflow','lock']){
  const image=`sha256:${'a'.repeat(64)}`;let label,removed=false;const copied=[];
  const docker=(...args)=>{
   if(args[0]==='image')return JSON.stringify([{Id:image,Os:'linux',Architecture:'amd64',Config:{}}]);
   if(args[0]==='create'){label=args[args.indexOf('--label')+1].split('=')[1];return '';}
   if(args[0]==='inspect')return JSON.stringify([{Image:image,Config:{Labels:{'looplabs.artifact.owner':label}},State:{Running:false}}]);
   if(args[0]==='cp'){
    copied.push(args[1]);const name=basename(args[2]);
    const values={'quote-temporal-manifest.json':JSON.stringify(manifest(failure==='manifest'?'ack':'quote')),'quote-temporal-service.cjs':service,'quote-temporal-workflow.cjs':failure==='workflow'?'changed':workflow,'pnpm-lock.yaml':failure==='lock'?'changed':lock};
    expect(Object.hasOwn(values,name)).toBe(true);writeFileSync(args[2],values[name]);return '';
   }
   if(args[0]==='rm'){removed=true;return '';}
   throw Error('Unexpected inspection operation');
  };
  await expect(inspectedWorkerArtifact(image,docker,'quote')).rejects.toThrow();expect(removed).toBe(true);
  expect(copied.filter(x=>x.includes('/.worker/')).every(x=>x.includes('/quote-temporal-'))).toBe(true);
 }
});
test('Docker targets retain a constant default acknowledgement and explicit quote launcher without environment-based command selection',async()=>{
 const dockerfile=await readFile('Dockerfile.temporal','utf8');
 expect(dockerfile).toContain('ARG LOOPLABS_WORKER_PROFILE=ack');
 expect(dockerfile).toContain('RUN node scripts/build-temporal-worker.mjs "$LOOPLABS_WORKER_PROFILE"');
 expect(dockerfile).toContain('FROM runtime-common AS quote-runtime');
 expect(dockerfile).toContain('CMD ["node", ".worker/quote-temporal-service.cjs", "worker", "quote"]');
 expect(dockerfile.trim().endsWith('CMD ["node", ".worker/temporal-service.cjs", "worker"]')).toBe(true);
 expect(dockerfile).not.toContain('CMD ["sh"');
});
test('released ACK-only registry cannot silently admit a quote profile (actual dedicated PostgreSQL, inert extracted bytes only)',async()=>{
 const {Pool}=await import('pg');const {mkdtemp,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {resolve}=await import('node:path');const {randomBytes}=await import('node:crypto');const {enrollExtractedWorker}=await import('./worker-artifact-enrollment.mjs');
 if(!process.env.LOOPLABS_TEST_DATABASE_URL)throw Error('Dedicated PostgreSQL required');
 const schema='quote_artifact_'+randomBytes(8).toString('hex');const admin=new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL});let db;const directory=await mkdtemp(resolve(tmpdir(),'ll-quote-extracted-'));const prior=process.env.LOOPLABS_STAGING_DRAIN_PROOF;
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);db=new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL,options:`-c search_path=${schema}`});
  await db.query('CREATE TABLE ll_temporal_record_routes(worker_build_id text)');const sql=await readFile('lib/enquiries/worker-admission-schema.sql');await db.query(sql.toString());await db.query('CREATE TABLE ll_migrations(version integer PRIMARY KEY,digest text NOT NULL)');await db.query('INSERT INTO ll_migrations VALUES(14,$1)',[createHash('sha256').update(sql).digest('hex')]);
  for(const [name,value]of Object.entries({'quote-temporal-manifest.json':JSON.stringify(manifest('quote')),'quote-temporal-service.cjs':service,'quote-temporal-workflow.cjs':workflow,'pnpm-lock.yaml':lock}))await writeFile(resolve(directory,name),value,{mode:0o600});
  process.env.LOOPLABS_STAGING_DRAIN_PROOF='isolated';await expect(enrollExtractedWorker(db,`sha256:${'a'.repeat(64)}`,directory,'quote')).rejects.toMatchObject({code:'23514'});
  expect((await db.query('SELECT count(*)::int n FROM ll_temporal_worker_builds')).rows[0].n).toBe(0);
 }finally{if(prior===undefined)delete process.env.LOOPLABS_STAGING_DRAIN_PROOF;else process.env.LOOPLABS_STAGING_DRAIN_PROOF=prior;await db?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();await rm(directory,{recursive:true,force:true});}
},10000);
