// Optional isolated owner: enroll the exact retained pair before taking an archive.
import assert from 'node:assert/strict';
import {lstat,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {semanticArtifact,semanticPair} from './temporal-semantic-replay.mjs';
import {enrollExtractedWorker} from './worker-artifact-enrollment.mjs';
export async function resetAssemblyArtifacts(directories,images){
 assert.equal(process.env.LOOPLABS_STAGING_RESET_PROOF,'isolated');
 assert(Array.isArray(directories)&&directories.length===2);
 assert(Array.isArray(images)&&images.length===2&&images[0]!==images[1]);
 const artifacts=[];
 for(const [i,directory] of directories.entries()){
  assert(/^sha256:[a-f0-9]{64}$/.test(images[i]));
  assert(typeof directory==='string'&&directory.startsWith('/')&&!directory.includes('..')&&!/[\r\n\0,]/.test(directory));
  const root=await lstat(directory);assert(root.isDirectory()&&!root.isSymbolicLink());
  for(const file of ['temporal-manifest.json','temporal-service.cjs','temporal-workflow.cjs','pnpm-lock.yaml']){
   const stat=await lstat(resolve(directory,file));assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=64*1024**2);
  }
  artifacts.push(await semanticArtifact(directory));
 }
 return semanticPair(artifacts);
}
export async function enrollResetAssembly(db,directories,images){
 const artifacts=await resetAssemblyArtifacts(directories,images);
 assert.equal(process.env.LOOPLABS_STAGING_DRAIN_PROOF,'isolated');
 // Fail before enrollment if reset schema or owner separation is missing.
 const expected=createHash('sha256').update(await readFile('lib/enquiries/reset-intent-schema.sql')).digest('hex');
 const c=await db.connect();
 try{
  const row=(await c.query("SELECT m.digest,pg_get_userbyid(t.relowner)=current_user owned FROM ll_migrations m JOIN pg_class t ON t.oid=to_regclass('ll_temporal_reset_intents') WHERE m.version=15")).rows;
  assert(row.length===1&&row[0].owned===true&&row[0].digest===expected,'Exact owner-installed reset boundary required');
 }finally{c.release();}
 const saved=[];
 for(let i=0;i<2;i++){const value=await enrollExtractedWorker(db,images[i],directories[i]);assert.equal(value.buildId,artifacts[i].buildId);saved.push(value);}
 return {passed:true,builds:saved.map(a=>a.buildId),images:[...images],resetIntents:(await db.query('SELECT count(*)::int n FROM ll_temporal_reset_intents')).rows[0].n};
}
