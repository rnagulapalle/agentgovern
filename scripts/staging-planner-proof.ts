// Real bounded model session, separately from the assembled/browser acceptance.
import {createHash} from "node:crypto";
import {parseEnv} from "node:util";
import {readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import assert from "node:assert/strict";
import {BedrockRuntimeClient,ConverseCommand} from "@aws-sdk/client-bedrock-runtime";
import {BedrockPlanner,parseIntent} from "../lib/enquiries/chat";
import {enquiryRequest} from "../lib/enquiries/chat-contract";
import {preparePlannerInputs} from "./staging-planner-inputs.mjs";
async function main() {
 const args=process.argv.slice(2);
 assert(process.env.LOOPLABS_STAGING_BOOTSTRAP==="isolated"&&args.length===2,"Explicit isolated input and exclusive output paths required");
 await preparePlannerInputs(...args);
 const env=parseEnv(await readFile(resolve(args[1],"web-planner.env"),"utf8"));
 const prior=new Map(Object.keys(env).map(k=>[k,process.env[k]]));
 Object.assign(process.env,env);
 try {
  const intent=parseIntent(await new BedrockPlanner().interpret([{role:"user",text:enquiryRequest+" Use customer@example.test."}]));
  assert.deepEqual(intent,{job:"acknowledgement",customerEmail:"customer@example.test",askFirst:true,rehearsal:true,extraActions:false});
  assert(env.AWS_ACCESS_KEY_ID&&env.AWS_SECRET_ACCESS_KEY&&env.AWS_SESSION_TOKEN);
  const client=new BedrockRuntimeClient({region:"us-west-2",maxAttempts:1,credentials:{accessKeyId:env.AWS_ACCESS_KEY_ID,secretAccessKey:env.AWS_SECRET_ACCESS_KEY,sessionToken:env.AWS_SESSION_TOKEN}});
  try {
   await assert.rejects(()=>client.send(new ConverseCommand({modelId:"amazon.nova-pro-v1:0",messages:[{role:"user",content:[{text:"Reply OK"}]}],inferenceConfig:{maxTokens:1}}),{abortSignal:AbortSignal.timeout(20000)}),(error:unknown)=>error instanceof Error&&error.name==="AccessDeniedException");
  }finally{client.destroy();}
  const sourceFingerprints=Object.fromEntries(await Promise.all(["scripts/staging-planner-inputs.mjs","scripts/staging-planner-proof.ts","lib/enquiries/chat.ts","lib/enquiries/chat-contract.ts"].map(async path=>[path,createHash("sha256").update(await readFile(path)).digest("hex")])));
  const result={at:new Date().toISOString(),sourceFingerprints,passed:true,scope:"local temporary model-session input and actual invocation only",checks:["short-lived temporary session prepared in a separate private web input","actual bounded acknowledgement intent validated","alternate model denied by AWS"],notVerified:["assembled web-container model invocation","typed HTTPS browser planning","persistent remote staging","live providers and enterprise acceptance"]};
  await writeFile(resolve(args[1],"result.json"),JSON.stringify(result,null,2)+"\n",{mode:0o600,flag:"wx"});console.log(JSON.stringify(result));
 }finally{for(const [key,value] of prior){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
}
main().catch(()=>{console.error("Temporary model-session proof failed; no credential, prompt or model output printed.");process.exitCode=1;});
