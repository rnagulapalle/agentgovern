import {beforeAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {installedGatewaySourceFingerprints,installedGatewayProofChecks,installedGatewayProofLimits,validateInstalledGatewayReceipt} from './gateway-installed-record.mjs';
import {gatewayProofChecks,validateGatewayReceipt} from './gateway-bypass-record.mjs';
let sources;
beforeAll(async()=>{sources=await installedGatewaySourceFingerprints();});
// Synthetic parser fixture only, never a runtime receipt.
const fixture=()=>({version:2,installation:{version:2,schema:'gateway_0123456789abcdef',schemaOid:'123',webRole:'ll_g_web',roles:{ll_g_web:'10',ll_g_broker:'11',ll_g_worker:'12'},epoch:'01234567-0123-4123-8123-0123456789ab',webSha256:'a'.repeat(64),verifiedDatabaseTLS:true,installedNamedMember:true,installedAgentRouting:true,ownerExcludedFromWeb:true},completedUtc:'2026-10-11T00:00:00Z',scope:'disposable Docker network/TLS/actual Next handlers/PostgreSQL/FetchSandbox twin',fixtureSource:{version:1,commit:'a'.repeat(40),archiveSha256:'b'.repeat(64),hubspotSpecSha256:'c'.repeat(64),trackedFiles:1},sourceFingerprints:sources,bundles:{agent:'a'.repeat(64),controller:'b'.repeat(64),server:'c'.repeat(64)},imageIds:{agent:`sha256:${'a'.repeat(64)}`,gateway:`sha256:${'a'.repeat(64)}`,controller:`sha256:${'a'.repeat(64)}`,db:`sha256:${'b'.repeat(64)}`,twin:`sha256:${'c'.repeat(64)}`},checks:Object.fromEntries(installedGatewayProofChecks.map(c=>[c,true])),notProved:installedGatewayProofLimits});
it('keeps every historical assertion and binds actual installed bootstrap, schemas and role configuration',()=>{
 const r=fixture();expect(validateInstalledGatewayReceipt(r,sources)).toBe(r);expect(()=>validateGatewayReceipt(r,sources)).toThrow();
 for(const c of gatewayProofChecks)expect(installedGatewayProofChecks).toContain(c);
 for(const p of ['lib/workspace/tenant-bootstrap.ts','lib/workspace/tenant-context.ts','lib/workspace/tenant-installer.ts','lib/durable/pg-transport.ts','lib/durable/tenant-boundary-prototype-schema.sql','lib/workspace/membership-authority-schema.sql','lib/enquiries/dispatch.ts','scripts/gateway-installed-server.ts'])expect(sources).toHaveProperty(p);
 expect(Object.keys(sources).every(p=>!p.startsWith('../')&&!p.split('/').includes('node_modules'))).toBe(true);
});
it('rejects every failed or renamed check, historical receipt, owner authority or stale recovery identity',()=>{
 for(const key of installedGatewayProofChecks){const r=structuredClone(fixture());r.checks[key]=false;expect(()=>validateInstalledGatewayReceipt(r,sources)).toThrow();}
 for(const mutate of [r=>r.version=1,r=>r.checks.renamed=true,r=>r.installation.epoch='unknown',r=>r.installation.webRole='trial',r=>r.installation.roles.ll_g_worker='10',r=>r.installation.verifiedDatabaseTLS=false,r=>r.installation.secret='arbitrary',r=>r.imageIds.controller=r.imageIds.db,r=>r.notProved=[]]){const r=structuredClone(fixture());mutate(r);expect(()=>validateInstalledGatewayReceipt(r,sources)).toThrow();}
});
it('rejects missing schema/bootstrap source, tampering and unrelated-source substitution',()=>{
 for(const p of ['lib/workspace/tenant-bootstrap.ts','lib/durable/tenant-boundary-prototype-schema.sql','lib/enquiries/dispatch.ts']){
  for(const mutate of [r=>delete r.sourceFingerprints[p],r=>r.sourceFingerprints[p]='0'.repeat(64)]){const r=structuredClone(fixture());mutate(r);expect(()=>validateInstalledGatewayReceipt(r,sources)).toThrow();}
 }
 const r=structuredClone(fixture());r.sourceFingerprints['unrelated.ts']='0'.repeat(64);expect(()=>validateInstalledGatewayReceipt(r,sources)).toThrow();
});
it('preserves the exact original agent operation sequence while moving owner setup out of the gateway',async()=>{
 const old=await readFile('scripts/gateway-bypass-proof.mjs','utf8'),next=await readFile('scripts/gateway-installed-bypass-proof.mjs','utf8');
 const operations=s=>[...s.matchAll(/act\("([a-z-]+)"\)/g)].map(x=>x[1]);expect(operations(next)).toEqual(operations(old));
 const controls=s=>[...s.matchAll(/control\("([a-z-]+)"\)/g)].map(x=>x[1]);expect(controls(next).filter(x=>x!=='setup')).toEqual(controls(old));
 expect(next).toContain('LOOPLABS_TENANT_WEB_CONFIG=/run/web/web.json');expect(next).not.toContain('LOOPLABS_DATABASE_URL=postgresql');
});
