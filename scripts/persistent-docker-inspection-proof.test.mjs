import {describe,it,expect,vi} from 'vitest';
vi.mock('node:child_process',()=>({execFileSync:vi.fn(),execFile:vi.fn()}));
import {execFileSync} from 'node:child_process';
const valid={GITHUB_ACTIONS:'true',LOOPLABS_DOCKER_INSPECTION_PROOF:'isolated-fixture',GITHUB_RUN_ID:'12345',GITHUB_SHA:'a'.repeat(40)};
import {assertInspectionFixtureHost,inspectionFixtureProof} from './persistent-docker-inspection-proof.mjs';
describe('actual Docker fixture admission guards only',()=>{
 it.each([{env:{}},{env:{GITHUB_ACTIONS:'true'}},{env:{LOOPLABS_DOCKER_INSPECTION_PROOF:'isolated-fixture'}},{env:{GITHUB_ACTIONS:'true',LOOPLABS_DOCKER_INSPECTION_PROOF:'true'}},{platform:'darwin'},{arch:'arm64'},{env:{...valid,GITHUB_RUN_ID:'-1'}},{env:{...valid,GITHUB_RUN_ID:'0'}},{env:{...valid,GITHUB_SHA:'not-head'}}])('refuses unsupported admission before Docker',input=>{
  expect(()=>assertInspectionFixtureHost(input.env??valid,input.platform??'linux',input.arch??'x64')).toThrow('Explicit isolated');expect(execFileSync).not.toHaveBeenCalled();
 });
 it('recognizes the guard contract without claiming Docker was exercised',()=>{expect(()=>assertInspectionFixtureHost(valid,'linux','x64')).not.toThrow();expect(execFileSync).not.toHaveBeenCalled();});
 it('uses actual process admission, refusing missing explicit opt-in without Docker operations',async()=>{vi.stubEnv('LOOPLABS_DOCKER_INSPECTION_PROOF','');try{await expect(inspectionFixtureProof()).rejects.toThrow('Explicit isolated');expect(execFileSync).not.toHaveBeenCalled();}finally{vi.unstubAllEnvs();}});
});
