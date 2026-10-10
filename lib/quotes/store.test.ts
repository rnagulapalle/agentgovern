import { expect, it, vi } from "vitest";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import type { Actor } from "../durable/contracts";
import { QuotePlanStore, quotePlanDigest, type QuoteContextLoader } from "./store";
import { validateQuotePlan, type QuotePlanContext, type QuotePlanProposal } from "./plan";
import { QuoteAuthorityControl } from "./authority";
import { validateQuotePlanV2, assertBoundQuotePlanContract, type QuotePlanProposalV2, type QuotePlanContextV2 } from "./plan-v2";
import { transaction } from "../durable/database";

const owner: Actor = { orgId: "company-a", subject: "owner@example.test", role: "operator", tokenHash: "session-owner" };
const manager: Actor = { ...owner, subject: "manager@example.test", tokenHash: "session-manager" };
const foreign: Actor = { ...owner, orgId: "company-b", subject: "other@example.test", tokenHash: "session-other" };
function data(): { proposal: QuotePlanProposal; context: QuotePlanContext } {
  const quote = { id: "quote-42", distributorId: "distributor-7", recipient: "buyer@example.test", sourceVersion: "v3",
    currency: "USD" as const, subtotalMinor: 100_000, lines: [{ id: "line-1", quantity: 10, unitPriceMinor: 10_000 }] };
  return {
    proposal: { version: "distributor-quote-plan-1", planId: randomUUID(), workspaceId: owner.orgId,
      requester: owner.subject, approver: manager.subject, policyVersion: 3, quote: structuredClone(quote), discountBps: 1400,
      update: { actionId: randomUUID(), agentId: "quote-agent" },
      message: { actionId: randomUUID(), agentId: "message-agent", dependsOn: "" } },
    context: { workspaceId: owner.orgId, requester: owner.subject, quote: structuredClone(quote),
      approvalGrants: [{ member: manager.subject, workspaceId: owner.orgId, quoteId: quote.id, policyVersion: 3, active: true, capability: "quote.discount.approve" }],
      policy: { version: 3, delegatedBps: 1000, hardCapBps: 2000, active: true },
      agents: [
        { id: "quote-agent", workspaceId: owner.orgId, quoteId: quote.id, action: "quote.update", active: true },
        { id: "message-agent", workspaceId: owner.orgId, quoteId: quote.id, action: "quote.message", active: true },
      ],
      provider: { workspaceId: owner.orgId, quoteId: quote.id, contract: "quote-conditional-write-1", binding: "a".repeat(64), atomicSourceVersion: true, actionIdIdempotency: true, effectReadback: true },
      email: { workspaceId: owner.orgId, quoteId: quote.id, from: "sales@example.test", recipient: quote.recipient, actionIdIdempotency: true, effectReadback: true },
    },
  };
}
async function fixture(run: (db: Pool, store: QuotePlanStore, proposal: QuotePlanProposal, context: QuotePlanContext, loader: QuoteContextLoader, epoch: string, schema: string) => Promise<void>) {
  const url = process.env.LOOPLABS_TEST_DATABASE_URL;
  if (!url) throw Error("Dedicated test PostgreSQL required; no skip.");
  const admin = new Pool({ connectionString: url }), schema = `quote_store_${randomBytes(8).toString("hex")}`, epoch = randomUUID();
  let db: Pool | undefined;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    db = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
    for (const path of ["lib/durable/schema.sql", "lib/workspace/schema.sql", "lib/durable/recovery-schema.sql", "lib/quotes/schema.sql"]) await db.query(await readFile(path, "utf8"));
    await db.query("INSERT INTO ll_orgs(id) VALUES('company-a'),('company-b')");
    await db.query("INSERT INTO ll_workspace_recovery(org_id,epoch) VALUES('company-a',$1),('company-b',$1)", [epoch]);
    await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('owner@example.test','company-a','Owner','fixture'),('manager@example.test','company-a','Manager','fixture'),('other@example.test','company-b','Other','fixture')");
    await db.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES('session-owner','owner@example.test',now()+interval '1 hour'),('session-manager','manager@example.test',now()+interval '1 hour'),('session-other','other@example.test',now()+interval '1 hour')");
    const { proposal, context } = data(); proposal.message.dependsOn = proposal.update.actionId;
    // Test-owned source/capability fixture, not proof of a shipped quote connector.
    const loader: QuoteContextLoader = async (client, actor, reference) => {
      expect(reference).toEqual({ quoteId: "quote-42", distributorId: "distributor-7" });
      expect(actor.orgId).toBe(owner.orgId);
      const active = (await client.query("SELECT 1 FROM ll_members WHERE email=$1 AND org_id=$2 AND active=true", [manager.subject, actor.orgId])).rows.length;
      return { ...structuredClone(context), approvalGrants: active ? structuredClone(context.approvalGrants) : [] };
    };
    vi.stubEnv("LOOPLABS_RECOVERY_EPOCH", epoch);
    await run(db, new QuotePlanStore(db, loader), proposal, context, loader, epoch, schema);
  } finally { vi.unstubAllEnvs(); await db?.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); }
}

