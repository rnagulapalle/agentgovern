// Versioned intake for genuine installed discovery measurements. No cloud/live
// execution or release authority is established by this unsigned local record.
import assert from "node:assert/strict";
import {constructInstalledDiscoveryRegistry as discoveryInstalledConstruction,validateInstalledProofConstruction} from './current-proof-source-registry.mjs';
export {discoveryInstalledSources} from './discovery-installed-source-contract.mjs';
const digest=/^[a-f0-9]{64}$/,uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const keys=(value,expected)=>assert.deepEqual(Object.keys(value).sort(),[...expected].sort());
export async function validateInstalledDiscovery({receipt,cleanup,pg,sourceHash,artifactHash,root=process.cwd()}) {
 keys(receipt,["version","construction","constructionRegistrySha256","installation","completedUtc","proof","browser","sourceFingerprints","compiledArtifacts","assertions","screenshots","notProved"]);
 assert.equal(typeof receipt.browser,"string");assert(receipt.browser.length>0);
 assert.equal(receipt.version,3);assert.equal(receipt.proof,"disposable-loopback-cloud-inventory-ui");assert(Number.isFinite(Date.parse(receipt.completedUtc)));
 validateInstalledProofConstruction(root);
 const construction=discoveryInstalledConstruction(root), sources=Object.keys(construction.sourceFingerprints);
 assert.deepEqual(receipt.construction,construction,"Current measured dependency graph changed");
 assert(digest.test(receipt.constructionRegistrySha256));
 assert.equal(await sourceHash("scripts/current-installed-proof-sources.json"),receipt.constructionRegistrySha256,"Construction registry bytes changed");
 keys(receipt.sourceFingerprints,sources);
 for(const file of sources){assert(digest.test(receipt.sourceFingerprints[file]));assert.equal(await sourceHash(file),receipt.sourceFingerprints[file],"Current discovery dependency changed: "+file);}
 assert.equal(typeof artifactHash,"function","Observed artifact byte verification required");
 keys(receipt.assertions,["threeProviderOwnerReviewSavedThroughUi", "ownerReviewReplayAndChangedDecisionRefused", "ownerReviewSurvivesMobileReload", "revokedOwnerRequiresRenewalWithoutAuthority", "foreignOwnerDirectoryAndReviewDenied", "azureMobile390SavedScanReadable", "azureUiScanPersistsThroughCliHttpFixture", "azureChangedBindingRefusedAndEvidencePreserved", "azureProviderMetadataMinimized", "projectScopesSavedThroughUi", "projectFixtureEvidenceSurvivesReload", "projectNativeScanNotClaimed", "projectMobile390Readable", "projectCrossCompanyAndRevocationDenied", "anonymousDenied", "namedSignIn", "secureHttpOnlyCookie", "configuredIsNotObserved", "actualLocalCliFixtureScanPersisted", "refreshPersistence", "expiredBindingRefusedAndPriorEvidencePreserved", "mobileMenuClosesOnCurrentPageSelection", "mobile390NoOverflow", "mobileInputsAtLeast16px", "technicalReferencesExpandable", "noRawJson", "crossCompanyDenied", "revokedMemberDenied", "noExecutionAuthorityCreated", "ownedResourcesRemoved"]);assert(Object.values(receipt.assertions).every(x=>x===true));
 for(const field of ["namedSignIn","secureHttpOnlyCookie","foreignOwnerDirectoryAndReviewDenied","revokedMemberDenied","noExecutionAuthorityCreated","ownedResourcesRemoved"])assert.equal(receipt.assertions[field],true);
 assert.deepEqual(receipt.notProved,["Azure and Google native reads","AWS signing or real account discovery","trusted TLS ingress","live providers","reviewed cloud enrollment","mandatory action enforcement","enterprise readiness"]);
 keys(receipt.compiledArtifacts,[".next/server/app/control-plane/discovery/page.js", ".next/server/app/api/workspace/discovery/route.js", ".next/server/app/api/workspace/discovery/owners/route.js"]);assert(Object.values(receipt.compiledArtifacts).every(x=>digest.test(x)));
 keys(receipt.screenshots,["desktop.png","mobile.png","expired-access.png","azure-desktop.png","azure-mobile.png","project-desktop.png","project-mobile.png"]);assert(Object.values(receipt.screenshots).every(x=>digest.test(x)));
 for(const [file,expected] of Object.entries(receipt.compiledArtifacts))assert.equal(await artifactHash("compiled",file),expected,"Compiled artifact bytes changed: "+file);
 for(const [file,expected] of Object.entries(receipt.screenshots))assert.equal(await artifactHash("screenshot",file),expected,"Screenshot bytes changed: "+file);
 const i=receipt.installation;keys(i,["contract","schema","schemaOid","epochs","roles","normalProductionInstrumentation","currentEpochs","webRoles","webTLS"]);assert.equal(i.contract,"installed-discovery-boundary-1");assert.equal(i.normalProductionInstrumentation,true);assert(/^discovery_ui_[a-f0-9]{16}$/.test(i.schema));assert(/^[1-9][0-9]*$/.test(i.schemaOid));
 assert.equal(i.epochs.length,2);assert.equal(new Set(i.epochs.map(x=>x.org)).size,2);for(const e of i.epochs){keys(e,["org","epoch"]);assert(/^[-_a-zA-Z0-9]{1,64}$/.test(e.org));assert(uuid.test(e.epoch));}assert.deepEqual(i.currentEpochs,i.epochs,"Stale installation recovery epoch");
 assert.equal(i.roles.length,8);assert.equal(new Set(i.roles.map(x=>x.name)).size,8);assert.equal(new Set(i.roles.map(x=>x.oid)).size,8);for(const r of i.roles){keys(r,["name","oid"]);assert(/^llti_d[a-f0-9]{16}_(broker|definer|web_[01]|worker_[01]|scheduler_[01])$/.test(r.name));assert(/^[1-9][0-9]*$/.test(r.oid));}
 assert.deepEqual(i.roles.map(r=>r.name).sort(),["broker","definer","web_0","worker_0","scheduler_0","web_1","worker_1","scheduler_1"].map(suffix=>"llti_d"+i.schema.slice("discovery_ui_".length)+"_"+suffix).sort(),"Role inventory must belong to captured schema generation");
 const expected=i.roles.filter(r=>r.name.includes("_web_")).sort((a,b)=>a.name.localeCompare(b.name));assert.equal(expected.length,2);assert.equal(i.webRoles.length,2);assert.equal(i.webTLS.length,2);
 for(let n=0;n<2;n++){const r=i.webRoles[n],t=i.webTLS[n];keys(r,["name","oid","super","bypass","inherit"]);assert.equal(r.name,expected[n].name);assert.equal(r.oid,expected[n].oid);assert.equal(r.super,false);assert.equal(r.bypass,false);assert.equal(r.inherit,false);keys(t,["name","connections","verified_tls"]);assert.equal(t.name,r.name);assert(Number.isInteger(t.connections)&&t.connections>0);assert.equal(t.verified_tls,true);}
 assert.equal(cleanup.passed,true);assert.deepEqual(cleanup.capturedSchema,{name:i.schema,oid:i.schemaOid});assert.deepEqual(cleanup.capturedRoles,i.roles);assert.equal(cleanup.production,false);
 for(const field of ["pgReady","wrongPasswordRefused","plaintextRefused","ownedCleanupTerminal"])assert.equal(pg[field],true);assert.equal(pg.production,false);
 return Object.freeze({contract:"installed-discovery-intake-3",sourceCount:sources.length,assertions:30,historical:false,production:false});
}
