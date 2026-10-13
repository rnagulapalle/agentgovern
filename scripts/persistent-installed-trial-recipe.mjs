// Closed diagnostics, not workflow/execution authority or release eligibility.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
export function persistentInstalledTrialRecipe(kind,env){
 assert(['runtime-only','typed-quote'].includes(kind),'Closed persistent diagnostic recipe required');
 assert.equal(env.LOOPLABS_PERSISTENT_RUNTIME_PROOF,'isolated');
 assert(!Object.keys(env).some(k=>k.startsWith('AWS_')),'Do not inherit host cloud credentials');
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
 assert.deepEqual(bindings,recipe.typed&&service==='web'?{'3000/tcp':[{HostIp:'127.0.0.1',HostPort:'3199'}]}:{});
}
