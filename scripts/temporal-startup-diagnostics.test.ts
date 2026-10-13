import {it,expect} from 'vitest';
import {startupCategories,workloadPublicationPresence} from './temporal-startup-diagnostics';
it('counts only fixed startup categories without returning private process text or configuration',()=>{
 const secret='private-workload-password';const log=`${secret} postgres://owner:${secret}@private-host/db Scoped workload installation unavailable. ERR_TLS_CERT_ALTNAME_INVALID Unrecognized arbitrary message ${secret}`;
 const value=startupCategories(log);expect(value.scopedWorkloadUnavailable).toBe(1);expect(value.tlsHostnameRefused).toBe(1);expect(value.permissionRefused).toBe(0);
 expect(JSON.stringify(value)).not.toContain(secret);expect(JSON.stringify(value)).not.toContain('private-host');expect(JSON.stringify(value)).not.toContain('Unrecognized');
});
it('bounded input cannot inflate categories beyond retained process capture',()=>{expect(startupCategories('x'.repeat(200000)+'ECONNREFUSED').connectionRefused).toBe(0);});
it('publication presence distinguishes obsolete environment without disclosing values',()=>{
 const legacy=workloadPublicationPresence({LOOPLABS_DATABASE_URL:'postgres://secret',LOOPLABS_TEMPORAL_WORKER_TOKEN:'private-token'});expect(Object.values(legacy)).toEqual([false,false,false,false,false]);
 const exact=workloadPublicationPresence({LOOPLABS_WORKLOAD_INSTALLATION_FILE:'/private/file',LOOPLABS_WORKSPACE_ID:'one',LOOPLABS_RECOVERY_EPOCH:'epoch',LOOPLABS_TENANT_DATABASE_ROLE:'scoped',LOOPLABS_TENANT_DATABASE_SCHEMA:'schema'});expect(Object.values(exact)).toEqual([true,true,true,true,true]);expect(JSON.stringify(exact)).not.toContain('/private/file');
});
