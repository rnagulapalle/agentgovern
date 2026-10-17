import { expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { installCloudRuntimeMetadata } from "./cloud-runtime-metadata-migration";
it("refuses a non-owner before DDL and rolls back without adding grants",async()=>{
 const query=vi.fn(async(sql:string)=>({rows:sql.includes('pg_get_userbyid')?[{owned:false}]:[]}));
 await expect(installCloudRuntimeMetadata({query} as unknown as PoolClient)).rejects.toThrow('table owner required');
 expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
 expect(query.mock.calls.some(([sql])=>/ALTER|GRANT|INSERT/.test(sql))).toBe(false);
});
it("refuses a missing or changed migration prerequisite without altering storage",async()=>{
 const query=vi.fn(async(sql:string)=>({rows:sql.includes('pg_get_userbyid')?[{owned:true}]:sql.includes('version=16')?[{digest:'changed'}]:[]}));
 await expect(installCloudRuntimeMetadata({query} as unknown as PoolClient)).rejects.toThrow('prerequisite missing or changed');
 expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
 expect(query.mock.calls.some(([sql])=>/ALTER|GRANT|INSERT/.test(sql))).toBe(false);
});
