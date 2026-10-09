import {test,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {resetPlatform} from './staging-reset-source.mjs';
import {bootstrapResetAssembly} from './staging-reset-bootstrap.mjs';
test('strict reset extension enrolls before the actual archive without replacing existing acceptance',async()=>{
 const original=await readFile('scripts/staging-platform-proof.mjs','utf8');
 const source=resetPlatform(original,'.drain-host-a1-b2.mjs');
 expect(source.indexOf('await bootstrapResetAssembly')).toBeLessThan(source.indexOf('"pg_dump"'));
 for(const text of ['restoreContainment','semanticLifecycle','semanticAdmission','workspace-recovery.ts','quarantine();quarantine();'])expect(source).toContain(text);
 expect(source).toContain('resetAssembly,semanticLifecycle');
 expect(source).toContain('workerContain();workerContain();');expect(source).toContain('2 retained builds draining.');
 expect(()=>resetPlatform(original+'\n const database=resolve(application,"database");','.drain-host-a1-b2.mjs')).toThrow('ambiguous');
 expect(()=>resetPlatform(original.replace(' const database=resolve(application,"database");','moved'),'.drain-host-a1-b2.mjs')).toThrow('missing');
});
test('reset host refuses missing opt-in before Docker or owner configuration',async()=>{
 const previous=process.env.LOOPLABS_STAGING_RESET_PROOF;delete process.env.LOOPLABS_STAGING_RESET_PROOF;
 try{await expect(bootstrapResetAssembly({})).rejects.toThrow();}finally{if(previous!==undefined)process.env.LOOPLABS_STAGING_RESET_PROOF=previous;}
});

test('reset controller and host add actual response-loss and distinct owner-process checkpoints',async()=>{
 const {resetController,resetHost}=await import('./staging-reset-source.mjs');
 const controller=await readFile('scripts/staging-semantic-controller.mjs','utf8'),host=await readFile('scripts/staging-semantic-host.mjs','utf8');
 const c=resetController(controller),h=resetHost(host,'scripts/.drain-controller-a1-b2.mjs');
 for(const text of ['reset-request','completedResetRequest','pinnedBuild','resetEvidence.effects,effects','approved_by===reviewer.subject','a.reserved===1','post-replay-provider-readback'])expect(c).toContain(text);
 expect(h).toContain('await resetOwner("dispatch")');expect(h).toContain('await resetOwner("reconcile")');
 expect(h).toContain('assert.deepEqual(state().effects,beforeReset');expect(h).toContain('await until(()=>ownerExit!==null)');
 expect(h).toContain('resetEvidence:receipt.resetEvidence');expect(h).toContain('admissionFence:receipt.admissionFence');
 expect(()=>resetController(controller.replace(' await mark("post-replay-effects-ready",{});','moved'))).toThrow('missing');
 expect(()=>resetHost(host+'\n  phase="replay";await checkpoint("post-replay-effects-ready");','scripts/.drain-controller-a1-b2.mjs')).toThrow('ambiguous');
});
