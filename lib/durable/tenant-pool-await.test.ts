import {expect,it} from 'vitest';
import type {Pool} from 'pg';
import {scopedPoolOptions} from './pg-transport';
import {assertTenantPool,registerTenantPool,tenantPoolBinding} from './tenant-pool';
import {createTlsFixture} from '../quotes/tls.test-fixture';
const expected={org:'one',epoch:'12345678-1234-4123-8123-123456789abc',role:'web_role',schema:'fixture',purpose:'web' as const};
const row={...expected,role_oid:'123',database_oid:'456',privileged:false,grouped:false,creates:false,owns:false};
for(const phase of ['register','assert'] as const)for(const mutation of ['socket','ca'] as const)it(`refuses ${mutation} mutation during awaited ${phase} query without publishing or returning authority`,async()=>{
 const tls=await createTlsFixture();try{
 const origin=await scopedPoolOptions({url:'postgresql://web_role:invalid_fixture_password@127.0.0.1:5432/testdb',schema:'fixture',purpose:'web',transport:{mode:'verified-tls',trust:'owned-ca',caFile:tls.ca,caSha256:tls.caSha256}});
 let release!:()=>void;let deferred=false;const pool={options:{...origin},on:()=>{},query:async()=>{if(deferred)await new Promise<void>(r=>{release=r;});return {rows:[row]};}} as unknown as Pool;
 if(phase==='assert')await registerTenantPool(pool,expected,origin);
 deferred=true;const pending=phase==='register'?registerTenantPool(pool,expected,origin):assertTenantPool(pool,'one');
 // query synchronously reaches its deferred barrier before mutation.
 if(mutation==='socket')pool.options.host='attacker.example.test';else{const ssl=origin.ssl;if(!ssl||typeof ssl!=='object'||!Buffer.isBuffer(ssl.ca))throw Error('Missing owned CA');ssl.ca[0]^=1;}
 release();await expect(pending).rejects.toThrow();
 if(phase==='register')expect(tenantPoolBinding(pool)).toBeUndefined();
 else await expect(assertTenantPool(pool,'one')).rejects.toThrow();
 }finally{await tls.close();}
},15000);
