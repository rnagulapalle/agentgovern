import {mkdtemp,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {describe,it,expect} from 'vitest';
import {assertOwnedStagingResource,withOwnedInstalledStagingFixture,waitForOwnedSessionDrain,retainStagingFailure} from './staging-owned-installed-fixture.mjs';
describe('owned installed gate retirement identity',()=>{
 it('refuses a missing controller before allocating resources',async()=>await expect(withOwnedInstalledStagingFixture(null)).rejects.toThrow());
 it('matches the actual resource ID and nonce before retirement',()=>expect(()=>assertOwnedStagingResource({Id:'actual-id',Labels:{'looplabs.owned-staging':'nonce'}},'actual-id','nonce')).not.toThrow());
 it('refuses a replacement resource with the same name',()=>expect(()=>assertOwnedStagingResource({Id:'replacement',Labels:{'looplabs.owned-staging':'nonce'}},'original','nonce')).toThrow());
 it('refuses missing ownership label',()=>expect(()=>assertOwnedStagingResource({Id:'actual-id',Labels:{}},'actual-id','nonce')).toThrow());
 it('refuses another run ownership nonce',()=>expect(()=>assertOwnedStagingResource({Id:'actual-id',Labels:{'looplabs.owned-staging':'other'}},'actual-id','nonce')).toThrow());
});

describe('observed drain and restricted failure retention',()=>{
 it('waits for the actual observation to reach exactly zero',async()=>{let calls=0;const db={query:async()=>({rows:[{n:[2,1,0][calls++]}]})};expect(await waitForOwnedSessionDrain(db,['owned_worker'],async()=>{})).toBe(0);expect(calls).toBe(3);});
 it('refuses a persistent session after the fixed bounded observations',async()=>{let calls=0;const db={query:async()=>{calls++;return{rows:[{n:1}]};}};await expect(waitForOwnedSessionDrain(db,['owned_worker'],async()=>{})).rejects.toThrow('did not drain');expect(calls).toBe(100);});
 it('retains the private fixture and restricted primary diagnostics',async()=>{const dir=await mkdtemp(join(tmpdir(),'looplabs-staging-retention-test-'));try{await writeFile(join(dir,'marker'),'original',{mode:0o600});await retainStagingFailure(dir,'primary',Error('request refused https://private.example.test/token and longsecret'.padEnd(100,'x')));expect(await readFile(join(dir,'marker'),'utf8')).toBe('original');const file=join(dir,'primary-failure.json');expect((await stat(file)).mode&0o777).toBe(0o600);const observed=await readFile(file,'utf8');expect(observed).toContain('request refused');expect(observed).not.toContain('private.example.test');expect(observed).not.toContain('longsecret');}finally{await rm(dir,{recursive:true,force:true});}});
});
