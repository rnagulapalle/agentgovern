import {describe,it,expect} from 'vitest';
import {validateInstalledAssemblyTarget} from './staging-installed-database-bootstrap';
import {prepareCurrentInstalledAssembly} from './staging-installed-assembly-coordinator.mjs';
describe('private installed assembly preparation refusals',()=>{
 const valid={url:'postgresql://owned:fixture@localhost:5432/isolated',transport:{mode:'verified-tls',trust:'standard'} as const,directory:'/private/owned'};
 it('requires genuine TLS and exact isolated target shape before SQL',()=>{
  expect(validateInstalledAssemblyTarget(valid)).toEqual({database:'isolated'});
  for(const value of [{...valid,transport:{mode:'loopback-plaintext-test-fixture'}},{...valid,url:'postgresql://owned:fixture@application-db:5432/isolated'},{...valid,url:'postgresql://owned:fixture@localhost:5432/isolated?sslmode=disable'},{...valid,directory:'relative'},{...valid,eligible:true}])expect(()=>validateInstalledAssemblyTarget(value as typeof valid)).toThrow();
 });
 it('cannot accept caller eligible state or verifier callback as coordinator authority',async()=>{
  await expect(prepareCurrentInstalledAssembly({source:{},database:{},verifyCurrentImage:()=>({eligible:true})})).rejects.toThrow();
  await expect(prepareCurrentInstalledAssembly({source:{eligible:true},database:{}})).rejects.toThrow();
 });
});
