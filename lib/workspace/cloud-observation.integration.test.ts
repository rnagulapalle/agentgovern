import { beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createInstalledTenantFixture } from "./installed-tenant-fixture";
import { digest } from "./identity";
import { CloudInventoryStore } from "./cloud-inventory";
import { observationEnrollment } from "./cloud-observation-store";
const state=vi.hoisted(()=>({account:"342206308838",readable:true,setup:true,reads:0}));
let fixture:Awaited<ReturnType<typeof createInstalledTenantFixture>>;
const token=randomBytes(32).toString("base64url"),other=randomBytes(32).toString("base64url");
const resourceId="assistant-1234567890",arn="arn:aws:bedrock-agentcore:us-west-2:342206308838:runtime/"+resourceId;
vi.mock("./tenant-context",async original=>({...await original<typeof import("./tenant-context")>(),tenantContext:()=>fixture.context}));
vi.mock("./aws-guided-access",()=>({createAwsGuidedAccess:async()=>{
 if(!state.setup)throw Error("private helper setup path");
 return {authorization:async()=>({url:"https://us-west-2.console.aws.amazon.com/cloudformation/home",roleArn:"arn:aws:iam::342206308838:role/LoopLabsObservation-test",authorityGranted:false,access:"observation-only"}),
 inventory:()=>({callerIdentity:async()=>({Account:state.account}),listRuntimes:async()=>({agentRuntimes:[{agentRuntimeId:resourceId,agentRuntimeArn:arn,agentRuntimeVersion:"10"}]}),getRuntime:async()=>({agentRuntimeId:resourceId,agentRuntimeArn:arn,agentRuntimeVersion:"10"})}),
 logGroups:async()=>({groups:[{name:"/company/workflow-events",retentionDays:30}],truncated:false}),
 telemetry:()=>({callerIdentity:async()=>({Account:state.account}),listEvents:async()=>{state.reads++;if(!state.readable)throw Error("private AWS provider failure");return{events:[{eventId:"cw-one",timestamp:Date.now()-1000,message:JSON.stringify({schema_version:"1.0",event_name:"workflow.finished",event_id:"event-one",run_id:"run-one",action_id:null,timestamp:new Date(Date.now()-1000).toISOString(),attempt:1,trace_id:"a".repeat(32),span_id:"b".repeat(16),trigger_channel:"slack",agent_deployment_version:"10",outcome:"completed",customer_body:"never-import"})}]};}})};
}}));
import {POST} from "../../app/api/workspace/discovery/onboarding/route";
const post=(value:unknown,credential=token,origin="https://looplabs.run")=>POST(new NextRequest("https://looplabs.run/api/workspace/discovery/onboarding",{method:"POST",headers:{cookie:"looplabs_workspace_session="+credential,origin,"content-type":"application/json"},body:JSON.stringify(value)}));
let scanId:string;
const onboard=(id=randomUUID())=>({operation:"onboard",id,connectionId:"aws",scanId,resourceArn:arn,version:"10",owner:"owner@example.test",displayName:"Customer service agent",logGroup:"/company/workflow-events"});
beforeAll(async()=>{
 fixture=await createInstalledTenantFixture({tenants:["one","two"],salesOrg:"one",seed:async db=>{
  await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('reviewer@example.test','one','Reviewer','fixture'),('owner@example.test','one','Owner','fixture'),('other@example.test','two','Other','fixture')");
  for(const [raw,email]of [[token,"reviewer@example.test"],[other,"other@example.test"]])await db.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES($1,$2,now()+interval '1 hour')",[digest(raw),email]);
 }});
 const {db,actor}=await fixture.context.authenticated(token);await new CloudInventoryStore(db).configureConnection(actor,{tenantId:"one",connectionId:"aws",accountId:"342206308838",region:"us-west-2"});
 const verified=await post({operation:"verify",connectionId:"aws"});expect(verified.status).toBe(200);scanId=(await verified.json()).inventory.scanId;
},30000);
beforeEach(async()=>{state.account="342206308838";state.readable=true;state.setup=true;state.reads=0;await fixture.owner.query("DELETE FROM ll_tenant_access_attempts WHERE key LIKE 'cloud-observation:%'");});
afterAll(async()=>fixture?.close());
it("genuine scoped cookie API prepares read-only authorization and lists source metadata without action grants",async()=>{
 const grant=await post({operation:"authorization",connectionId:"aws",telemetryLogGroup:"/company/workflow-events"});expect(grant.status).toBe(200);expect(await grant.json()).toMatchObject({access:"observation-only",authorityGranted:false,reviewRequired:true});
 expect(await (await post({operation:"sources",connectionId:"aws"})).json()).toMatchObject({groups:[{name:"/company/workflow-events",retentionDays:30}]});
 for(const table of ["ll_agents","ll_actions","ll_connector_actions","ll_tokens"])expect((await fixture.owner.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0);
});
it("onboards an exact source idempotently, persists its owner and reads redacted source history",async()=>{
 const input=onboard();for(let n=0;n<2;n++){const response=await post(input);expect(response.status).toBe(200);expect(await response.json()).toMatchObject({repeated:n===1,mode:"observation-only",enforcement:"not-established",sourceRead:"verified"});}
 const saved=await post({operation:"enrollment",connectionId:"aws",scanId:input.scanId,resourceArn:arn,version:"10"});expect(saved.status).toBe(200);expect(await saved.json()).toMatchObject({enrollment:{displayName:input.displayName,owner:input.owner,logGroup:input.logGroup}});
 const history=await post({operation:"history",connectionId:"aws",resourceArn:arn,version:"10",hours:24});expect(history.status).toBe(200);const value=await history.json();expect(value).toMatchObject({enrollment:{displayName:input.displayName,owner:input.owner,logGroup:input.logGroup},enforcement:"not-established",events:[{runId:"run-one",effectVerified:false,evidence:"source-reported"}]});expect(JSON.stringify(value)).not.toContain("never-import");
 expect((await fixture.web("two").query("SELECT * FROM ll_cloud_observation_enrollments")).rows).toEqual([]);
 await expect(fixture.web("one").query("UPDATE ll_cloud_observation_enrollments SET log_group='/other'")).rejects.toThrow();
 await expect(fixture.owner.query("UPDATE ll_cloud_observation_enrollments SET log_group='/other'")).rejects.toThrow("append-only");
 const worker=await fixture.workload("one","worker");await expect(worker.query("SELECT * FROM ll_cloud_observation_enrollments")).rejects.toThrow();
});
it("rejects cross-origin, anonymous, foreign-workspace and malformed/credential-bearing requests",async()=>{
 expect((await post({operation:"sources",connectionId:"aws"},token,"https://untrusted.invalid")).status).toBe(403);
 expect((await post({operation:"sources",connectionId:"aws"},"missing")).status).toBe(401);
 expect((await post({operation:"sources",connectionId:"aws"},other)).status).toBe(404);
 const before=state.reads;expect((await post({...onboard(),secretAccessKey:"not-accepted"})).status).toBe(400);expect(state.reads).toBe(before);
 expect((await post({...onboard(),id:"bad"})).status).toBe(400);expect(state.reads).toBe(before);
 expect(()=>observationEnrollment({...onboard(),ownerReviewId:randomUUID()})).toThrow();
});
it("does not save enrollment when the cloud source cannot be read; no private provider errors escape",async()=>{
 const before=(await fixture.owner.query("SELECT count(*)::int n FROM ll_cloud_observation_enrollments")).rows[0].n;state.readable=false;
 const response=await post(onboard());expect(response.status).toBe(503);expect(await response.text()).not.toContain("private AWS provider failure");
 expect((await fixture.owner.query("SELECT count(*)::int n FROM ll_cloud_observation_enrollments")).rows[0].n).toBe(before);
});
it("refuses a foreign cloud account and stale discovery instead of falsely connecting or enrolling",async()=>{
 state.account="111111111111";expect((await post({operation:"verify",connectionId:"aws"})).status).toBe(503);state.account="342206308838";
 expect((await post({...onboard(),scanId:randomUUID()})).status).toBe(409);
 state.setup=false;const response=await post({operation:"sources",connectionId:"aws"});expect(response.status).toBe(503);expect(await response.text()).not.toContain("private helper setup path");
});
it("inactive ownership stops saved observation reads",async()=>{
 await fixture.owner.query("UPDATE ll_members SET active=false WHERE email='owner@example.test'");
 try{expect((await post({operation:"history",connectionId:"aws",resourceArn:arn,version:"10",hours:24})).status).toBe(409);}finally{await fixture.owner.query("UPDATE ll_members SET active=true WHERE email='owner@example.test'");}
});
