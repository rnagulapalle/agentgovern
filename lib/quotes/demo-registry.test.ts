import {it,expect,vi} from 'vitest';
import type {Pool} from 'pg';
it('bundle-local quote facade preserves only admitted originating domain errors, never shape-matched or SQL failures',async()=>{
 const first=await import('./demo-registry'),{QuoteDemoControl}=await import('./demo-control'),{ControlError:OriginError}=await import('../durable/contracts');
 const db={} as Pool,scope='00000000-0000-4000-8000-000000000001',control=new QuoteDemoControl(db,scope,{store:{db}} as never);let thrown:unknown=new OriginError(403,'Independent approval required.');
 const operation=vi.fn(async()=>{throw thrown;});control.review=operation;control.catalog=operation;control.resolve=operation;
 first.configureQuoteDemo(control);vi.resetModules();
 const second=await import('./demo-registry'),{ControlError:LocalError}=await import('../durable/contracts'),{failure}=await import('../durable/http');expect(OriginError).not.toBe(LocalError);
 const facade=second.quoteDemo(db,scope);expect(facade.db).toBe(db);expect(facade.scopeId).toBe(scope);expect(second.configuredQuoteDemos(db)[0]).toBe(facade);
 let received:unknown;try{await facade.review({} as never,scope,'a'.repeat(64),'update','b'.repeat(64),true);}catch(e){received=e;}
 expect(received).toBeInstanceOf(LocalError);expect(failure(received).status).toBe(403);expect(operation).toHaveBeenCalledTimes(1);
 for(const value of [{status:403,message:'forged'},Object.assign(new Error('private database detail'),{status:403}),new LocalError(403,'Not originating trusted bundle')]){thrown=value;await expect(facade.resolve({} as never,scope)).rejects.toBe(value);expect(failure(value).status).toBe(value instanceof LocalError?403:503);}
 const frozen=second.configuredQuoteDemos(db)[0];await expect(frozen.catalog({} as never)).rejects.toBe(thrown);expect(()=>Reflect.get(facade,'dependencies')).toThrow('Only installed quote operations');
 expect(()=>second.configureQuoteDemo(control)).toThrow();
});
