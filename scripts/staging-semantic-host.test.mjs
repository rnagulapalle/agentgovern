import {test,expect} from "vitest";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {semanticHostContract} from "./staging-semantic-host.mjs";
import {semanticPlatformTrial} from "./staging-semantic-trial-source.mjs";
const project="ll-platform-012345abcdef";
const input={project,trial:"/tmp/ll-platform-example/trial",privateDir:"/tmp/ll-platform-example/runtime",images:{baseline:`${project}:worker`,incompatible:`${project}:incompatible`,twin:`${project}:twin`,controller:`${project}:provisioner`},database:"a".repeat(64),temporal:"b".repeat(64)};
test("semantic Docker ownership rejects shared names, same database/service, unbounded paths or unrelated image tags",()=>{
 expect(semanticHostContract(input).memory.worker).toBe(768*1024**2);
 for(const bad of [{...input,project:"production"},{...input,trial:"/tmp/a,readonly"},{...input,privateDir:"/tmp/../private"},{...input,database:input.temporal},{...input,images:{...input.images,twin:"shared:latest"}},{...input,images:{...input.images,incompatible:input.images.baseline}},{...input,images:{...input.images,extra:`${project}:extra`}}])expect(()=>semanticHostContract(bad)).toThrow();
});
test("derived trial adds explicit peak admission and real semantic checkpoints without replacing original browser/crash/restore gates",()=>{
 const original=readFileSync("scripts/staging-platform-proof.mjs","utf8"),derived=semanticPlatformTrial(original);
 for(const retained of ['stage="runtime-crash"','stage="approved-archive"','stage="application-archive-restore"','stage="restored-packaged-role-refusal"','stage="offline-restore-quarantine"','stage="browser-https"','actualProviderEffects:4','hostReserveBytes:(browserEnabled?2:1)*1024**3'])expect(derived).toContain(retained);
 expect(derived).toContain('LOOPLABS_VERSION_CASE=incompatible');expect(derived).toContain('role==="worker"?768*1024**2:0');
 expect(derived.indexOf('stage="semantic-worker-lifecycle"')).toBeLessThan(derived.indexOf('stage="archive-restore-containment"'));
 expect(spawnSync(process.execPath,["--check","--input-type=module"],{input:derived,encoding:"utf8"}).status).toBe(0);
 for(const bad of [null,original+original,original.replace(' stage="archive-restore-containment";','')])expect(()=>semanticPlatformTrial(bad)).toThrow();
});
test("full proof refuses before Docker or private inputs without fresh isolated CI opt-in",()=>{
 const r=spawnSync(process.execPath,["scripts/staging-semantic-proof.mjs"],{env:{PATH:process.env.PATH},encoding:"utf8",timeout:10000});
 expect(r.status).toBe(1);expect(r.stdout).toBe("");expect(r.stderr.trim()).toBe("Full isolated semantic proof refused; no raw child output, history or credentials printed.");
});
