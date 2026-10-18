// Closed diagnostics, not workflow/execution authority or release eligibility.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
export function persistentInstalledTrialRecipe(kind,env){
 assert(['runtime-only','typed-quote','retained-quote-demo'].includes(kind),'Closed persistent diagnostic recipe required');
 assert.equal(env.LOOPLABS_PERSISTENT_RUNTIME_PROOF,'isolated');
 assert(!Object.keys(env).some(k=>k.startsWith('AWS_')),'Do not inherit host cloud credentials');
 if(kind==='retained-quote-demo'){
  assert.equal(env.LOOPLABS_RETAINED_QUOTE_DEMO,'explicit-canonical-sample');
  assert.equal(env.LOOPLABS_PERSISTENT_TYPED_QUOTE_PROOF,undefined);assert.equal(env.LOOPLABS_STAGING_BROWSER_PROOF,undefined);
  assert.equal(env.LOOPLABS_STAGING_PLANNER_INPUT,undefined);
  return Object.freeze({kind,typed:false,retain:true,origin:'https://looplabs.run',webPorts:[{target:3000,published:'3199',host_ip:'127.0.0.1',protocol:'tcp'}],plannerInput:'/srv/looplabs-production/private/planner-input.json',membersFile:'/srv/looplabs-production/private/operator-members.json',profile:'isolated-quote-demo-1'});
 }
 if(kind==='runtime-only'){
  assert.equal(env.LOOPLABS_PERSISTENT_TYPED_QUOTE_PROOF,undefined);assert.equal(env.LOOPLABS_STAGING_PLANNER_INPUT,undefined);assert.equal(env.LOOPLABS_STAGING_BROWSER_PROOF,undefined);
  return Object.freeze({kind,typed:false,origin:'https://looplabs-staging.example.test',webPorts:[]});
 }
 assert.equal(env.LOOPLABS_PERSISTENT_TYPED_QUOTE_PROOF,'isolated');assert.equal(env.LOOPLABS_STAGING_BROWSER_PROOF,'isolated');
 assert(typeof env.LOOPLABS_STAGING_PLANNER_INPUT==='string'&&resolve(env.LOOPLABS_STAGING_PLANNER_INPUT)===env.LOOPLABS_STAGING_PLANNER_INPUT);
 return Object.freeze({kind,typed:true,origin:'https://looplabs-staging.example.test:3443',webPorts:[{target:3000,published:'3199',host_ip:'127.0.0.1',protocol:'tcp'}],plannerInput:env.LOOPLABS_STAGING_PLANNER_INPUT});
}
export function assertPersistentRuntimePortBindings(service,bindings,recipe){
 assert(bindings&&typeof bindings==='object'&&!Array.isArray(bindings));
 assert.deepEqual(bindings,(recipe.typed||recipe.retain)&&service==='web'?{'3000/tcp':[{HostIp:'127.0.0.1',HostPort:'3199'}]}:{});
}
/** Source-owned caller supplies actual captured Docker Env, never an eligibility
 * document. Do not include unrelated environment/credentials in diagnostics. */
export function assertPersistentQuoteWebProfile(environment){
 assert(Array.isArray(environment)&&environment.every(v=>typeof v==='string'));
 const selected=environment.filter(v=>v.startsWith('LOOPLABS_DEPLOYMENT_PROFILE='));
 assert.deepEqual(selected,['LOOPLABS_DEPLOYMENT_PROFILE=isolated-quote-demo-1'],'Exact unique quote-only web deployment profile required');
}
