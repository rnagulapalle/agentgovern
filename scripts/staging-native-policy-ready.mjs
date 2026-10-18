// Actual installed isolated native GET, never submits work or emits credentials.
import assert from 'node:assert/strict';import{existsSync}from'node:fs';
import{readQuoteExecutionGeneration}from'../lib/quotes/execution-generation.ts';
import{readOwnedPrivateFile}from'../lib/workspace/owned-private-file.ts';
import{assertBoundQuotePlanContract}from'../lib/quotes/plan-v2.ts';
import{BoundedHttpsJsonClient}from'../lib/quotes/https-transport.ts';
import{waitForExactNativePolicy}from'./staging-native-policy-readiness.ts';
assert(existsSync('/.dockerenv')&&process.env.LOOPLABS_STAGING_PLATFORM_PROOF==='isolated'&&process.argv.length===4);
try{
 const generation=await readQuoteExecutionGeneration(process.argv[2],{kind:'owned-disposable-fixture'}),raw=await readOwnedPrivateFile(process.argv[3],1048576),reference=JSON.parse(raw.bytes.toString('utf8')),plan=reference.plan.plan;assertBoundQuotePlanContract(plan);const m=generation.metadata;assert.equal(m.version,2);assert.equal(plan.workspaceId,m.workspaceId);assert.equal(plan.quote.id,m.quoteId);assert.equal(plan.authority.quoteBinding,m.quoteBinding);assert.equal(plan.policyVersion,plan.policy.version);
 const stable=async()=>{await generation.assertStable();await raw.assertStable();};const client=new BoundedHttpsJsonClient({origin:m.origin,transport:m.nativeTransport},generation.nativeCredential,stable,1500);
 await waitForExactNativePolicy(client,{contract:'quote-pricing-policy-1',workspaceId:m.workspaceId,quoteId:m.quoteId,binding:m.quoteBinding,policy:plan.policy},stable);await stable();console.log(JSON.stringify({readOnlyPolicyReady:true,executionIssued:false}));
}catch{console.error('Native quote read-only policy readiness refused; no execution or raw input emitted.');process.exitCode=1;}
