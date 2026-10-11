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
   expect(error.code).toBe(1);expect(error.stdout).toBe('');expect(error.stderr).toBe('Reset owner refusal phase=inputs code=assertion\nIsolated reset owner refused; no raw database, history or credentials printed.\n');
  }
 }
});

import {resetOwnerDiagnostic,resetOwnerDiagnosticLine} from './reset-owner-diagnostic.mjs';
test('owner diagnostics disclose only fixed phase and numeric service or SQL code',()=>{
 const secret='postgres://private:password@host/raw-customer';
 for(const [code,expected] of [[7,'grpc-7'],['23514','sql-23514'],['ERR_ASSERTION','assertion'],[secret,'unclassified'],[17,'unclassified']]){
  const line=resetOwnerDiagnostic('intent-claim',{code,message:secret,detail:secret,stack:secret});
  expect(line).toBe(`Reset owner refusal phase=intent-claim code=${expected}`);
  expect(line).not.toContain(secret);expect(resetOwnerDiagnosticLine(line)).toBe(line);
 }
 expect(resetOwnerDiagnostic(secret,{code:7})).toBe('Reset owner refusal phase=inputs code=grpc-7');
 for(const line of ['Reset owner refusal phase=unknown code=grpc-7','Reset owner refusal phase=inputs code=grpc-17','Reset owner refusal phase=inputs code=grpc-7 '+secret,secret])expect(resetOwnerDiagnosticLine(line)).toBeNull();
 expect(resetOwnerDiagnosticLine(null)).toBeNull();
});
