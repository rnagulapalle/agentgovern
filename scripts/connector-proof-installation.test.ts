import { afterAll, beforeAll, expect, test } from 'vitest';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { createInstalledTenantFixture } from '../lib/workspace/installed-tenant-fixture';
import { assertTenantPool } from '../lib/durable/tenant-pool';
import { proofChildEnvironment, proofWorkerInstallation, stopProofChild } from './connector-proof-installation';
let fixture:Awaited<ReturnType<typeof createInstalledTenantFixture>>;
beforeAll(async()=>{fixture=await createInstalledTenantFixture({tenants:['connector-proof-own','connector-proof-foreign'],salesOrg:'connector-proof-own',seed:async()=>{}});},30000);
afterAll(async()=>{await fixture?.close();},30000);
test('sealed single worker loads real restricted identity and refuses scheduler/foreign selection',async()=>{
 const publication=await fixture.publication('connector-proof-own','worker');
 const pool=await proofWorkerInstallation(publication);
 try{
  const bound=await assertTenantPool(pool,'connector-proof-own');expect(bound.purpose).toBe('worker');
  await expect(assertTenantPool(pool,'connector-proof-foreign')).rejects.toMatchObject({status:403});
  await expect(pool.query("INSERT INTO ll_members(org_id,email,name,password_hash) VALUES('connector-proof-own','forged@example.test','Forged','unused')")).rejects.toMatchObject({code:'42501'});
  expect((await pool.query('SELECT id FROM ll_orgs ORDER BY id')).rows).toEqual([{id:'connector-proof-own'}]);
 }finally{await pool.end();}
 await expect(proofWorkerInstallation(await fixture.publication('connector-proof-own','scheduler'))).rejects.toThrow('Single worker');
 await expect(fixture.publication('missing','worker')).rejects.toThrow();
});
test('child environment carries no inherited owner/model/config credentials',()=>{
 expect(proofChildEnvironment({PUBLICATION:'/owned/file'})).not.toHaveProperty('LOOPLABS_TEST_DATABASE_URL');
 expect(Object.keys(proofChildEnvironment({PUBLICATION:'/owned/file'})).sort()).toEqual(['HOME','NODE_ENV','PATH','PUBLICATION']);
 expect(proofChildEnvironment({PUBLICATION:'/owned/file'}).HOME).toBe(process.env.HOME);
 expect(()=>proofChildEnvironment({HOME:'/wrong'})).toThrow('Reserved');
 expect(()=>proofChildEnvironment({NODE_ENV:'production'})).toThrow('Reserved');
});
test('owned process termination is awaited without process-name or shared listener mutations',async()=>{
 const child=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{env:proofChildEnvironment({}),stdio:'ignore'});
 await new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
 await stopProofChild(child,'SIGKILL');expect(child.exitCode!==null||child.signalCode!==null).toBe(true);
 await stopProofChild(child);
});
test('genuine scoped web publication can bootstrap a separate child and closes owned pools',async()=>{
 const file=await fixture.publication('connector-proof-own','web');await access(file);
 const child=spawn(process.execPath,['--import','tsx','-e',`const {proofWebInstallation}=require('./scripts/connector-proof-installation.ts');proofWebInstallation(process.env.PUBLICATION).then(async i=>{const r=await i.context.sales();const v=await r.query('SELECT id FROM ll_orgs');if(v.rows.length!==1||v.rows[0].id!=='connector-proof-own')throw Error('scope');await i.close();}).catch(()=>process.exitCode=1);`],{env:proofChildEnvironment({PUBLICATION:file}),stdio:'ignore'});
 const exit=await new Promise<number|null>((resolve,reject)=>{const t=setTimeout(()=>{void stopProofChild(child,'SIGKILL').then(()=>reject(Error('Bounded child readiness')));},10000);child.once('error',e=>{clearTimeout(t);reject(e);});child.once('exit',n=>{clearTimeout(t);resolve(n);});});expect(exit).toBe(0);
},15000);
