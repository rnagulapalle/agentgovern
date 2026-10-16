import {beforeAll,afterAll,it,expect} from "vitest";
import {createInstalledTenantFixture} from "./installed-tenant-fixture";
import {installCloudObservation} from "./cloud-observation-migration";
let fixture:Awaited<ReturnType<typeof createInstalledTenantFixture>>;
beforeAll(async()=>{fixture=await createInstalledTenantFixture({tenants:["one","two"],salesOrg:"one",seed:async()=>{}});},30000);
afterAll(async()=>fixture?.close());
async function apply(role:string,org?:string){const c=await fixture.owner.connect();try{return await installCloudObservation(c,role,org);}finally{c.release();}}
async function roles(){return(await fixture.owner.query("SELECT login_name,purpose,org_id FROM ll_runtime_workspace_bindings ORDER BY login_name")).rows;}
it("replays the immutable additive migration for only an exact bound web role",async()=>{
 const row=(await roles()).find(r=>r.purpose==="web"&&r.org_id==="one")!;
 expect(await apply(row.login_name,"one")).toMatchObject({migration:28,repeated:true,executionAuthorityGranted:false,scope:"bound-web-role"});
 const worker=(await roles()).find(r=>r.purpose==="worker")!;await expect(apply(worker.login_name,worker.org_id)).rejects.toThrow("binding mismatch");
 await expect(apply(row.login_name,"two")).rejects.toThrow("binding mismatch");await expect(apply(row.login_name)).rejects.toThrow("workspace required");
 const client=await fixture.workload("one","worker");await expect(client.query("SELECT * FROM ll_cloud_observation_enrollments")).rejects.toThrow();
});
it("refuses role injection, unknown roles and runtime callers as migration owner",async()=>{
 await expect(apply('x"; DROP TABLE ll_members; --',"one")).rejects.toThrow("runtime role required");
 await expect(apply("absent_observation_role","one")).rejects.toThrow("Restricted observation runtime role required");
 const c=await fixture.web("one").connect();try{await expect(installCloudObservation(c,"ll_runtime","one")).rejects.toThrow();}finally{c.release();}
 expect((await fixture.owner.query("SELECT to_regclass('ll_members') present")).rows[0].present).toBeTruthy();
});
it("refuses a changed migration digest instead of repairing history",async()=>{
 const row=(await roles()).find(r=>r.purpose==="web"&&r.org_id==="one")!;
 const old=(await fixture.owner.query("SELECT digest FROM ll_migrations WHERE version=28")).rows[0].digest;
 await fixture.owner.query("UPDATE ll_migrations SET digest=$1 WHERE version=28",["0".repeat(64)]);
 try{await expect(apply(row.login_name,"one")).rejects.toThrow("Applied observation migration changed");}finally{await fixture.owner.query("UPDATE ll_migrations SET digest=$1 WHERE version=28",[old]);}
});

it("installs a new observation table with forced tenant RLS and only web read/enrollment rights",async()=>{
 const row=(await roles()).find(r=>r.purpose==="web"&&r.org_id==="one")!;
 await fixture.owner.query("DROP TABLE ll_cloud_observation_enrollments");await fixture.owner.query("DROP FUNCTION ll_cloud_observation_boundary()");await fixture.owner.query("DELETE FROM ll_migrations WHERE version=28");
 expect(await apply(row.login_name,"one")).toMatchObject({migration:28,repeated:false,executionAuthorityGranted:false});
 expect((await fixture.owner.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='ll_cloud_observation_enrollments'::regclass")).rows[0]).toEqual({relrowsecurity:true,relforcerowsecurity:true});
 expect((await fixture.web("one").query("SELECT * FROM ll_cloud_observation_enrollments")).rows).toEqual([]);
 await expect(fixture.web("one").query("DELETE FROM ll_cloud_observation_enrollments")).rejects.toThrow();
});
