import {describe,it,expect} from 'vitest';
import {assertWebRecoveryDeployment} from './web-recovery-deployment';
const old='10000000-0000-4000-8000-000000000001',rotated='10000000-0000-4000-8000-000000000002';
describe('web deployment external epoch consistency',()=>{
 const entries=[{org:'one',epoch:old},{org:'two',epoch:rotated}];
 it('retains sealed per-workspace authority and accepts an exact explicit deployment fence',()=>{
  expect(()=>assertWebRecoveryDeployment(entries,{})).not.toThrow();
  expect(()=>assertWebRecoveryDeployment(entries,{LOOPLABS_WORKSPACE_ID:'one',LOOPLABS_RECOVERY_EPOCH:old})).not.toThrow();
 });
 it('refuses rotated, omitted, malformed, duplicate and unknown deployment fences',()=>{
  for(const env of [{LOOPLABS_WORKSPACE_ID:'one',LOOPLABS_RECOVERY_EPOCH:rotated},{LOOPLABS_WORKSPACE_ID:'one'},{LOOPLABS_RECOVERY_EPOCH:old},{LOOPLABS_WORKSPACE_ID:'unknown',LOOPLABS_RECOVERY_EPOCH:old},{LOOPLABS_WORKSPACE_ID:'one',LOOPLABS_RECOVERY_EPOCH:'invalid'}])expect(()=>assertWebRecoveryDeployment(entries,env)).toThrow();
  expect(()=>assertWebRecoveryDeployment([entries[0],entries[0]],{LOOPLABS_WORKSPACE_ID:'one',LOOPLABS_RECOVERY_EPOCH:old})).toThrow();
 });
});
