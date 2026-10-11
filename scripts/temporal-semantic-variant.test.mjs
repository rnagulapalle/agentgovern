import {test,expect} from "vitest";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {semanticWorkflowVariant,semanticBuildSource} from "./temporal-semantic-variant.mjs";
const workflow=readFileSync("runtime/temporal/pinned-workflow.ts","utf8"),builder=readFileSync("scripts/build-temporal-worker.mjs","utf8");
const sha=createHash("sha256").update(workflow).digest("hex");
test("semantic fault injection adds an actual durable command before existing authority-checked activity",()=>{
 const variant=semanticWorkflowVariant(workflow,sha);
 expect(variant.sourceSha256).not.toBe(sha);expect(variant.baselineSha256).toBe(sha);
 expect(variant.source.indexOf('await sleep("1 second")')).toBeLessThan(variant.source.indexOf('await advanceContract(contract)'));
 expect(variant.source).toContain('await advanceContract(contract)');expect(variant.source).toContain('setHandler(wake');expect(variant.source).toContain('if (progress !== "waiting") return progress;');
});
test("changed baseline, ambiguous anchors and malformed inputs refuse semantic generation",()=>{
 for(const [source,hash] of [[workflow+"\n",sha],[workflow,"0".repeat(64)],[null,sha],[workflow,[sha]]])expect(()=>semanticWorkflowVariant(source,hash)).toThrow();
 const duplicate=workflow+workflow;expect(()=>semanticWorkflowVariant(duplicate,createHash("sha256").update(duplicate).digest("hex"))).toThrow();
 const changed=workflow.replace('export async function pinnedAcknowledgement','export async function another');expect(()=>semanticWorkflowVariant(changed,createHash("sha256").update(changed).digest("hex"))).toThrow();
});
test("variant build preserves service, lockfile and content-bound manifest pipeline; no normal build override",()=>{
 const generated=semanticBuildSource(builder);
 for(const required of ["entryPoints: ['scripts/temporal-service.ts']","await readFile('pnpm-lock.yaml')","buildId:`ack-${artifactHash}`","flag:'wx'","finally{await rm(path,{force:true});}"])expect(generated).toContain(required);
 expect(spawnSync(process.execPath,["--check","--input-type=module"],{input:generated,encoding:"utf8"}).status).toBe(0);
 expect(()=>semanticBuildSource(builder+builder)).toThrow();expect(()=>semanticBuildSource(null)).toThrow();
 const refused=spawnSync(process.execPath,["scripts/build-temporal-semantic-variant.mjs"],{env:{PATH:process.env.PATH},encoding:"utf8",timeout:10000});
 expect(refused.status).toBe(1);expect(refused.stdout).toBe("");expect(refused.stderr.trim()).toBe("Isolated semantic-version build refused; no raw build input or credentials printed.");
});
