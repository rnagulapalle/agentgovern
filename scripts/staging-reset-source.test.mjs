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
 expect(()=>resetPlatform(original+'\n const database=resolve(application,"database");','.drain-host-a1-b2.mjs')).toThrow('ambiguous');
 expect(()=>resetPlatform(original.replace(' const database=resolve(application,"database");','moved'),'.drain-host-a1-b2.mjs')).toThrow('missing');
});
test('reset host refuses missing opt-in before Docker or owner configuration',async()=>{
 const previous=process.env.LOOPLABS_STAGING_RESET_PROOF;delete process.env.LOOPLABS_STAGING_RESET_PROOF;
 try{await expect(bootstrapResetAssembly({})).rejects.toThrow();}finally{if(previous!==undefined)process.env.LOOPLABS_STAGING_RESET_PROOF=previous;}
});
