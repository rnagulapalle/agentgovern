// Versioned installed-fixture consistency only; no signature/release authority.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {gatewayProofFiles,gatewayProofChecks,gatewayProofLimits,validateGatewayReceipt} from './gateway-bypass-record.mjs';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('tsx'))('esbuild');
export const installedGatewayProofFiles=[...gatewayProofFiles,'scripts/gateway-installed-bypass-proof.mjs','scripts/gateway-installed-record.mjs','scripts/gateway-installed-fixture.ts','scripts/gateway-installed-server.ts','scripts/gateway-installed-controller.ts','scripts/temporal-installed-fixture.ts','install-order.json','lib/durable/tenant-boundary-prototype-schema.sql','lib/connectors/quote-action-schema.sql','lib/quotes/background-schema.sql','lib/quotes/worker-admission-schema.sql'];
export const installedGatewayProofChecks=[...gatewayProofChecks,'installedScopedWebAndBroker','verifiedDatabaseTLS','ownerCredentialExcludedFromGateway'];
export const installedGatewayProofLimits=[...gatewayProofLimits,'native cloud agent enrollment','populated Azure or Google account discovery','Raj and Pratibha operator acceptance'];
export async function installedGatewaySourceFingerprints(){
 const files=new Set(installedGatewayProofFiles);
 for(const file of JSON.parse(await readFile('install-order.json','utf8')))files.add(file);
 for(const role of ['server','agent','controller']){
  const r=await build({entryPoints:[role==='agent'?'scripts/gateway-trial-agent.ts':`scripts/gateway-installed-${role}.ts`],bundle:true,platform:'node',format:'cjs',write:false,external:['next/server','pg-native'],metafile:true,logLevel:'silent'});
  for(const path of Object.keys(r.metafile.inputs))if(!path.split('/').includes('node_modules'))files.add(path);
 }
 return Object.fromEntries(await Promise.all([...files].sort().map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')])));
}
const keys=(v,want)=>assert.deepEqual(Object.keys(v).sort(),[...want].sort());
export function validateInstalledGatewayReceipt(r,current){
 assert(r&&typeof r==='object'&&!Array.isArray(r));keys(r,['version','installation','completedUtc','scope','fixtureSource','sourceFingerprints','bundles','imageIds','checks','notProved']);assert.equal(r.version,2);
 keys(r.checks,installedGatewayProofChecks);for(const c of installedGatewayProofChecks)assert.equal(r.checks[c],true,c);assert.deepEqual(r.notProved,installedGatewayProofLimits);
 keys(r.imageIds,['agent','controller','db','gateway','twin']);assert.equal(r.imageIds.controller,r.imageIds.gateway);
 // Preserve every original parser invariant without changing historical v1.
 const {installation,...historical}=r;
 keys(installation,['version','schema','schemaOid','webRole','roles','epoch','webSha256','verifiedDatabaseTLS','installedNamedMember','installedAgentRouting','ownerExcludedFromWeb']);assert.equal(installation.version,2);
 assert(/^gateway_[a-f0-9]{16}$/.test(installation.schema));assert(/^[1-9][0-9]*$/.test(installation.schemaOid));assert(/^[a-z][a-z0-9_]{0,62}$/.test(installation.webRole));assert.notEqual(installation.webRole,'trial');assert(/^[a-f0-9]{64}$/.test(installation.webSha256));assert(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(installation.epoch));
 assert(installation.roles&&Object.keys(installation.roles).length>=3);assert(Object.hasOwn(installation.roles,installation.webRole));for(const [role,oid]of Object.entries(installation.roles)){assert(/^[a-z][a-z0-9_]{0,62}$/.test(role));assert.notEqual(role,'trial');assert(/^[1-9][0-9]*$/.test(oid));}assert.equal(new Set(Object.values(installation.roles)).size,Object.keys(installation.roles).length);
 for(const check of ['verifiedDatabaseTLS','installedNamedMember','installedAgentRouting','ownerExcludedFromWeb'])assert.equal(installation[check],true);
 for(const f of installedGatewayProofFiles)assert(Object.hasOwn(current,f),f);
 validateGatewayReceipt({...historical,version:1,checks:Object.fromEntries(gatewayProofChecks.map(c=>[c,r.checks[c]])),notProved:gatewayProofLimits,imageIds:Object.fromEntries(Object.entries(r.imageIds).filter(([k])=>k!=='controller'))},current);
 return r;
}
