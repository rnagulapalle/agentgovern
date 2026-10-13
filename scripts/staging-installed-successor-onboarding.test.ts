import {describe,it,expect} from 'vitest';
import {mkdtemp,mkdir,symlink,rm,access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {successorAdministrationRequest,onboardInstalledQuoteSuccessor} from './staging-installed-successor-onboarding';
const request=()=>({acknowledgement:'INVITE_NEW_MEMBERS_AND_REVIEW_NEW_SCOPE_AFTER_CONTAINMENT',archiveSha256:'a'.repeat(64),recoveryEpoch:'11111111-1111-4111-8111-111111111111'});
describe('explicit administrator successor boundary',()=>{
 it('requires deliberate separate new-scope/new-member acknowledgment and exact recorded archive/epoch',()=>expect(successorAdministrationRequest(request())).toEqual(request()));
 const mutations:Record<string,(v:Record<string,unknown>)=>void>={'missing acknowledgement':v=>{delete v.acknowledgement;},'automatic restore authority':v=>{v.acknowledgement='AUTO_ACTIVATE';},'supplied pass':v=>{v.passed=true;},'wrong archive':v=>{v.archiveSha256='abc';},'malformed epoch':v=>{v.recoveryEpoch='old';}};
 for(const [name,change]of Object.entries(mutations))it('refuses '+name,()=>{const v:Record<string,unknown>=request();change(v);expect(()=>successorAdministrationRequest(v)).toThrow();});
});

it('refuses existing non-private or symlinked parents before SQL, invitation or provider mutations',async()=>{
 const root=await mkdtemp(join(tmpdir(),'ll-successor-parent-'));try{const privateParent=join(root,'private'),loose=join(root,'loose'),alias=join(root,'alias');await mkdir(privateParent,{mode:0o700});await mkdir(loose,{mode:0o755});await symlink(privateParent,alias);let queries=0;const owner={query:async()=>{queries++;throw Error('Unexpected SQL before path admission');}};
  for(const parent of [loose,alias]){const input={owner,providerOwner:owner,request:request(),publication:{owner},output:join(parent,'operation')} as unknown as Parameters<typeof onboardInstalledQuoteSuccessor>[0];await expect(onboardInstalledQuoteSuccessor(input)).rejects.toThrow('Owned private operation parent required');await expect(access(input.output)).rejects.toThrow();}expect(queries).toBe(0);
 }finally{await rm(root,{recursive:true,force:true});}
});
