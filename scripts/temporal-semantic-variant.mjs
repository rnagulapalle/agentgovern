// Deliberately incompatible fault-injection code, never a production feature.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
const digest=value=>createHash("sha256").update(value).digest("hex");
export function semanticWorkflowVariant(source,expectedSha256){
 assert(typeof source==="string"&&typeof expectedSha256==="string"&&/^[a-f0-9]{64}$/.test(expectedSha256),"Exact measured workflow source required");
 assert.equal(digest(source),expectedSha256,"Baseline workflow source changed");
 const replace=(before,after)=>{assert.equal(source.split(before).length,2,"Semantic variant anchor is missing or ambiguous");source=source.replace(before,after);};
 replace('import { condition, defineSignal, proxyActivities, setHandler }','import { condition, defineSignal, proxyActivities, setHandler, sleep }');
 replace('export async function pinnedAcknowledgement(contract: RunContract): Promise<Progress> {',`export async function pinnedAcknowledgement(contract: RunContract): Promise<Progress> {
  // This extra command intentionally cannot replay a baseline activity-first history.
  // It exercises pinned-version containment; it grants no business authority.
  await sleep("1 second");`);
 assert.notEqual(digest(source),expectedSha256);
 return {source,sourceSha256:digest(source),baselineSha256:expectedSha256,change:"durable timer before first activity"};
}
export function semanticBuildSource(builder){
 assert(typeof builder==="string");
 const before="const bundle = await bundleWorkflowCode({ workflowsPath: new URL('../runtime/temporal/pinned-workflow.ts', import.meta.url).pathname });";
 assert.equal(builder.split(before).length,2,"Measured builder anchor is missing or ambiguous");
 return `import {rm} from 'node:fs/promises';\nimport assert from 'node:assert/strict';\nimport {semanticWorkflowVariant} from './temporal-semantic-variant.mjs';\n`+builder.replace(before,`const baseline=JSON.parse(await readFile('docs/evidence/staging-platform-browser-proof.json','utf8'));
const original=await readFile('runtime/temporal/pinned-workflow.ts','utf8');
const variant=semanticWorkflowVariant(original,baseline.sourceFingerprints['runtime/temporal/pinned-workflow.ts']);
const path=new URL('../runtime/temporal/.semantic-version-proof.ts',import.meta.url);
await writeFile(path,variant.source,{flag:'wx',mode:0o600});
let bundle;
try{bundle=await bundleWorkflowCode({workflowsPath:path.pathname});}
finally{await rm(path,{force:true});}
assert(bundle&&bundle.code);`);
}
