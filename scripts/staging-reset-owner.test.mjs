import {test,expect} from 'vitest';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const command=promisify(execFile);
test('actual reset owner CLI refuses absent opt-in or unsupported mode without reading private input',async()=>{
 for(const [opt,mode] of [['','dispatch'],['isolated','retry']]){
  try{
   await command(process.execPath,['scripts/staging-reset-owner.mjs',mode],{env:{...process.env,LOOPLABS_STAGING_RESET_PROOF:opt,LOOPLABS_DATABASE_URL:'',LOOPLABS_TEMPORAL_WORKER_TOKEN:''},timeout:10000});
   throw Error('CLI unexpectedly accepted');
  }catch(error){
   expect(error.code).toBe(1);expect(error.stdout).toBe('');expect(error.stderr).toBe('Isolated reset owner refused; no raw database, history or credentials printed.\n');
  }
 }
});
