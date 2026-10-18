import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {decodeInstalledObservations2,requireInstalledReleaseReceipt2,validateInstalledObservationSources2,constructInstalledReleaseRegistry2,validateInstalledReleaseRegistry2} from './staging-installed-release-intake.mjs';
const bytes=readFileSync(new URL('./test-fixtures/installed-observations-2.json',import.meta.url));
const actual=()=>JSON.parse(bytes);
test('original actual24 six-image13-service bounded observations remain explicitly unaccepted',()=>{expect(createHash('sha256').update(bytes).digest('hex')).toBe('de27171c78c8f365b950dcdb6f219183e1aadd8263133f6fdb00be8a783d823e');expect(decodeInstalledObservations2(actual())).toMatchObject({services:13,releaseEligible:false,fullInstalledAcceptance:false});});
test.each([
 ['unknown credential field',r=>r.credentials={}],
 ['nested credential field',r=>r.quoteBrowser.credentials={}],
 ['missing quote email',r=>r.images.splice(3,1)],
 ['extra custom image',r=>r.images.push(r.images[0])],
 ['duplicate image identity',r=>r.images[3].id=r.images[0].id],
 ['old five-image ABI',r=>r.images.splice(3,1)],
 ['missing service',r=>r.services.pop()],
 ['failed health',r=>r.services[0].health='unhealthy'],
 ['blocked admission',r=>r.admission.blockers.push('memory')],
 ['restored authority revived',r=>r.quoteRestoreContainment.authorityReactivated=true],
 ['wrong archive identity',r=>r.quoteRestoreContainment.archiveSha256=r.restoreContainment.archiveSha256],
 ['missing quote restore',r=>delete r.quoteRestoreContainment],
 ['old cookies reused',r=>r.quoteRestoreContainment.oldNamedCookiesAndPasswordsRefused=false],
 ['email before quote effect',r=>r.quoteBrowser.providerObservations[4].mailEffects=1],
 ['changed verification action',r=>r.quoteBrowser.verificationReceipt.steps[0].actionId=r.quoteBrowser.messageActionId],
 ['same binding for both providers',r=>r.quoteBrowser.verificationReceipt.steps[1].binding=r.quoteBrowser.verificationReceipt.steps[0].binding],
 ['successor reactivates member',r=>r.quoteSuccessor.oldMemberAndApprovalAuthorityReactivated=true],
 ['unsupported live-effect claim',r=>r.quoteSuccessor.newProviderEffectIssued=true],
 ['promoted raw flag',r=>r.fullInstalledAcceptance=true],
])('refuses %s',(name,mutate)=>{const r=actual();mutate(r);expect(()=>decodeInstalledObservations2(r)).toThrow();});
test('real diagnostic refuses accepted intake without converting raw flags',()=>{expect(()=>requireInstalledReleaseReceipt2(actual())).toThrow('Diagnostic fullInstalledAcceptance:false');expect(actual().fullInstalledAcceptance).toBe(false);});
test('caller true claim cannot bypass missing genuine accepted producer',()=>{expect(()=>requireInstalledReleaseReceipt2({...actual(),fullInstalledAcceptance:true})).toThrow('not implemented');});
test('source intake refuses unknown key before current source work',async()=>{await expect(validateInstalledObservationSources2({credentials:{}})).rejects.toThrow();});
test('source intake refuses malformed closure and does not make observed run current',async()=>{await expect(validateInstalledObservationSources2({contract:'installed-generation-observation-intake-2',observations:actual(),construction:{},sourceBefore:{},sourceAfter:{},cleanup:{}})).rejects.toThrow();});
test.each([null,[],{}, {contract:'wrong',families:{},edges:[],directories:[],nonAstAssets:[],sourceFingerprints:{}}, {contract:'installed-platform-proof-source-1',families:{},edges:{},directories:[],nonAstAssets:[],sourceFingerprints:{}}, {contract:'installed-platform-proof-source-1',families:[],edges:[],directories:[],nonAstAssets:[],sourceFingerprints:{}}])('malformed registry shape refuses before filesystem traversal %#',construction=>{
 try{validateInstalledReleaseRegistry2(construction,'/missing/looplabs-malformed-construction');throw Error('Unexpected registry acceptance');}catch(error){expect(error.name).toBe('AssertionError');expect(error.code).not.toBe('ENOENT');}
});

test('existing base driver without optional held callback keeps same seven ordered observations',()=>{const r=actual();r.quoteBrowser.providerObservations.splice(2,1);expect(decodeInstalledObservations2(r).releaseEligible).toBe(false);});

// Several real filesystem/TypeScript dependency traversals are setup work, not
// a product response-time SLA. Keep all omission/change refusals unchanged.
test('successor construction includes full actual current producer/artifact/service/intake dependency bytes; omissions and alterations refuse',()=>{const r=constructInstalledReleaseRegistry2();for(const path of ['scripts/staging-platform-proof.mjs','scripts/staging-installed-release-intake.mjs','scripts/staging-image-artifact.mjs','scripts/worker-artifact-enrollment.mjs','scripts/staging-installed-service-observations.mjs'])expect(r.sourceFingerprints[path]).toMatch(/^[a-f0-9]{64}$/);expect(validateInstalledReleaseRegistry2(r)).toBe(true);const missing=structuredClone(r);delete missing.sourceFingerprints['scripts/staging-platform-proof.mjs'];expect(()=>validateInstalledReleaseRegistry2(missing)).toThrow();const changed=structuredClone(r);changed.sourceFingerprints['scripts/staging-image-artifact.mjs']='0'.repeat(64);expect(()=>validateInstalledReleaseRegistry2(changed)).toThrow();},30000);

test('recording entry point refuses non-CI before reading inputs or writing a receipt',async()=>{const {spawnSync}=await import('node:child_process');const result=spawnSync(process.execPath,['scripts/staging-installed-observation-record.mjs','/missing/private/input','/missing/private/output'],{env:{PATH:process.env.PATH},encoding:'utf8',timeout:10000});expect(result.status).toBe(1);expect(result.stdout).toBe('');expect(result.stderr.trim()).toBe('Current installed observation receipt refused; no credentials or raw result printed.');});
