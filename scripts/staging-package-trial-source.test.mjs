import {test,expect} from "vitest";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {retainedPackageTrial} from "./staging-package-trial-source.mjs";
import {withPendingPackageBrowser} from "./staging-package-browser.mjs";
import {loadPackageReleases} from "./staging-package-releases.mjs";
import {vi} from "vitest";
const parent=readFileSync("scripts/staging-platform-proof.mjs","utf8");
test("retained trial preserves existing runtime/typed/TLS/restore gates, adds two pending transitions, and removes building",()=>{
 const source=retainedPackageTrial(parent);
 for(const required of ['stage="host-admission"','stage="runtime-crash"','stage="approved-archive"','stage="archive-restore-containment"','stage="restored-packaged-role-refusal"','stage="restored-omitted-epoch-refusal"','quarantine();quarantine();','await stagingBrowserProof(trial,{typedPlanning})','assert.equal(Object.keys(provider.effects).length,4)','assert.equal(schemaExecutions,6)','await assertPending();','[[0,1],[1,0]]','Every loaded release image must be removed'])expect(source).toContain(required);
 expect(source).not.toContain('imageBuilder.start()');expect(source).not.toContain('imageBuilder.build(');
 expect(source).toContain('pendingPackageBrowser=await withPendingPackageBrowser');
 expect(source).toContain('packageTransitions.push(switched.evidence);await verifyUI();');
 const checked=spawnSync(process.execPath,["--check","--input-type=module"],{input:source,encoding:"utf8",timeout:10000});expect(checked.status).toBe(0);
});
test("pending browser refuses ordinary invocation before certificate or profile changes",async()=>{
 if(process.platform==="linux"&&process.env.GITHUB_ACTIONS==="true"&&process.env.LOOPLABS_STAGING_PACKAGE_PROOF==="isolated")throw Error("Unit fixture must not be run as an admitted browser trial");
 await expect(withPendingPackageBrowser("/not-a-profile",()=>{})).rejects.toThrow("Fresh isolated Linux CI required");
});
test("malformed retained release input is refused before Docker and produces only a fixed sanitized checkpoint",async()=>{
 const diagnostic=vi.spyOn(console,"error").mockImplementation(()=>{}),calls=[];
 try{await expect(loadPackageReleases(["private-credential-input"],(...a)=>calls.push(a),[])).rejects.toThrow();expect(calls).toEqual([]);expect(diagnostic.mock.calls).toEqual([["Package release input refused at directories; no raw artifact or Docker error printed."]]);}finally{diagnostic.mockRestore();}
});
test("changed, missing or duplicated parent anchors refuse instrumentation",()=>{
 for(const anchor of ['const docker=(...args)=>','let schemaExecutions=0;',' stage="images";imageBuilder.start();',' imageBuilder.close();\n const build=',' await checkpoint("held.json");',' outcome={...result,restoreContainment,dependencyImages,','if(outcome&&!process.exitCode){']){
  expect(()=>retainedPackageTrial(parent.replace(anchor,"changed"))).toThrow();expect(()=>retainedPackageTrial(parent+"\n"+anchor)).toThrow();
 }
 expect(()=>retainedPackageTrial(null)).toThrow();
});
test("actual drill refuses ordinary local invocation without Docker or exposing inputs",()=>{
 const child=spawnSync(process.execPath,["scripts/staging-package-proof.mjs"],{env:{PATH:process.env.PATH},encoding:"utf8",timeout:10000});expect(child.status).toBe(1);expect(child.stdout).toBe("");expect(child.stderr.trim()).toBe("Retained package drill refused; no raw runtime output, payload or credentials printed.");
});
