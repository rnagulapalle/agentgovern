import {test,expect} from 'vitest';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {capturePendingResetArchive,restorePendingResetArchive} from './staging-reset-archive.mjs';
const command=promisify(execFile);
test('full archive helpers refuse missing opt-in before Docker or files',async()=>{
 const old=process.env.LOOPLABS_STAGING_RESET_PROOF;delete process.env.LOOPLABS_STAGING_RESET_PROOF;let called=false;
 try{for(const helper of [capturePendingResetArchive,restorePendingResetArchive])await expect(helper({docker(){called=true;}})).rejects.toThrow();expect(called).toBe(false);}finally{if(old!==undefined)process.env.LOOPLABS_STAGING_RESET_PROOF=old;}
});
test('copied restore owner refuses absent opt-in and the primary database before private files',async()=>{
 for(const opt of ['', 'isolated']){
  try{await command(process.execPath,['--import','tsx','scripts/staging-reset-restore-owner.mjs'],{env:{...process.env,LOOPLABS_STAGING_RESET_PROOF:opt,LOOPLABS_MIGRATION_DATABASE_URL:'postgresql://ll_stage_owner:fixture@application-db/looplabs_staging',LOOPLABS_DATABASE_URL:'',LOOPLABS_TEMPORAL_WORKER_TOKEN:''},timeout:10000});throw Error('Unexpected acceptance');}
  catch(error){expect(error.code).toBe(1);expect(error.stdout).toBe('');expect(error.stderr).toBe('Isolated pending-reset restore refused; no raw archive, authority or database error printed.\n');}
 }
});
test('complete reset entry point refuses before generating files without explicit isolated inputs',async()=>{
 try{await command(process.execPath,['scripts/staging-reset-proof.mjs'],{env:{PATH:process.env.PATH},timeout:10000});throw Error('Unexpected acceptance');}
 catch(error){expect(error.code).toBe(1);expect(error.stdout).toBe('');expect(error.stderr).toBe('Full isolated reset proof refused; no raw child output, history or credentials printed.\n');}
});
