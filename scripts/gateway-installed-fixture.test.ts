import {expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import {parseGatewayOwnerInput,bootstrapInstalledGateway,readGatewayOwnerInput} from './gateway-installed-fixture';
import {installTemporalProofRoles} from './temporal-installed-fixture';
const input=()=>({version:2 as const,url:'postgresql://trial:disposable@trial-db:5432/trial',schema:'gateway_0123456789abcdef',installation:'g0123456789abcdef',epoch:randomUUID(),generation:'/run/installation/generation',transport:{mode:'verified-tls' as const,trust:'owned-ca' as const,caFile:'/run/db-ca/ca.pem',caSha256:'a'.repeat(64)},agent:'a'.repeat(43),operator:'b'.repeat(43),legacyOperator:'c'.repeat(43)});
it('validates only the explicit private Docker target and exact verified TLS contract',()=>{
 const c=input();expect(parseGatewayOwnerInput(c)).toEqual(c);
 for(const mutate of [(v:Record<string,unknown>)=>v.extra='arbitrary',(v:Record<string,unknown>)=>v.url='postgresql://trial:x@localhost:5432/trial',(v:Record<string,unknown>)=>v.url='postgresql://trial:x@trial-db:5432/trial?sslmode=disable',(v:Record<string,unknown>)=>v.url='postgresql://owner:x@trial-db:5432/trial',(v:Record<string,unknown>)=>v.schema='public',(v:Record<string,unknown>)=>v.epoch='missing',(v:Record<string,unknown>)=>v.generation='/run/web',(v:Record<string,unknown>)=>v.operator=v.agent,(v:Record<string,unknown>)=>v.agent='short',(v:Record<string,unknown>)=>v.transport={mode:'loopback-plaintext-fixture'}]){
  const value:Record<string,unknown>=structuredClone(c);mutate(value);expect(()=>parseGatewayOwnerInput(value)).toThrow();
 }
});
it('refuses caller-selected files before any credentials or sockets are read',async()=>{
 await expect(readGatewayOwnerInput('/tmp/owner.json')).rejects.toThrow();await expect(bootstrapInstalledGateway('/tmp/web.json')).rejects.toThrow();
});
it('refuses owner/workload/cloud inputs even alongside a runtime publication',async()=>{
 for(const key of ['LOOPLABS_DATABASE_URL','LOOPLABS_TEST_DATABASE_URL','LOOPLABS_WORKLOAD_INSTALLATION_FILE','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY']){
  const previous=process.env[key];process.env[key]='must-not-reach-bootstrap';
  try{await expect(bootstrapInstalledGateway('/run/web/web.json')).rejects.toThrow('Owner/workload/cloud inputs forbidden');}finally{if(previous===undefined)delete process.env[key];else process.env[key]=previous;}
 }
});
it('preserves the default localhost contract and refuses explicit malformed targets before a Pool exists',async()=>{
 const c=input(),seed=async()=>undefined;
 await expect(installTemporalProofRoles({...c,seed})).rejects.toThrow('Owned loopback target required');
 await expect(installTemporalProofRoles({...c,seed,transport:{mode:'loopback-plaintext-test-fixture',fixture:'disposable-local-postgres'}})).rejects.toThrow('Verified TLS required');
 await expect(installTemporalProofRoles({...c,seed,endpoint:{kind:'owned-disposable-docker',hostname:'elsewhere'} as never})).rejects.toThrow();
});