it("canonical hash is object-order independent and refuses non-JSON or excessive input", () => {
  expect(quotePlanDigest({ b: 2, a: { d: 4, c: 3 } })).toBe(quotePlanDigest({ a: { c: 3, d: 4 }, b: 2 }));
  for (const value of [undefined, NaN, Infinity, () => null, [undefined], new Date(), { secret: undefined }]) expect(() => quotePlanDigest(value)).toThrow("Exact JSON");
  expect(() => quotePlanDigest("x".repeat(65_537))).toThrow("bounded content");
});
it("actual concurrent identical saves retain one exact immutable plan and no action authority", async () => fixture(async (db, store, p) => {
  const results = await Promise.all(Array.from({ length: 6 }, () => store.save(owner, p)));
  results.forEach(result => expect(result).toEqual(results[0]));
  expect((await db.query("SELECT count(*)::int n FROM ll_quote_plans")).rows[0].n).toBe(1);
  expect(await store.read(owner, p.planId)).toEqual(results[0]);
  expect(await store.list(owner)).toEqual([results[0]]);
  expect(results[0].plan).not.toHaveProperty("approved_by");
  for (const table of ["ll_actions", "ll_events", "ll_effects", "ll_tokens", "ll_agents"])
    expect((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0);
}));
it("changed reuse and collisions across both action columns or plan IDs refuse", async () => fixture(async (db, store, p) => {
  await store.save(owner, p);
  await expect(store.save(owner, { ...p, discountBps: 1500 })).rejects.toThrow("different saved work");
  for (const collision of ["quote", "message", "plan"] as const) {
    const next = structuredClone(p); next.planId = randomUUID(); next.update.actionId = randomUUID(); next.message.actionId = randomUUID();
    if (collision === "quote") next.message.actionId = p.update.actionId;
    if (collision === "message") next.update.actionId = p.message.actionId;
    if (collision === "plan") next.update.actionId = p.planId;
    next.message.dependsOn = next.update.actionId;
    await expect(store.save(owner, next)).rejects.toThrow("already belong");
  }
  expect((await db.query("SELECT count(*)::int n FROM ll_quote_plans")).rows[0].n).toBe(1);
}));
it("save loads only server-owned scoped references and rechecks current policy/source/grants on duplicate", async () => fixture(async (_db, store, p, context) => {
  await store.save(owner, p);
  context.quote.sourceVersion = "v4";
  await expect(store.save(owner, p)).rejects.toThrow("current scoped quote");
  context.quote.sourceVersion = "v3"; context.policy.version = 4;
  await expect(store.save(owner, p)).rejects.toThrow("current scoped quote");
  context.policy.version = 3; context.approvalGrants = [];
  await expect(store.save(owner, p)).rejects.toThrow("current scoped quote");
  await expect(store.save(owner, { ...p, trustedContext: data().context })).rejects.toThrow("current scoped quote");
}));
it("named owner and workspace isolate reads/list/save and revoked or expired identities refuse", async () => fixture(async (db, store, p) => {
  await store.save(owner, p);
  expect(await store.list(manager)).toEqual([]);
  expect(await store.list(foreign)).toEqual([]);
  await expect(store.read(manager, p.planId)).rejects.toThrow("not found");
  await expect(store.read(foreign, p.planId)).rejects.toThrow("not found");
  await expect(store.save(foreign, p)).rejects.toThrow("does not belong");
  await expect(store.save(manager, p)).rejects.toThrow("does not belong");
  await expect(store.save({ ...owner, role: "agent" }, p)).rejects.toThrow("cannot perform");
  await expect(store.read({ ...owner, tokenHash: "invalid" }, p.planId)).rejects.toThrow("cannot perform");
  await db.query("UPDATE ll_sessions SET expires_at=now()-interval '1 minute' WHERE hash='session-owner'");
  await expect(store.list(owner)).rejects.toThrow("cannot perform");
  await db.query("UPDATE ll_sessions SET expires_at=now()+interval '1 hour' WHERE hash='session-owner'");
  await db.query("UPDATE ll_members SET active=false WHERE email=$1", [owner.subject]);
  await expect(store.save(owner, p)).rejects.toThrow("cannot perform");
  await expect(store.read(owner, p.planId)).rejects.toThrow("cannot perform");
}));
it("legacy operator keys cannot substitute invited member sessions and revoked manager eligibility stops save", async () => fixture(async (db, store, p) => {
  await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES('legacy','company-a','owner@example.test','operator')");
  await expect(store.save({ ...owner, tokenHash: "legacy" }, p)).rejects.toThrow("named member session");
  await db.query("UPDATE ll_members SET active=false WHERE email=$1", [manager.subject]);
  await expect(store.save(owner, p)).rejects.toThrow("current scoped quote");
  expect((await db.query("SELECT count(*)::int n FROM ll_quote_plans")).rows[0].n).toBe(0);
}));
it("identity revoked inside context loading is refused before insert", async () => fixture(async (db, _store, p, _context, loader) => {
  const revoke: QuoteContextLoader = async (client, actor, ref) => {
    const result = await loader(client, actor, ref);
    await client.query("UPDATE ll_members SET active=false WHERE email=$1", [actor.subject]);
    return result;
  };
  await expect(new QuotePlanStore(db, revoke).save(owner, p)).rejects.toThrow("cannot perform");
  expect((await db.query("SELECT count(*)::int n FROM ll_quote_plans")).rows[0].n).toBe(0);
}));
it("actual concurrent reviewer revocation after context read refuses persistence", async () => fixture(async (db, _store, p, _context, loader) => {
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const delayed: QuoteContextLoader = async (client, actor, ref) => {
    const snapshot = await loader(client, actor, ref);
    enter(); await gate; return snapshot;
  };
  const pending = new QuotePlanStore(db, delayed).save(owner, p);
  // Attach the refusal expectation immediately, before releasing the async writer.
  const refused = expect(pending).rejects.toThrow("current independent workspace reviewer");
  await entered;
  try { await db.query("UPDATE ll_members SET active=false WHERE email=$1", [manager.subject]); }
  finally { release(); }
  await refused;
  expect((await db.query("SELECT active FROM ll_members WHERE email=$1", [manager.subject])).rows[0].active).toBe(false);
  expect((await db.query("SELECT count(*)::int n FROM ll_quote_plans")).rows[0].n).toBe(0);
}));
it("trusted capability snapshot cannot substitute an absent or foreign reviewer member", async () => fixture(async (db, _store, p, context) => {
  const absent = { ...p, approver: "absent@example.test" };
  const absentContext = { ...context, approvalGrants: [{ ...context.approvalGrants[0], member: absent.approver }] };
  await expect(new QuotePlanStore(db, async () => absentContext).save(owner, absent)).rejects.toThrow("current independent workspace reviewer");
  const cross = { ...p, approver: foreign.subject };
  const crossContext = { ...context, approvalGrants: [{ ...context.approvalGrants[0], member: foreign.subject }] };
  await expect(new QuotePlanStore(db, async () => crossContext).save(owner, cross)).rejects.toThrow("current independent workspace reviewer");
}));
it("proposal snapshot cannot be changed while server context loads", async () => fixture(async (db, _store, p, _context, loader) => {
  const mutation: QuoteContextLoader = async (client, actor, ref) => {
    p.discountBps = 1500;
    return loader(client, actor, ref);
  };
  const saved = await new QuotePlanStore(db, mutation).save(owner, p);
  expect(saved.plan.discountBps).toBe(1400);
  expect(saved.plan.totalMinor).toBe(86_000);
}));
it("fresh PostgreSQL service connection reads identical saved IDs and payload after restart", async () => fixture(async (db, store, p, _context, loader, _epoch, schema) => {
  const initial = await store.save(owner, p);
  const reconnect = new Pool({ connectionString: process.env.LOOPLABS_TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  try {
    const fresh = new QuotePlanStore(reconnect, loader);
    expect(await fresh.read(owner, p.planId)).toEqual(initial);
    expect(await fresh.save(owner, p)).toEqual(initial);
  } finally { await reconnect.end(); }
  expect((await db.query("SELECT count(*)::int n FROM ll_quote_plans")).rows[0].n).toBe(1);
}));
it("PostgreSQL refuses rewriting, deletion, truncation and cross-step ID aliasing", async () => fixture(async (db, store, p) => {
  await store.save(owner, p);
  for (const sql of ["UPDATE ll_quote_plans SET plan_hash=repeat('b',64)", "UPDATE ll_quote_plans SET created_by='manager@example.test'", "DELETE FROM ll_quote_plans", "TRUNCATE ll_quote_plans"])
    await expect(db.query(sql)).rejects.toThrow("cannot be rewritten or deleted");
  const next = structuredClone(p); next.planId = randomUUID(); next.update.actionId = p.message.actionId; next.message.actionId = randomUUID(); next.message.dependsOn = next.update.actionId;
  const plan = validateQuotePlan(next, data().context);
  await expect(db.query("INSERT INTO ll_quote_plans(org_id,id,created_by,recovery_epoch,proposal,proposal_hash,plan,plan_hash,quote_action_id,message_action_id) SELECT org_id,$1,created_by,recovery_epoch,$2,$3,$4,$5,$6,$7 FROM ll_quote_plans LIMIT 1",
    [next.planId, JSON.stringify(next), quotePlanDigest(next), JSON.stringify(plan), quotePlanDigest(plan), next.update.actionId, next.message.actionId])).rejects.toThrow("already belongs");
}));
it("saved hash tampering refuses read and list even when inserted by privileged migration owner", async () => fixture(async (db, store, p, context, _loader, epoch) => {
  const plan = validateQuotePlan(p, context);
  await db.query("INSERT INTO ll_quote_plans(org_id,id,created_by,recovery_epoch,proposal,proposal_hash,plan,plan_hash,quote_action_id,message_action_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [owner.orgId, p.planId, owner.subject, epoch, JSON.stringify(p), quotePlanDigest(p), JSON.stringify(plan), "b".repeat(64), p.update.actionId, p.message.actionId]);
  await expect(store.read(owner, p.planId)).rejects.toThrow("integrity");
  await expect(store.list(owner)).rejects.toThrow("integrity");
  await expect(store.save(owner, p)).rejects.toThrow("different saved work");
}));
it("database insert constraints refuse absent identity, wrong owner and waived dependency/approval", async () => fixture(async (db, _store, p, context, _loader, epoch) => {
  const insert = (proposal: unknown, plan: unknown, recovery = epoch, createdBy = owner.subject) => db.query(
    "INSERT INTO ll_quote_plans(org_id,id,created_by,recovery_epoch,proposal,proposal_hash,plan,plan_hash,quote_action_id,message_action_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [owner.orgId, p.planId, createdBy, recovery, JSON.stringify(proposal), quotePlanDigest(proposal), JSON.stringify(plan), quotePlanDigest(plan), p.update.actionId, p.message.actionId]);
  const plan = validateQuotePlan(p, context);
  await expect(insert(p, plan, randomUUID())).rejects.toThrow("current enrolled recovery");
  await expect(insert(p, plan, epoch, foreign.subject)).rejects.toThrow("active workspace member");
  const foreignPlan = { ...plan, approver: foreign.subject };
  await expect(insert({ ...p, approver: foreign.subject }, foreignPlan)).rejects.toThrow("independent workspace reviewer");
  await expect(insert({ ...p, update: null }, plan)).rejects.toThrow("check constraint");
  await expect(insert(p, { ...plan, requester: manager.subject })).rejects.toThrow("check constraint");
  await expect(insert(p, { ...plan, update: { ...plan.update, approvalRequired: false } })).rejects.toThrow("check constraint");
  await expect(insert(p, { ...plan, message: { ...plan.message, dependency: null } })).rejects.toThrow("check constraint");
  await db.query("UPDATE ll_members SET active=false WHERE email=$1", [manager.subject]);
  await expect(insert(p, plan)).rejects.toThrow("independent workspace reviewer");
  expect((await db.query("SELECT count(*)::int n FROM ll_quote_plans")).rows[0].n).toBe(0);
}));
it("separate restricted PostgreSQL runtime cannot update, delete or truncate saved proposals", async () => fixture(async (db, store, p, _context, _loader, _epoch, schema) => {
  await store.save(owner, p);
  const role = `quote_runtime_${randomBytes(8).toString("hex")}`;
  await db.query(`CREATE ROLE ${role} NOLOGIN`);
  let runtime: Pool | undefined;
  try {
    await db.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
    await db.query(`GRANT SELECT,INSERT ON ll_quote_plans TO ${role}`);
    await db.query(`GRANT SELECT,UPDATE ON ll_orgs TO ${role}`);
    await db.query(`GRANT SELECT ON ll_tokens,ll_members,ll_sessions,ll_workspace_recovery TO ${role}`);
    runtime = new Pool({ connectionString: process.env.LOOPLABS_TEST_DATABASE_URL, options: `-c search_path=${schema} -c role=${role}` });
    expect((await new QuotePlanStore(runtime, async () => null).read(owner, p.planId)).planHash).toBe((await store.read(owner, p.planId)).planHash);
    for (const sql of ["UPDATE ll_quote_plans SET plan_hash=repeat('c',64)", "DELETE FROM ll_quote_plans", "TRUNCATE ll_quote_plans"])
      await expect(runtime.query(sql)).rejects.toThrow("permission denied");
  } finally { await runtime?.end(); await db.query(`DROP OWNED BY ${role}`); await db.query(`DROP ROLE ${role}`); }
}));
it("owner list is bounded to 30 saved proposals without creating work", async () => fixture(async (_db, store, p) => {
  for (let i = 0; i < 31; i++) {
    const next = structuredClone(p); next.planId = randomUUID(); next.update.actionId = randomUUID(); next.message.actionId = randomUUID(); next.message.dependsOn = next.update.actionId;
    await store.save(owner, next);
  }
  expect(await store.list(owner)).toHaveLength(30);
}));
it("recovery epoch mismatch contains old saved proposals and missing recovery is never disabled", async () => fixture(async (db, store, p, _context, _loader, epoch) => {
  await store.save(owner, p);
  vi.stubEnv("LOOPLABS_RECOVERY_EPOCH", randomUUID());
  await expect(store.read(owner, p.planId)).rejects.toThrow("contained");
  await expect(store.save(owner, p)).rejects.toThrow("contained");
  vi.stubEnv("LOOPLABS_RECOVERY_EPOCH", epoch);
  await db.query("UPDATE ll_workspace_recovery SET epoch=$1", [randomUUID()]);
  await expect(store.list(owner)).rejects.toThrow("contained");
  const restoredEpoch = randomUUID();
  await db.query("UPDATE ll_workspace_recovery SET epoch=$1", [restoredEpoch]);
  vi.stubEnv("LOOPLABS_RECOVERY_EPOCH", restoredEpoch);
  // Even valid fresh deployment authority cannot silently adopt an older proposal snapshot.
  await expect(store.read(owner, p.planId)).rejects.toThrow("contained");
  await expect(store.save(owner, p)).rejects.toThrow("contained");
  await db.query("UPDATE ll_workspace_recovery SET epoch=$1", [epoch]);
  vi.stubEnv("LOOPLABS_RECOVERY_EPOCH", "");
  await expect(store.list(owner)).rejects.toThrow("recovery configuration");
  vi.stubEnv("LOOPLABS_RECOVERY_EPOCH", undefined);
  await expect(store.list(owner)).rejects.toThrow("enrolled workspace recovery");
}));
it("malformed references/read IDs refuse before authority or context access", async () => fixture(async (db, _store, p) => {
  const load = vi.fn(); const store = new QuotePlanStore(db, load);
  for (const input of [null, [], {}, { ...p, planId: "bad" }, { ...p, quote: null }, { ...p, quote: { id: "../other", distributorId: "distributor-7" } }])
    await expect(store.save(owner, input)).rejects.toThrow();
  for (const id of ["", "bad", "00000000-0000-1000-8000-000000000001"]) await expect(store.read(owner, id)).rejects.toThrow("proposal ID");
  expect(load).not.toHaveBeenCalled();
}));

async function v2Fixture(run:(db:Pool,store:QuotePlanStore,p:QuotePlanProposalV2,context:QuotePlanContextV2,control:QuoteAuthorityControl,legacyId:string,schema:string)=>Promise<void>, installMembership = true) {
 await fixture(async(db,legacy,p,pricing,_loader,epoch,schema)=>{
  await legacy.save(owner,p);const legacyId=p.planId;
  for(const file of ["lib/connectors/scope-schema.sql","lib/quotes/authority-schema.sql","lib/quotes/plan-v2-schema.sql",...(installMembership?["lib/quotes/membership-schema.sql"]:[])])await db.query(await readFile(file,"utf8"));
  const control=new QuoteAuthorityControl(db,{contract:"private-quote-twin-1",workspaceId:owner.orgId,quoteId:p.quote.id,distributorId:p.quote.distributorId,recipient:p.quote.recipient,sender:pricing.email.from,quoteBinding:pricing.provider.binding,emailBinding:"b".repeat(64)}),scope=randomUUID();
  await control.enroll(owner,scope);await control.grantManager(owner,scope,manager.subject,3);
  const snapshot=await transaction(db,owner.orgId,c=>control.currentAuthority(c,owner,scope,manager.subject,3));if(!snapshot)throw Error("Fixture authority absent");expect(snapshot.recoveryEpoch).toBe(epoch);
  const proposal:QuotePlanProposalV2={...structuredClone(p),version:"distributor-quote-plan-2",planId:randomUUID(),authority:snapshot,update:{...p.update,actionId:randomUUID()},message:{...p.message,actionId:randomUUID()}};proposal.message.dependsOn=proposal.update.actionId;
  const context:QuotePlanContextV2={contract:"quote-plan-context-2",pricing:structuredClone(pricing),authority:structuredClone(snapshot)};
  const loader:QuoteContextLoader=async()=>structuredClone(context),resolver=control.currentAuthority.bind(control);
  const store=new QuotePlanStore(db,loader,(c,a,r)=>resolver(c,a,r.scopeId,r.member,r.policyVersion));
  await run(db,store,proposal,context,control,legacyId,schema);
 });
}
it("bound v2 stores exact current authority concurrently while historical v1 stays original/readable",async()=>v2Fixture(async(db,store,p,_c,_control,legacyId)=>{
 const results=await Promise.all(Array.from({length:5},()=>store.save(owner,p)));results.forEach(r=>expect(r).toEqual(results[0]));
 const old=await store.read(owner,legacyId);expect(old.plan.version).toBe("distributor-quote-plan-1");expect(old.plan).not.toHaveProperty("authority");expect(()=>assertBoundQuotePlanContract(old.plan)).toThrow("Historical");
 expect(results[0].plan.version).toBe("distributor-quote-plan-2");expect(()=>assertBoundQuotePlanContract(results[0].plan)).not.toThrow();
 expect((await db.query("SELECT count(*)::int n FROM ll_quote_plans")).rows[0].n).toBe(2);expect((await store.list(owner)).map(row=>row.id)).toContain(legacyId);
 await expect(store.save(owner,{...p,discountBps:1500})).rejects.toThrow("different saved work");
}));
it("bound v2 requires server resolver and refuses stale revoked/reactivated scope and grant snapshots",async()=>v2Fixture(async(db,store,p,c,control)=>{
 await expect(new QuotePlanStore(db,async()=>c).save(owner,p)).rejects.toThrow("resolver");await store.save(owner,p);
 await control.setManagerActive(owner,p.authority.scopeId,manager.subject,3,false,1);await expect(store.save(owner,p)).rejects.toThrow("changed");
 await control.setManagerActive(owner,p.authority.scopeId,manager.subject,3,true,2);await expect(store.save(owner,p)).rejects.toThrow("changed");
 c.authority.grantVersion=3;p.authority.grantVersion=3;await expect(store.save(owner,p)).rejects.toThrow("different saved work");
 await control.setScopeActive(owner,p.authority.scopeId,false,1);await expect(store.save(owner,p)).rejects.toThrow("changed");
 await control.setScopeActive(owner,p.authority.scopeId,true,2);await expect(store.save(owner,p)).rejects.toThrow("changed");
}));
it("bound v2 rechecks authority after awaited loader and immediately before insert/duplicate",async()=>v2Fixture(async(db,_store,p,c,control)=>{
 const resolver=(client:import("pg").PoolClient,a:Actor,r:{scopeId:string;member:string;policyVersion:number})=>control.currentAuthority(client,a,r.scopeId,r.member,r.policyVersion);
 const loading=new QuotePlanStore(db,async client=>{const snapshot=structuredClone(c);await client.query("UPDATE ll_quote_manager_grants SET active=false,version=version+1 WHERE scope_id=$1",[p.authority.scopeId]);return snapshot;},resolver);
 await expect(loading.save(owner,p)).rejects.toThrow("changed");
 let calls=0;const changeBeforeInsert=new QuotePlanStore(db,async()=>c,async(client,a,r)=>{
  calls++;if(calls===2)await client.query("UPDATE ll_connector_scopes SET active=false,version=version+1 WHERE id=$1",[r.scopeId]);return resolver(client,a,r);
 });await expect(changeBeforeInsert.save(owner,p)).rejects.toThrow("changed");expect(calls).toBe(2);
 const saved=new QuotePlanStore(db,async()=>c,resolver);await saved.save(owner,p);calls=0;
 const changeBeforeDuplicate=new QuotePlanStore(db,async()=>c,async(client,a,r)=>{calls++;if(calls===2)await client.query("UPDATE ll_quote_manager_grants SET active=false,version=version+1 WHERE scope_id=$1",[r.scopeId]);return resolver(client,a,r);});
 await expect(changeBeforeDuplicate.save(owner,p)).rejects.toThrow("changed");expect(calls).toBe(2);
 // Failed transactions roll back attempted fixture mutations; no stale v2 was inserted.
 expect((await db.query("SELECT count(*)::int n FROM ll_quote_plans")).rows[0].n).toBe(2);
}));
it("bound v2 observes member workspace/recovery changes and requires fresh selected-manager review",async()=>v2Fixture(async(db,store,p,c,control)=>{
 await store.save(owner,p);await db.query("UPDATE ll_members SET org_id='company-b' WHERE email=$1",[manager.subject]);await expect(store.save(owner,p)).rejects.toThrow();
 await db.query("UPDATE ll_members SET org_id='company-a' WHERE email=$1",[manager.subject]);await expect(store.save(owner,p)).rejects.toThrow("changed");
 await control.setManagerActive(owner,p.authority.scopeId,manager.subject,3,true,2);
 await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('fresh@example.test','company-a','Fresh','fixture')");await control.grantManager(owner,p.authority.scopeId,"fresh@example.test",3);
 const next=await transaction(db,owner.orgId,client=>control.currentAuthority(client,owner,p.authority.scopeId,"fresh@example.test",3));if(!next)throw Error("Fixture authority absent");
 const changed={...p,approver:next.member,authority:next};const freshContext={...c,authority:next,pricing:{...c.pricing,approvalGrants:[{...c.pricing.approvalGrants[0],member:next.member}]}};
 const newStore=new QuotePlanStore(db,async()=>freshContext,(client,a,r)=>control.currentAuthority(client,a,r.scopeId,r.member,r.policyVersion));await expect(newStore.save(owner,changed)).rejects.toThrow("different saved work");
 const fresh={...changed,planId:randomUUID(),update:{...p.update,actionId:randomUUID()},message:{...p.message,actionId:randomUUID()}};fresh.message.dependsOn=fresh.update.actionId;expect((await newStore.save(owner,fresh)).plan.approver).toBe(next.member);
 const epoch=randomUUID();vi.stubEnv("LOOPLABS_RECOVERY_EPOCH",epoch);await expect(store.read(owner,p.planId)).rejects.toThrow();await db.query("UPDATE ll_workspace_recovery SET epoch=$1 WHERE org_id=$2",[epoch,owner.orgId]);await expect(store.save(owner,p)).rejects.toThrow("changed");await expect(store.read(owner,p.planId)).rejects.toThrow("contained");
}));
it("SQL v2 insert rejects stale or injected scope/grant/bindings/recovery despite correctly recalculated hashes",async()=>v2Fixture(async(db,_store,p,c,control)=>{
 const insert=async(value:QuotePlanProposalV2,context:QuotePlanContextV2)=>{
  const plan=validateQuotePlanV2(value,context);return db.query("INSERT INTO ll_quote_plans(org_id,id,created_by,recovery_epoch,proposal,proposal_hash,plan,plan_hash,quote_action_id,message_action_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[owner.orgId,value.planId,owner.subject,c.authority.recoveryEpoch,JSON.stringify(value),quotePlanDigest(value),JSON.stringify(plan),quotePlanDigest(plan),value.update.actionId,value.message.actionId]);
 };
 for(const override of [{scopeVersion:2},{grantVersion:2},{scopeId:randomUUID()},{emailBinding:"c".repeat(64)},{recoveryEpoch:randomUUID()}]){
  const value=structuredClone(p),context=structuredClone(c);Object.assign(value.authority,override);Object.assign(context.authority,override);await expect(insert(value,context)).rejects.toThrow();
 }
 await control.setManagerActive(owner,p.authority.scopeId,manager.subject,3,false,1);await expect(insert(p,c)).rejects.toThrow("current enrolled");
 expect((await db.query("SELECT count(*)::int n FROM ll_quote_plans")).rows[0].n).toBe(1);
}));
it("bound persisted v2 survives fresh pool/service restart with unchanged immutable contract",async()=>v2Fixture(async(db,store,p,c,control,_legacyId,schema)=>{
 const saved=await store.save(owner,p);const restarted=new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL,options:`-c search_path=${schema}`});
 try{const freshControl=new QuoteAuthorityControl(restarted,control.destination),fresh=new QuotePlanStore(restarted,async()=>c,(client,a,r)=>freshControl.currentAuthority(client,a,r.scopeId,r.member,r.policyVersion));expect(await fresh.read(owner,p.planId)).toEqual(saved);expect(await fresh.save(owner,p)).toEqual(saved);}finally{await restarted.end();}
 await expect(store.read(foreign,p.planId)).rejects.toThrow("not found");await expect(store.save(foreign,p)).rejects.toThrow("does not belong");
}));

it("SQL bound-plan correlations reject malicious exact-request changes with valid recomputed hashes",async()=>v2Fixture(async(db,_store,p,c)=>{
 const original=validateQuotePlanV2(p,c);
 for(const mutate of [
  (plan:typeof original)=>{plan.message.request.idempotencyKey=randomUUID();},
  (plan:typeof original)=>{plan.update.request.sourceVersion="other";},
  (plan:typeof original)=>{plan.update.request.body.totalMinor=1;},
  (plan:typeof original)=>{plan.message.request.binding="c".repeat(64);},
  (plan:typeof original)=>{plan.message.request.body.to=["wrong@example.test"];},
  (plan:typeof original)=>{plan.message.request.workspaceId="company-b";},
  (plan:typeof original)=>{plan.update.request.resource="/quotes/other";},
  (plan:typeof original)=>{plan.message.dependency.actionId=randomUUID();},
 ]){
  const plan=structuredClone(original);mutate(plan);
  await expect(db.query("INSERT INTO ll_quote_plans(org_id,id,created_by,recovery_epoch,proposal,proposal_hash,plan,plan_hash,quote_action_id,message_action_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",[owner.orgId,p.planId,owner.subject,p.authority.recoveryEpoch,JSON.stringify(p),quotePlanDigest(p),JSON.stringify(plan),quotePlanDigest(plan),p.update.actionId,p.message.actionId])).rejects.toThrow();
 }
 expect((await db.query("SELECT count(*)::int n FROM ll_quote_plans")).rows[0].n).toBe(1);
}));

it("actual bound v2 save accepts independently invited real-domain owner/manager but still uses isolated email destinations",async()=>v2Fixture(async(db,_store,p,c,control)=>{
 const realOwner:Actor={...owner,subject:"owner@company.example",tokenHash:"real-owner-session"},realManager="manager@company.example";
 await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('owner@company.example','company-a','Owner','fixture'),('manager@company.example','company-a','Manager','fixture'),('foreign@company.example','company-b','Foreign','fixture')");
 await db.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES('real-owner-session','owner@company.example',now()+interval '1 hour')");
 await control.grantManager(realOwner,p.authority.scopeId,realManager,3);
 const authority=await transaction(db,realOwner.orgId,client=>control.currentAuthority(client,realOwner,p.authority.scopeId,realManager,3));if(!authority)throw Error("Fixture real-domain authority absent");
 const proposal:QuotePlanProposalV2={...p,requester:realOwner.subject,approver:realManager,authority};
 const context:QuotePlanContextV2={...c,authority,pricing:{...c.pricing,requester:realOwner.subject,approvalGrants:[{...c.pricing.approvalGrants[0],member:realManager}]}};
 const store=new QuotePlanStore(db,async()=>context,(client,a,r)=>control.currentAuthority(client,a,r.scopeId,r.member,r.policyVersion));
 const saved=await store.save(realOwner,proposal);expect(saved.createdBy).toBe(realOwner.subject);expect(saved.plan.approver).toBe(realManager);
 expect(saved.plan.message.request.body).toMatchObject({from:"sales@example.test",to:["buyer@example.test"]});expect(await store.save(realOwner,proposal)).toEqual(saved);
 await expect(store.save(realOwner,{...proposal,approver:realOwner.subject})).rejects.toThrow();
 await expect(store.save(realOwner,{...proposal,approver:"foreign@company.example"})).rejects.toThrow();
 await db.query("UPDATE ll_members SET active=false WHERE email=$1",[realManager]);await expect(store.save(realOwner,proposal)).rejects.toThrow("changed");
}));

it("saved-plan authority separates actual manager session from persisted requester without granting approval",async()=>v2Fixture(async(db,store,p,c,control,legacyId)=>{
 await store.save(owner,p);
 expect(await control.currentSavedPlanAuthority(owner,p.planId)).toEqual(c.authority);
 expect(await control.currentSavedPlanAuthority(manager,p.planId)).toEqual(c.authority);
 // Retained proposal API still treats the actor as requester and refuses self designation.
 expect(await transaction(db,manager.orgId,client=>control.currentAuthority(client,manager,p.authority.scopeId,manager.subject,3))).toBeNull();
 await expect(control.currentSavedPlanAuthority(owner,legacyId)).rejects.toThrow("Historical");
 expect((await db.query("SELECT count(*)::int n FROM ll_actions")).rows[0].n).toBe(0);
 expect((await db.query("SELECT count(*)::int n FROM ll_quote_manager_grants")).rows[0].n).toBe(1);
}));
it("saved-plan authority refuses unrelated member, fabricated requester actor, foreign scope and non-member workers",async()=>v2Fixture(async(db,store,p,_c,control)=>{
 await store.save(owner,p);
 await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('unrelated@example.test',$1,'Other operator','fixture')",[owner.orgId]);
 await db.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES('unrelated-session','unrelated@example.test',now()+interval '1 hour')");
 const unrelated={...owner,subject:"unrelated@example.test",tokenHash:"unrelated-session"};
 await expect(control.currentSavedPlanAuthority(unrelated,p.planId)).rejects.toThrow("not found");
 for(const actor of [foreign,{...owner,tokenHash:manager.tokenHash},{...manager,subject:owner.subject},{...manager,role:"worker" as const},{...owner,role:"agent" as const},{...owner,tokenHash:"invalid-session"}])await expect(control.currentSavedPlanAuthority(actor,p.planId)).rejects.toThrow();
 await expect(control.currentSavedPlanAuthority(owner,randomUUID())).rejects.toThrow("not found");
 await expect(control.currentSavedPlanAuthority(owner,"malformed")).rejects.toThrow("Valid scope ID");
 const altered=new QuoteAuthorityControl(db,{...control.destination,emailBinding:"c".repeat(64)});
 await expect(altered.currentSavedPlanAuthority(manager,p.planId)).rejects.toThrow("not found");
}));
it("saved-plan authority requires current owner and designated manager membership, not session substitution",async()=>v2Fixture(async(db,store,p,_c,control)=>{
 const original = await store.save(owner,p);
 await db.query("UPDATE ll_members SET active=false WHERE email=$1",[owner.subject]);
 expect(await control.currentSavedPlanAuthority(manager,p.planId)).toBeNull();
 await db.query("UPDATE ll_members SET active=true WHERE email=$1",[owner.subject]);
 expect(await control.currentSavedPlanAuthority(manager,p.planId)).toBeNull();
 await expect(store.save(owner,p)).rejects.toThrow("membership authority changed");
 expect(await store.read(owner,p.planId)).toEqual(original);
 await db.query("UPDATE ll_members SET org_id='company-b' WHERE email=$1",[owner.subject]);
 expect(await control.currentSavedPlanAuthority(manager,p.planId)).toBeNull();
 await db.query("UPDATE ll_members SET org_id=$1 WHERE email=$2",[owner.orgId,owner.subject]);
 await db.query("UPDATE ll_members SET active=false WHERE email=$1",[manager.subject]);
 await expect(control.currentSavedPlanAuthority(manager,p.planId)).rejects.toThrow();
 expect(await control.currentSavedPlanAuthority(owner,p.planId)).toBeNull();
 await db.query("UPDATE ll_members SET active=true WHERE email=$1",[manager.subject]);
 expect(await control.currentSavedPlanAuthority(manager,p.planId)).toBeNull();
}));
it("saved manager grant and scope versions cannot revive after explicit reactivation",async()=>v2Fixture(async(_db,store,p,_c,control)=>{
 await store.save(owner,p);
 await control.setManagerActive(owner,p.authority.scopeId,manager.subject,3,false,1);
 expect(await control.currentSavedPlanAuthority(manager,p.planId)).toBeNull();
 await control.setManagerActive(owner,p.authority.scopeId,manager.subject,3,true,2);
 expect(await control.currentSavedPlanAuthority(manager,p.planId)).toBeNull();
 // A fresh bound proposal is necessary; the read helper never silently updates saved work.
}));
it("saved-plan authority refuses changed scope and recovery epoch, including valid fresh deployment epoch",async()=>v2Fixture(async(db,store,p,_c,control)=>{
 await store.save(owner,p);
 await control.setScopeActive(owner,p.authority.scopeId,false,1);
 expect(await control.currentSavedPlanAuthority(manager,p.planId)).toBeNull();
 await control.setScopeActive(owner,p.authority.scopeId,true,2);
 expect(await control.currentSavedPlanAuthority(manager,p.planId)).toBeNull();
 const epoch=randomUUID();await db.query("UPDATE ll_workspace_recovery SET epoch=$1",[epoch]);vi.stubEnv("LOOPLABS_RECOVERY_EPOCH",epoch);
 expect(await control.currentSavedPlanAuthority(manager,p.planId)).toBeNull();
}));
it("saved-plan authority refuses stored hash/identity corruption and preserves immutable database boundary",async()=>v2Fixture(async(db,store,p,_c,control)=>{
 await store.save(owner,p);
 await expect(db.query("UPDATE ll_quote_plans SET created_by=$1 WHERE id=$2",[manager.subject,p.planId])).rejects.toThrow("cannot be rewritten");
 // Test-only privileged tamper: demonstrates read containment beyond the immutability trigger.
 await db.query("ALTER TABLE ll_quote_plans DISABLE TRIGGER ll_quote_plan_immutable");
 try{
  await db.query("UPDATE ll_quote_plans SET plan_hash=$1 WHERE id=$2",["0".repeat(64),p.planId]);
  await expect(control.currentSavedPlanAuthority(manager,p.planId)).rejects.toThrow("integrity");
 }finally{await db.query("ALTER TABLE ll_quote_plans ENABLE TRIGGER ll_quote_plan_immutable");}
}));
it("saved-plan authority refuses member-row contention promptly then reads current state after rollback",async()=>v2Fixture(async(db,store,p,_c,control)=>{
 await store.save(owner,p);const writer=await db.connect();
 try{
  await writer.query("BEGIN");await writer.query("SET LOCAL statement_timeout='3s'");
  await writer.query("UPDATE ll_members SET name='Contending owner' WHERE email=$1",[owner.subject]);
  await expect(control.currentSavedPlanAuthority(manager,p.planId)).rejects.toMatchObject({code:"55P03"});
  await writer.query("ROLLBACK");expect(await control.currentSavedPlanAuthority(manager,p.planId)).toEqual(p.authority);
 }finally{await writer.query("ROLLBACK");writer.release();}
}));
it("requester generation permanently contains old saved authority while a fresh plan after reactivation works",async()=>v2Fixture(async(db,store,p,_context,control)=>{
 const original=await store.save(owner,p);
 const before=(await db.query("SELECT generation FROM ll_quote_member_generations WHERE email=$1",[owner.subject])).rows[0].generation;
 await db.query("UPDATE ll_members SET active=false WHERE email=$1",[owner.subject]);
 await db.query("UPDATE ll_members SET active=false WHERE email=$1",[owner.subject]);
 await db.query("UPDATE ll_members SET active=true WHERE email=$1",[owner.subject]);
 expect(BigInt((await db.query("SELECT generation FROM ll_quote_member_generations WHERE email=$1",[owner.subject])).rows[0].generation)).toBe(BigInt(before)+1n);
 expect(await control.currentSavedPlanAuthority(manager,p.planId)).toBeNull();
 await expect(store.save(owner,p)).rejects.toThrow("membership authority changed");
 expect(await store.read(owner,p.planId)).toEqual(original);
 const fresh=structuredClone(p);fresh.planId=randomUUID();fresh.update.actionId=randomUUID();fresh.message.actionId=randomUUID();fresh.message.dependsOn=fresh.update.actionId;
 await store.save(owner,fresh);
 expect(await control.currentSavedPlanAuthority(manager,fresh.planId)).toEqual(fresh.authority);
 expect(await control.currentSavedPlanAuthority(manager,p.planId)).toBeNull();
}));
it("workspace move and restore increments requester history twice and cannot restore saved authority",async()=>v2Fixture(async(db,store,p,_context,control)=>{
 await store.save(owner,p);
 await db.query("UPDATE ll_members SET org_id='company-b' WHERE email=$1",[owner.subject]);
 await db.query("UPDATE ll_members SET org_id=$1 WHERE email=$2",[owner.orgId,owner.subject]);
 expect((await db.query("SELECT generation FROM ll_quote_member_generations WHERE email=$1",[owner.subject])).rows[0].generation).toBe("3");
 expect(await control.currentSavedPlanAuthority(manager,p.planId)).toBeNull();
 await expect(store.save(owner,p)).rejects.toThrow("membership authority changed");
}));
it("manager lifecycle requires fresh versioned grant and new plan; old saved authority never revives",async()=>v2Fixture(async(db,store,p,context,control)=>{
 await store.save(owner,p);
 await db.query("UPDATE ll_members SET active=false WHERE email=$1",[manager.subject]);
 await db.query("UPDATE ll_members SET active=true WHERE email=$1",[manager.subject]);
 await control.setManagerActive(owner,p.authority.scopeId,manager.subject,3,true,2);
 expect(await control.currentSavedPlanAuthority(owner,p.planId)).toBeNull();
 const snapshot=await transaction(db,owner.orgId,c=>control.currentAuthority(c,owner,p.authority.scopeId,manager.subject,3));expect(snapshot).not.toBeNull();
 const fresh=structuredClone(p);fresh.planId=randomUUID();fresh.update.actionId=randomUUID();fresh.message.actionId=randomUUID();fresh.message.dependsOn=fresh.update.actionId;fresh.authority=snapshot!;context.authority=structuredClone(snapshot!);
 await store.save(owner,fresh);expect(await control.currentSavedPlanAuthority(manager,fresh.planId)).toEqual(snapshot);
 expect(await control.currentSavedPlanAuthority(manager,p.planId)).toBeNull();
}));
it("historical pre22 bound plans remain exact readable snapshots but never silently acquire membership authority",async()=>v2Fixture(async(db,store,p,_context,control)=>{
 const original=await store.save(owner,p);await db.query(await readFile("lib/quotes/membership-schema.sql","utf8"));
 expect(await store.read(owner,p.planId)).toEqual(original);
 expect(await control.currentSavedPlanAuthority(manager,p.planId)).toBeNull();
 await expect(store.save(owner,p)).rejects.toThrow("membership authority changed");
 const fresh=structuredClone(p);fresh.planId=randomUUID();fresh.update.actionId=randomUUID();fresh.message.actionId=randomUUID();fresh.message.dependsOn=fresh.update.actionId;
 await store.save(owner,fresh);expect(await control.currentSavedPlanAuthority(manager,fresh.planId)).toEqual(p.authority);
},false));
it("membership history refuses direct reset/delete/rename and saved generation spoofing at actual SQL boundary",async()=>v2Fixture(async(db,store,p)=>{
 await store.save(owner,p);
 for(const sql of ["UPDATE ll_quote_member_generations SET generation=1", "DELETE FROM ll_quote_member_generations", "TRUNCATE ll_quote_member_generations"])
  await expect(db.query(sql)).rejects.toThrow();
 await expect(db.query("UPDATE ll_members SET email='renamed@example.test' WHERE email=$1",[owner.subject])).rejects.toThrow("cannot be renamed");
 await expect(db.query("DELETE FROM ll_members WHERE email=$1",[owner.subject])).rejects.toThrow();
 await expect(db.query("INSERT INTO ll_quote_member_generations(email,org_id,generation) VALUES('invented@example.test',$1,1)",[owner.orgId])).rejects.toThrow("cannot be directly rewritten");
 await expect(db.query("UPDATE ll_quote_plans SET requester_membership_generation=9 WHERE id=$1",[p.planId])).rejects.toThrow();
 await expect(db.query("INSERT INTO ll_quote_plans(org_id,id,created_by,created_at,recovery_epoch,proposal,proposal_hash,plan,plan_hash,quote_action_id,message_action_id,requester_membership_generation,manager_membership_generation) SELECT org_id,id,created_by,created_at,recovery_epoch,proposal,proposal_hash,plan,plan_hash,quote_action_id,message_action_id,1,1 FROM ll_quote_plans WHERE id=$1",[p.planId])).rejects.toThrow("server-owned");
 expect((await db.query("SELECT requester_membership_generation,manager_membership_generation FROM ll_quote_plans WHERE id=$1",[p.planId])).rows[0]).toEqual({requester_membership_generation:"1",manager_membership_generation:"1"});
}));
it("new member lifecycle cannot delete or reinsert identity to reset its quote generation",async()=>v2Fixture(async(db)=>{
 const person='new-manager@company.example';await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES($1,$2,'New manager','fixture-password-hash')",[person,owner.orgId]);
 expect((await db.query("SELECT generation FROM ll_quote_member_generations WHERE email=$1",[person])).rows[0].generation).toBe("1");
 await db.query("UPDATE ll_members SET active=false WHERE email=$1",[person]);
 await expect(db.query("DELETE FROM ll_members WHERE email=$1",[person])).rejects.toThrow();
 await expect(db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES($1,$2,'Duplicate','fixture-password-hash')",[person,owner.orgId])).rejects.toThrow();
 await db.query("UPDATE ll_members SET active=true WHERE email=$1",[person]);
 expect((await db.query("SELECT generation FROM ll_quote_member_generations WHERE email=$1",[person])).rows[0].generation).toBe("2");
}));
it("refused direct revocation under a workspace reader is rolled back and does not advance generation",async()=>v2Fixture(async(db,store,p,_context,control)=>{
 await store.save(owner,p);const reader=await db.connect(),writer=await db.connect();
 try{
  await reader.query("BEGIN");await reader.query("SELECT id FROM ll_orgs WHERE id=$1 FOR UPDATE",[owner.orgId]);
  await writer.query("BEGIN");
  await expect(writer.query("UPDATE ll_members SET active=false WHERE email=$1",[owner.subject])).rejects.toMatchObject({code:"55P03"});
  await writer.query("ROLLBACK");await reader.query("ROLLBACK");
  expect((await db.query("SELECT active FROM ll_members WHERE email=$1",[owner.subject])).rows[0].active).toBe(true);
  expect((await db.query("SELECT generation FROM ll_quote_member_generations WHERE email=$1",[owner.subject])).rows[0].generation).toBe("1");
  expect(await control.currentSavedPlanAuthority(manager,p.planId)).toEqual(p.authority);
  await db.query("UPDATE ll_members SET active=false WHERE email=$1",[owner.subject]);await db.query("UPDATE ll_members SET active=true WHERE email=$1",[owner.subject]);
  expect(await control.currentSavedPlanAuthority(manager,p.planId)).toBeNull();
 }finally{await reader.query("ROLLBACK");await writer.query("ROLLBACK");reader.release();writer.release();}
}));
it("plan INSERT refuses current member-row contention and succeeds only after rollback with actual generation binding",async()=>v2Fixture(async(db,store,p,_context,control)=>{
 const writer=await db.connect();
 try{
  await writer.query("BEGIN");await writer.query("UPDATE ll_members SET name='Held owner row' WHERE email=$1",[owner.subject]);
  await expect(store.save(owner,p)).rejects.toMatchObject({code:"55P03"});
  expect((await db.query("SELECT count(*)::int n FROM ll_quote_plans WHERE id=$1",[p.planId])).rows[0].n).toBe(0);
  await writer.query("ROLLBACK");await store.save(owner,p);
  expect(await control.currentSavedPlanAuthority(manager,p.planId)).toEqual(p.authority);
 }finally{await writer.query("ROLLBACK");writer.release();}
}));
it("restricted runtime can read membership history but cannot forge generation or install a nested trigger bypass",async()=>v2Fixture(async(db,store,p,_context,_control,_legacyId,schema)=>{
 await store.save(owner,p);const role=`quote_history_${randomBytes(8).toString("hex")}`;let runtime:Pool|undefined;
 await db.query(`CREATE ROLE ${role} NOLOGIN`);
 try{
  await db.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
  await db.query(`GRANT SELECT ON ll_quote_member_generations,ll_quote_plans,ll_members TO ${role}`);
  runtime=new Pool({connectionString:process.env.LOOPLABS_TEST_DATABASE_URL,options:`-c search_path=${schema} -c role=${role}`});
  expect((await runtime.query("SELECT generation FROM ll_quote_member_generations WHERE email=$1",[owner.subject])).rows[0].generation).toBe("1");
  for(const sql of ["UPDATE ll_quote_member_generations SET generation=1", "DELETE FROM ll_quote_member_generations", "TRUNCATE ll_quote_member_generations", "INSERT INTO ll_quote_member_generations(email,org_id,generation) VALUES('forged@example.test','company-a',1)", "UPDATE ll_quote_plans SET requester_membership_generation=5", "CREATE TABLE quote_history_bypass(n int)"])
   await expect(runtime.query(sql)).rejects.toMatchObject({code:"42501"});
  await expect(runtime.query("SELECT ll_quote_member_lifecycle_generation()" )).rejects.toThrow("trigger functions can only be called as triggers");
  const functions=(await db.query("SELECT bool_or(prosecdef) AS definer FROM pg_proc WHERE pronamespace=$1::regnamespace AND proname IN('ll_quote_member_generation_boundary','ll_quote_member_lifecycle_generation','ll_quote_member_lifecycle_lock','ll_quote_plan_membership_insert')",[schema])).rows[0];
  expect(functions.definer).toBe(false);
  expect((await db.query("SELECT generation FROM ll_quote_member_generations WHERE email=$1",[owner.subject])).rows[0].generation).toBe("1");
 }finally{await runtime?.end();await db.query(`DROP OWNED BY ${role}`);await db.query(`DROP ROLE ${role}`);}
}));
