import { expect, it, vi } from "vitest";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import type { Actor } from "../durable/contracts";
import { CloudOwnerReviewStore, parseCloudOwnerReview, type CloudOwnerReview } from "./cloud-owner-review";
const actor: Actor = { orgId: "company-a", subject: "reviewer@example.test", tokenHash: "session-a", role: "operator" };
const azureEndpoint = "https://company.services.ai.azure.com/api/projects/ops";
const sources = [
  { provider: "aws-agentcore-runtime", resource: "arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/service-1234567890", version: "1" },
  { provider: "azure-foundry", resource: `${azureEndpoint}/agents/ops/versions/1`, version: "1" },
  { provider: "google-agent-engine", resource: "projects/123456789012/locations/us-central1/reasoningEngines/1234", version: null },
] as const;
async function fixture(run: (db: Pool, store: CloudOwnerReviewStore, requests: CloudOwnerReview[], addScan: (p: CloudOwnerReview, at?: string) => Promise<CloudOwnerReview>) => Promise<void>) {
  const url = process.env.LOOPLABS_TEST_DATABASE_URL;
  if (!url) throw Error("Dedicated test PostgreSQL required; no skip.");
  const admin = new Pool({ connectionString: url }), schema = `owner_review_${randomBytes(8).toString("hex")}`, epoch = randomUUID(); let db: Pool | undefined;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`); db = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    for (const path of ["lib/durable/schema.sql", "lib/workspace/schema.sql", "lib/durable/recovery-schema.sql", "lib/workspace/cloud-inventory-schema.sql", "lib/workspace/cloud-project-schema.sql", "lib/workspace/cloud-owner-review-schema.sql"]) await db.query(await readFile(path, "utf8"));
    await db.query("INSERT INTO ll_orgs(id) VALUES('company-a'),('company-b')");
    await db.query("INSERT INTO ll_workspace_recovery(org_id,epoch) VALUES('company-a',$1),('company-b',$1)", [epoch]);
    await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('reviewer@example.test','company-a','Reviewer','fixture'),('owner@example.test','company-a','Owner','fixture'),('other@example.test','company-b','Other','fixture')");
    await db.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES('session-a','reviewer@example.test',now()+interval '1 hour'),('session-b','other@example.test',now()+interval '1 hour')");
    vi.stubEnv("LOOPLABS_RECOVERY_EPOCH", epoch);
    await db.query("INSERT INTO ll_cloud_connections(org_id,id,account_id,region,created_by) VALUES('company-a','aws-agentcore-runtime','123456789012','us-west-2','reviewer@example.test')");
    await db.query("INSERT INTO ll_cloud_project_connections(org_id,id,provider,directory_id,endpoint,project_id,project_number,location,created_by) VALUES('company-a','azure-foundry','azure-foundry','12345678-1234-1234-1234-123456789012',$1,NULL,NULL,NULL,'reviewer@example.test'),('company-a','google-agent-engine','google-agent-engine',NULL,NULL,'company-agents','123456789012','us-central1','reviewer@example.test')", [azureEndpoint]);
    const pool = db;
    const addScan = async (p: CloudOwnerReview, at = new Date().toISOString()) => {
      const scanId = randomUUID(), aws = p.provider === "aws-agentcore-runtime";
      await pool.query(`INSERT INTO ${aws ? "ll_cloud_scans" : "ll_cloud_project_scans"}(org_id,connection_id,id,observed_at,completeness,failures,canonical_sha256) VALUES('company-a',$1,$2,$3,'complete-api-traversal','{}',$4)`, [p.connectionId,scanId,at,"a".repeat(64)]);
      if (aws) await pool.query("INSERT INTO ll_cloud_runtime_observations(org_id,connection_id,scan_id,resource_id,resource_arn,version) VALUES('company-a',$1,$2,'service-1234567890',$3,$4)", [p.connectionId,scanId,p.resource,p.version]);
      else await pool.query("INSERT INTO ll_cloud_project_observations(org_id,connection_id,scan_id,resource,provider_version,identity_kind) VALUES('company-a',$1,$2,$3,$4,'unknown')", [p.connectionId,scanId,p.resource,p.version ?? ""]);
      return { ...p, scanId, id: randomUUID() };
    };
    const requests = await Promise.all(sources.map(s => addScan({ ...s, connectionId: s.provider, id: randomUUID(), scanId: randomUUID(), owner: "owner@example.test" })));
    await run(db, new CloudOwnerReviewStore(db), requests, addScan);
  } finally { vi.unstubAllEnvs(); await db?.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
}
it("strict review input refuses invented permissions, credentials, malformed references and versions", () => {
  const good = { ...sources[0], id: randomUUID(), scanId: randomUUID(), connectionId: "aws", owner: "OWNER@example.test" };
  expect(parseCloudOwnerReview(good).owner).toBe("owner@example.test");
  for (const value of [null, [], {}, { ...good, credentials: "secret" }, { ...good, authorityGranted: true }, { ...good, id: "bad" }, { ...good, scanId: null }, { ...good, provider: "other" }, { ...good, resource: "" }, { ...good, resource: "x".repeat(1025) }, { ...good, connectionId: "../other" }, { ...good, owner: "not-email" }, { ...good, owner: "x".repeat(255) }, { ...good, version: null }, { ...good, version: "../2" }, { ...good, provider: "google-agent-engine", version: "invented" }]) expect(() => parseCloudOwnerReview(value)).toThrow("Exact cloud observation");
});
it("all three provider reviews are durable, concurrent-idempotent and grant no execution authority", async () => fixture(async (db, store, requests) => {
  for (const p of requests) {
    expect(await store.status(actor,p)).toMatchObject({ ownership: "unmapped", owner: null });
    const results = await Promise.all([store.review(actor,p),store.review(actor,p)]);
    expect(results.map(r => r.repeated).sort()).toEqual([false,true]);
    expect(await store.status(actor,p)).toMatchObject({ ownership: "reviewed", owner: p.owner, reviewedBy: actor.subject, authorityGranted: false, enforcement: "unverified", workloadIdentity: "unverified" });
  }
  expect((await db.query("SELECT count(*)::int n FROM ll_cloud_owner_reviews")).rows[0].n).toBe(3);
  const reconnect = new Pool({ connectionString: process.env.LOOPLABS_TEST_DATABASE_URL, options: `-c search_path=${(await db.query("SELECT current_schema() s")).rows[0].s}` });
  try { expect(await new CloudOwnerReviewStore(reconnect).status(actor,requests[0])).toMatchObject({ ownership: "reviewed" }); } finally { await reconnect.end(); }
  for (const table of ["ll_agents","ll_tokens","ll_actions"]) expect((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0);
}));
it("same review identity cannot change owner, reviewer or evidence; remapping is append-only", async () => fixture(async (db, store, requests) => {
  const p=requests[0]; await store.review(actor,p);
  await expect(store.review(actor,{...p,owner:actor.subject})).rejects.toThrow("replay changed");
  const otherReviewer: Actor={...actor,subject:p.owner,tokenHash:"owner-session"};
  await db.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES('owner-session','owner@example.test',now()+interval '1 hour')");
  await expect(store.review(otherReviewer,p)).rejects.toThrow("replay changed");
  const changed={...p,id:randomUUID(),owner:actor.subject}; await store.review(actor,changed);
  expect(await store.status(actor,p)).toMatchObject({ owner:actor.subject,ownership:"reviewed" });
  expect((await db.query("SELECT count(*)::int n FROM ll_cloud_owner_reviews")).rows[0].n).toBe(2);
}));
it("new observations invalidate old owner review and stale snapshots cannot be mapped", async () => fixture(async (_db, store, requests, addScan) => {
  for (const p of requests) {
    await store.review(actor,p); const next=await addScan(p,new Date(Date.now()+1000).toISOString());
    expect(await store.status(actor,p)).toMatchObject({ownership:"needs-review"});
    expect(await store.status(actor,next)).toMatchObject({ownership:"needs-review"});
    await expect(store.review(actor,p)).rejects.toThrow("current cloud observation");
    await store.review(actor,next);expect(await store.status(actor,next)).toMatchObject({ownership:"reviewed"});
  }
  // A different resource in a connection with only old evidence cannot be reviewed.
  const p={...requests[0],connectionId:"stale"};
  await _db.query("INSERT INTO ll_cloud_connections(org_id,id,account_id,region,created_by) VALUES('company-a','stale','123456789012','us-west-2','reviewer@example.test')");
  const old=await addScan(p,new Date(Date.now()-901_000).toISOString());
  await expect(store.review(actor,old)).rejects.toThrow("current cloud observation");
}));
it("foreign owners, forged resources and wrong provider scopes cannot create a review", async () => fixture(async (_db, store, requests) => {
  for(const p of requests){
    await expect(store.review(actor,{...p,owner:"other@example.test"})).rejects.toThrow("active invited");
    await expect(store.review(actor,{...p,resource:p.resource+"-foreign"})).rejects.toThrow("current cloud observation");
    await expect(store.review(actor,{...p,connectionId:"missing"})).rejects.toThrow("current cloud observation");
  }
  await expect(store.review(actor,{...requests[1],provider:"google-agent-engine",version:null})).rejects.toThrow("current cloud observation");
}));
it("revoked owner and member/session/recovery fences retain history without authorizing anything", async () => fixture(async (db, store, requests) => {
  const p=requests[0];await store.review(actor,p);
  await db.query("UPDATE ll_members SET active=false WHERE email='owner@example.test'");
  expect(await store.status(actor,p)).toMatchObject({ownership:"needs-review"});
  await expect(store.review(actor,p)).rejects.toThrow("active invited");
  const foreign:Actor={orgId:"company-b",subject:"other@example.test",tokenHash:"session-b",role:"operator"};
  expect(await store.status(foreign,p)).toMatchObject({ownership:"unmapped"});
  await expect(store.review(foreign,p)).rejects.toThrow("current cloud observation");
  for(const denied of [{...actor,tokenHash:"missing"},{...actor,role:"agent" as const}]){
    await expect(store.review(denied,p)).rejects.toThrow("member required");await expect(store.status(denied,p)).rejects.toThrow("member required");
  }
  await db.query("UPDATE ll_sessions SET expires_at=now()-interval '1 second' WHERE hash='session-a'");
  await expect(store.status(actor,p)).rejects.toThrow("member required");
  await db.query("UPDATE ll_sessions SET expires_at=now()+interval '1 hour' WHERE hash='session-a'");
  vi.stubEnv("LOOPLABS_RECOVERY_EPOCH",randomUUID());await expect(store.review(actor,p)).rejects.toThrow("contained");
}));
it("database boundary independently refuses direct history rewrites and substituted evidence", async () => fixture(async (db, store, requests) => {
  for(const p of requests)await store.review(actor,p);
  for(const sql of ["UPDATE ll_cloud_owner_reviews SET owner_email=owner_email","DELETE FROM ll_cloud_owner_reviews"])await expect(db.query(sql)).rejects.toMatchObject({code:"23514"});
  for(const change of ["owner_email='other@example.test'","scan_sha256='"+"b".repeat(64)+"'","resource=resource||'-foreign'","scan_id='"+randomUUID()+"'"]){
    const cte="WITH original AS (SELECT * FROM ll_cloud_owner_reviews LIMIT 1), changed AS (SELECT org_id,gen_random_uuid() id,provider,connection_id,scan_id,scan_sha256,resource,provider_version,owner_email,reviewed_by FROM original) ";
    const fields=["org_id","id","provider","connection_id","scan_id","scan_sha256","resource","provider_version","owner_email","reviewed_by"];
    const [field,value]=change.split("=");
    await expect(db.query(cte+`INSERT INTO ll_cloud_owner_reviews(${fields.join()}) SELECT ${fields.map(f=>f===field?value:f).join()} FROM changed`)).rejects.toMatchObject({code:"23514"});
  }
}));
it("restricted runtime writes reviews with read-only members and cannot rewrite history or provision agents", async () => fixture(async (db, _store, requests) => {
  const role=`owner_review_runtime_${randomBytes(8).toString("hex")}`,schema=(await db.query("SELECT current_schema() s")).rows[0].s;
  await db.query(`CREATE ROLE ${role} NOLOGIN`);
  const connection=new URL(process.env.LOOPLABS_TEST_DATABASE_URL!);connection.searchParams.set("options",`-c search_path=${schema} -c role=${role}`);
  const runtime=new Pool({connectionString:connection.toString()});
  try{
    await db.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
    await db.query(`GRANT SELECT,UPDATE ON ll_orgs TO ${role}`);
    await db.query(`GRANT SELECT ON ll_members,ll_sessions,ll_workspace_recovery,ll_cloud_scans,ll_cloud_runtime_observations,ll_cloud_project_connections,ll_cloud_project_scans,ll_cloud_project_observations TO ${role}`);
    await db.query(`GRANT SELECT,INSERT ON ll_cloud_owner_reviews TO ${role}`);
    const store=new CloudOwnerReviewStore(runtime);
    for(const p of requests){expect(await store.review(actor,p)).toMatchObject({authorityGranted:false});expect(await store.status(actor,p)).toMatchObject({ownership:"reviewed"});}
    for(const sql of ["UPDATE ll_cloud_owner_reviews SET owner_email=owner_email","DELETE FROM ll_cloud_owner_reviews","TRUNCATE ll_cloud_owner_reviews","UPDATE ll_members SET active=false","INSERT INTO ll_agents(org_id,id,tools,action_limit) VALUES('company-a','forged','{}',1)"])
      await expect(runtime.query(sql)).rejects.toMatchObject({code:"42501"});
  }finally{await runtime.end();await db.query(`DROP OWNED BY ${role}`);await db.query(`DROP ROLE ${role}`);}
}));
