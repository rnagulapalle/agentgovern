import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Pool } from "pg";
import { randomBytes, randomUUID } from "node:crypto";
import { createInstalledTenantFixture } from "@/lib/workspace/installed-tenant-fixture";
import type { TenantContext } from "@/lib/workspace/tenant-context";
import { ControlError } from "@/lib/durable/contracts";
import { digest, WORKSPACE_COOKIE } from "@/lib/workspace/identity";
const binding = vi.hoisted(() => ({ context:null as TenantContext | null }));
vi.mock("@/lib/workspace/tenant-context", async original => ({...await original<object>(),tenantContext:()=>{if(!binding.context)throw new ControlError(503,"Tenant context unavailable.");return binding.context;}}));
import { GET, POST } from "./route";
it("invited owner review HTTP path persists exact responsibility, refuses stale/foreign/replayed authority and creates no agent", async()=>{
  if(!process.env.LOOPLABS_TEST_DATABASE_URL) throw Error("Dedicated test PostgreSQL required; never skip.");
  const token=randomBytes(32).toString("base64url"),other=randomBytes(32).toString("base64url");let fixture:Awaited<ReturnType<typeof createInstalledTenantFixture>>|undefined;let db:Pool;
  const scanId=randomUUID(),resource="arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/ops-1234567890";
  const origin="https://looplabs.run",path=origin+"/api/workspace/discovery/owners";
  const request=(credential=token,payload?:object,query="",site=origin)=>new NextRequest(path+query,{method:payload?"POST":"GET",headers:{origin:site,cookie:`${WORKSPACE_COOKIE}=${credential}`,"Content-Type":"application/json"},...(payload?{body:JSON.stringify(payload)}:{})});
  try {
    fixture=await createInstalledTenantFixture({tenants:["company-a","company-b"],salesOrg:"company-a",seed:async owner=>{
      const db=owner;
    await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('reviewer@example.test','company-a','Reviewer','fixture'),('owner@example.test','company-a','Owner','fixture'),('other@example.test','company-b','Other','fixture')");
    await db.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES($1,'reviewer@example.test',now()+interval '1 hour'),($2,'other@example.test',now()+interval '1 hour')",[digest(token),digest(other)]);
    await db.query("INSERT INTO ll_cloud_connections(org_id,id,account_id,region,created_by) VALUES('company-a','_aws','123456789012','us-west-2','reviewer@example.test')");
    await db.query("INSERT INTO ll_cloud_scans(org_id,connection_id,id,observed_at,completeness,failures,canonical_sha256) VALUES('company-a','_aws',$1,now(),'complete-api-traversal','{}',$2)",[scanId,"a".repeat(64)]);
    await db.query("INSERT INTO ll_cloud_runtime_observations(org_id,connection_id,scan_id,resource_id,resource_arn,version) VALUES('company-a','_aws',$1,'ops-1234567890',$2,'1')",[scanId,resource]);
    }});db=fixture.owner;binding.context=fixture.context;
    const scoped=fixture.web("company-a"),identity=(await scoped.query("SELECT current_user name,(SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user) privileged")).rows[0];
    expect(identity.privileged).toBe(false);expect(identity.name).not.toBe((await db.query("SELECT current_user name")).rows[0].name);
    expect((await scoped.query("SELECT email FROM ll_members WHERE org_id='company-b'")).rows).toEqual([]);
    const reference={provider:"aws-agentcore-runtime",connectionId:"_aws",scanId,resource,version:"1"},decision={...reference,id:randomUUID(),owner:"owner@example.test"},query="?"+new URLSearchParams(reference).toString();
    expect((await GET(request("missing"))).status).toBe(401);
    const list=await GET(request());expect(list.headers.get("Cache-Control")).toBe("no-store");expect(await list.json()).toEqual({owners:[{email:"owner@example.test",name:"Owner"},{email:"reviewer@example.test",name:"Reviewer"}],truncated:false});
    expect(await(await GET(request(token,undefined,query))).json()).toMatchObject({ownership:"unmapped",authorityGranted:false});
    expect((await POST(request(token,decision,"","https://foreign.test"))).status).toBe(403);
    expect((await POST(request(token,{...decision,authorityGranted:true}))).status).toBe(400);
    expect((await POST(request(other,decision))).status).toBe(409);
    expect((await POST(request(token,{...decision,owner:"other@example.test"}))).status).toBe(400);
    expect(await(await POST(request(token,decision))).json()).toMatchObject({repeated:false,authorityGranted:false});
    expect(await(await POST(request(token,decision))).json()).toMatchObject({repeated:true});
    expect((await POST(request(token,{...decision,owner:"reviewer@example.test"}))).status).toBe(409);
    expect(await(await GET(request(token,undefined,query))).json()).toMatchObject({ownership:"reviewed",owner:decision.owner,enforcement:"unverified"});
    const insertSql="INSERT INTO ll_cloud_owner_reviews(org_id,id,provider,connection_id,scan_id,scan_sha256,resource,provider_version,owner_email,reviewed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)";
    await expect(fixture.web("company-b").query(insertSql,["company-a",randomUUID(),reference.provider,"_aws",scanId,"a".repeat(64),resource,"1",decision.owner,"reviewer@example.test"])).rejects.toMatchObject({code:"23514",message:"Owner review member scope differs"});
    for(const forbidden of [await fixture.workload("company-a","worker"),await fixture.workload("company-a","scheduler")])
      await expect(forbidden.query(insertSql,["company-a",randomUUID(),reference.provider,"_aws",scanId,"a".repeat(64),resource,"1",decision.owner,"reviewer@example.test"])).rejects.toMatchObject({code:"42501"});
    expect((await fixture.web("company-b").query("SELECT id FROM ll_cloud_owner_reviews WHERE org_id='company-a'")).rows).toEqual([]);
    await expect(scoped.query("UPDATE ll_cloud_owner_reviews SET owner_email='reviewer@example.test' WHERE id=$1",[decision.id])).rejects.toMatchObject({code:"42501"});
    await expect(scoped.query("DELETE FROM ll_cloud_owner_reviews WHERE id=$1",[decision.id])).rejects.toMatchObject({code:"42501"});
    await expect(scoped.query("TRUNCATE ll_cloud_owner_reviews")).rejects.toMatchObject({code:"42501"});
    expect((await db.query("SELECT owner_email FROM ll_cloud_owner_reviews WHERE id=$1",[decision.id])).rows).toEqual([{owner_email:decision.owner}]);

    for(const suffix of [query+"&scanId="+scanId,query+"&authority=true","?provider=aws-agentcore-runtime"])expect((await GET(request(token,undefined,suffix))).status).toBe(400);
    await db.query("UPDATE ll_members SET active=false WHERE email='owner@example.test'");expect(await(await GET(request(token,undefined,query))).json()).toMatchObject({ownership:"needs-review"});expect((await POST(request(token,decision))).status).toBe(400);
    expect((await db.query("SELECT count(*)::int n FROM ll_cloud_owner_reviews")).rows[0].n).toBe(1);
    for(const table of ["ll_agents","ll_actions","ll_tokens"])expect((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0);
    const googleQuery="?"+new URLSearchParams({...reference,provider:"google-agent-engine",connectionId:"google-unused",version:""}).toString();expect(await(await GET(request(token,undefined,googleQuery))).json()).toMatchObject({ownership:"unmapped"});
    await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) SELECT 'extra-'||n||'@example.test','company-a','Z extra '||n,'fixture' FROM generate_series(1,101) n");
    const bounded=await(await GET(request())).json();expect(bounded.owners).toHaveLength(100);expect(bounded.truncated).toBe(true);expect(JSON.stringify(bounded)).not.toContain('other@example.test');
    await db.query("UPDATE ll_members SET active=false WHERE email='reviewer@example.test'");expect((await GET(request())).status).toBe(401);expect((await POST(request(token,decision))).status).toBe(401);
    await db.query("UPDATE ll_members SET active=true WHERE email='reviewer@example.test'");await db.query("DROP TABLE ll_cloud_owner_reviews");expect((await GET(request())).status).toBe(503);expect((await POST(request(token,decision))).status).toBe(503);
  }finally{binding.context=null;await fixture?.close();}
});
