/** Isolated GET-only proof readiness. No approval, dispatch or mutation authority. */
import {isDeepStrictEqual} from 'node:util';
import {BoundedHttpsJsonClient,httpsReadFailureKind} from '../lib/quotes/https-transport';
import type {NativeQuotePolicy} from '../lib/quotes/native-transport';
import {ControlError} from '../lib/durable/contracts';
const denied=()=>new ControlError(503,'Exact read-only native quote policy readiness unavailable.');
export async function waitForExactNativePolicy(client:BoundedHttpsJsonClient,expected:NativeQuotePolicy,stable:()=>Promise<void>,options:{timeoutMs?:number;intervalMs?:number}={}){
 const timeoutMs=options.timeoutMs??30000,intervalMs=options.intervalMs??250;
 if(!(client instanceof BoundedHttpsJsonClient)||typeof stable!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>180000||!Number.isSafeInteger(intervalMs)||intervalMs<1||intervalMs>250||expected?.contract!=='quote-pricing-policy-1'||!expected.policy?.active||!Number.isSafeInteger(expected.policy.version)||expected.policy.version<1||!/^[-_A-Za-z0-9]{1,64}$/.test(expected.workspaceId)||!/^[-_A-Za-z0-9]{1,64}$/.test(expected.quoteId)||!/^[a-f0-9]{64}$/.test(expected.binding))throw denied();
 const end=Date.now()+timeoutMs;
 while(Date.now()<end){
  await stable();let response;try{response=await client.request('/quotes/'+expected.quoteId+'/policy',{method:'GET',headers:{'x-looplabs-workspace':expected.workspaceId,'x-looplabs-binding':expected.binding}});}catch(error){await stable();if(!(error instanceof ControlError)||error.status!==503||httpsReadFailureKind(error)!=='connection-unavailable')throw error;}
  await stable();
  if(response){if(response.status===200){if(!isDeepStrictEqual(response.body,expected))throw denied();return Object.freeze({readOnlyPolicyReady:true});}if(response.status!==503)throw denied();}
  await new Promise(resolve=>setTimeout(resolve,Math.min(intervalMs,Math.max(1,end-Date.now()))));
 }
 throw denied();
}
