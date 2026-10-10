import type { Pool, PoolClient } from "pg";
import { isDeepStrictEqual } from "node:util";
import { transaction } from "../durable/database";
import { authorize } from "../durable/service";
import { ControlError, type Actor } from "../durable/contracts";
import { memberAuthority } from "../workspace/identity";
import { quotePlanDigest } from "./digest";
import { assertBoundQuotePlanContract, type QuotePlanV2 } from "./plan-v2";

/** Server-owned twin destination metadata, not a live capability or execution proof. */
export interface QuoteDestination {
  contract: "private-quote-twin-1"; workspaceId: string; quoteId: string;
  distributorId: string; recipient: string; sender: string;
  quoteBinding: string; emailBinding: string;
}
export interface QuoteAuthoritySnapshot {
  contract: "quote-authority-1"; scopeId: string; scopeVersion: number;
  workspaceId: string; quoteId: string; distributorId: string;
  recipient: string; sender: string; quoteBinding: string; emailBinding: string;
  member: string; policyVersion: number; grantVersion: number;
  capability: "quote.discount.approve"; recoveryEpoch: string;
}
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const email = (v: unknown): v is string => typeof v === "string" && v.length <= 254 && /^[a-z0-9][a-z0-9._+-]*@[a-z0-9]+([.-][a-z0-9]+)*\.test$/.test(v);
// Named workspace members use the retained quote-plan canonical email syntax;
// test-only destination restrictions apply to sender/recipient, not human identity.
const memberEmail = (v: unknown): v is string => typeof v === "string" && v.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const version = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0 && (v as number) <= 2_147_483_647;
function scopeId(v: unknown): string {
  if (typeof v !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) throw new ControlError(400, "Valid scope ID required.");
  return v.toLowerCase();
}
function destination(value: QuoteDestination): Readonly<QuoteDestination> {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).sort().join() !== "contract,distributorId,emailBinding,quoteBinding,quoteId,recipient,sender,workspaceId" ||
      Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !('value' in d)) ||
      value.contract !== "private-quote-twin-1" || !id(value.workspaceId) || !id(value.quoteId) || !id(value.distributorId) ||
      !email(value.recipient) || !email(value.sender) || !hash(value.quoteBinding) || !hash(value.emailBinding) || value.quoteBinding === value.emailBinding)
    throw new ControlError(409, "Exact server-owned quote and email twin destinations required.");
  return Object.freeze(structuredClone(value));
}
async function authority(c: PoolClient, actor: Actor, d: QuoteDestination): Promise<string> {
  if (actor.orgId !== d.workspaceId) throw new ControlError(403, "Quote authority belongs to another workspace.");
  await authorize(c, actor, ["operator"]);
  if (!(await memberAuthority(c, actor))) throw new ControlError(403, "Current named member required for quote authority.");
  const epoch = process.env.LOOPLABS_RECOVERY_EPOCH;
  if (!epoch || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(epoch))
    throw new ControlError(503, "Quote authority requires enrolled workspace recovery.");
  return epoch.toLowerCase();
}
/** Enrollment and capability grants only. No plan approval, dispatch or provider call. */
export class QuoteAuthorityControl {
  readonly destination: Readonly<QuoteDestination>;
  constructor(readonly db: Pool, configuredDestination: QuoteDestination) { this.destination = destination(configuredDestination); }
  private async event(c: PoolClient, actor: Actor, scope: string, kind: string) {
    await c.query("INSERT INTO ll_connector_scope_events(org_id,scope_id,kind,subject) VALUES($1,$2,$3,$4)", [actor.orgId, scope, kind, actor.subject]);
  }
  private async scope(c: PoolClient, actor: Actor, scope: string) {
    const d = this.destination;
    const row = (await c.query("SELECT * FROM ll_connector_scopes WHERE org_id=$1 AND id=$2 AND contract_version='private-quote-twin-1' AND binding_id=$3 AND email_binding_id=$4 AND quote_id=$5 AND distributor_id=$6 AND recipient=$7 AND sender=$8", [actor.orgId, scope, d.quoteBinding, d.emailBinding, d.quoteId, d.distributorId, d.recipient, d.sender])).rows[0];
    if (!row) throw new ControlError(404, "Enrolled quote scope not found.");
    return row;
  }
  async enroll(actor: Actor, value: string) {
    const scope = scopeId(value), d = this.destination;
    return transaction(this.db, actor.orgId, async c => {
      await authority(c, actor, d);
      const old = (await c.query("SELECT * FROM ll_connector_scopes WHERE org_id=$1 AND (id=$2 OR binding_id=$3)", [actor.orgId, scope, d.quoteBinding])).rows;
      if (old.length) {
        if (old.length !== 1 || old[0].id !== scope) throw new ControlError(409, "Destination or ID already belongs to another scope.");
        return this.scope(c, actor, scope);
      }
      const row = (await c.query("INSERT INTO ll_connector_scopes(org_id,id,contact_id,recipient,binding_id,contract_version,quote_id,distributor_id,email_binding_id,sender,created_by) VALUES($1,$2,NULL,$3,$4,'private-quote-twin-1',$5,$6,$7,$8,$9) RETURNING *", [actor.orgId, scope, d.recipient, d.quoteBinding, d.quoteId, d.distributorId, d.emailBinding, d.sender, actor.subject])).rows[0];
      await this.event(c, actor, scope, "quote_enrolled"); return row;
    });
  }
  async read(actor: Actor, value: string) {
    const scope = scopeId(value);
    return transaction(this.db, actor.orgId, async c => { await authority(c, actor, this.destination); return this.scope(c, actor, scope); });
  }
  async list(actor: Actor) {
    return transaction(this.db, actor.orgId, async c => {
      await authority(c, actor, this.destination);
      const rows = (await c.query("SELECT id FROM ll_connector_scopes WHERE org_id=$1 AND contract_version='private-quote-twin-1' AND binding_id=$2 ORDER BY created_at DESC LIMIT 30", [actor.orgId, this.destination.quoteBinding])).rows;
      return Promise.all(rows.map(row => this.scope(c, actor, row.id)));
    });
  }
  async setScopeActive(actor: Actor, value: string, active: boolean, expectedVersion: number) {
    const scope = scopeId(value);
    if (typeof active !== "boolean" || !version(expectedVersion)) throw new ControlError(400, "Current authority version and active state required.");
    return transaction(this.db, actor.orgId, async c => {
      await authority(c, actor, this.destination); const old = await this.scope(c, actor, scope);
      if (old.version !== expectedVersion) throw new ControlError(409, "Quote authority changed.");
      if (old.active === active) return old;
      const row = (await c.query("UPDATE ll_connector_scopes SET active=$3,version=version+1 WHERE org_id=$1 AND id=$2 RETURNING *", [actor.orgId, scope, active])).rows[0];
      await this.event(c, actor, scope, active ? "quote_reactivated" : "quote_revoked"); return row;
    });
  }
  async grantManager(actor: Actor, value: string, member: string, policyVersion: number) {
    const scope = scopeId(value);
    if (!memberEmail(member) || !version(policyVersion) || actor.subject === member) throw new ControlError(403, "Independent named manager and policy version required.");
    return transaction(this.db, actor.orgId, async c => {
      await authority(c, actor, this.destination); const enrolled = await this.scope(c, actor, scope);
      if (!enrolled.active || !(await c.query("SELECT 1 FROM ll_members WHERE org_id=$1 AND email=$2 AND active=true", [actor.orgId, member])).rowCount) throw new ControlError(403, "Active quote scope and same-workspace manager required.");
      const old = (await c.query("SELECT * FROM ll_quote_manager_grants WHERE org_id=$1 AND scope_id=$2 AND member=$3 AND policy_version=$4", [actor.orgId, scope, member, policyVersion])).rows[0];
      if (old) return old;
      const row = (await c.query("INSERT INTO ll_quote_manager_grants(org_id,scope_id,member,policy_version,capability,created_by) VALUES($1,$2,$3,$4,'quote.discount.approve',$5) RETURNING *", [actor.orgId, scope, member, policyVersion, actor.subject])).rows[0];
      await this.event(c, actor, scope, "quote_manager_granted"); return row;
    });
  }
  async setManagerActive(actor: Actor, value: string, member: string, policyVersion: number, active: boolean, expectedVersion: number) {
    const scope = scopeId(value);
    if (!memberEmail(member) || !version(policyVersion) || typeof active !== "boolean" || !version(expectedVersion) || member === actor.subject) throw new ControlError(400, "Independent manager and current grant version required.");
    return transaction(this.db, actor.orgId, async c => {
      await authority(c, actor, this.destination); const enrolled = await this.scope(c, actor, scope);
      const old = (await c.query("SELECT * FROM ll_quote_manager_grants WHERE org_id=$1 AND scope_id=$2 AND member=$3 AND policy_version=$4", [actor.orgId, scope, member, policyVersion])).rows[0];
      if (!old) throw new ControlError(404, "Manager grant not found.");
      if (old.version !== expectedVersion) throw new ControlError(409, "Manager authority changed.");
      if (active && (!enrolled.active || !(await c.query("SELECT 1 FROM ll_members WHERE org_id=$1 AND email=$2 AND active=true", [actor.orgId, member])).rowCount)) throw new ControlError(403, "Active quote scope and same-workspace manager required.");
      if (old.active === active) return old;
      const row = (await c.query("UPDATE ll_quote_manager_grants SET active=$5,version=version+1 WHERE org_id=$1 AND scope_id=$2 AND member=$3 AND policy_version=$4 RETURNING *", [actor.orgId, scope, member, policyVersion, active])).rows[0];
      await this.event(c, actor, scope, active ? "quote_manager_reactivated" : "quote_manager_revoked"); return row;
    });
  }
  /** Call inside the caller's workspace transaction; snapshots are not execution authority.
   * Future submission must reject plan-v1: it lacks email binding and grant version.
   * Current pricing policy and independent requester must also be revalidated there. */
  async currentAuthority(c: PoolClient, actor: Actor, value: string, member: string, policyVersion: number): Promise<QuoteAuthoritySnapshot | null> {
    const scope = scopeId(value); const recoveryEpoch = await authority(c, actor, this.destination);
    if (!memberEmail(member) || !version(policyVersion) || member === actor.subject) return null;
    return this.managerSnapshot(c, actor, scope, member, policyVersion, recoveryEpoch);
  }
  private async managerSnapshot(c: PoolClient, actor: Actor, scope: string, member: string, policyVersion: number, recoveryEpoch: string): Promise<QuoteAuthoritySnapshot | null> {
    const enrolled = await this.scope(c, actor, scope);
    const grant = (await c.query("SELECT g.version FROM ll_quote_manager_grants g JOIN ll_members m ON m.email=g.member AND m.org_id=g.org_id AND m.active=true WHERE g.org_id=$1 AND g.scope_id=$2 AND g.member=$3 AND g.policy_version=$4 AND g.active=true AND g.capability='quote.discount.approve'", [actor.orgId, scope, member, policyVersion])).rows[0];
    if (!enrolled.active || !grant) return null;
    return { contract: "quote-authority-1", scopeId: scope, scopeVersion: enrolled.version,
      workspaceId: actor.orgId, quoteId: this.destination.quoteId, distributorId: this.destination.distributorId,
      recipient: this.destination.recipient, sender: this.destination.sender, quoteBinding: this.destination.quoteBinding,
      emailBinding: this.destination.emailBinding, member, policyVersion, grantVersion: grant.version, capability: "quote.discount.approve", recoveryEpoch };
  }

  /** Read-only current bound-plan authority for its actual owner or designated manager.
   * Authenticates the acting session independently of persisted requesting identity.
   * No approval/lease/dispatch eligibility is established; workers default deny.
   * Owns its workspace transaction. Delayed use must perform a fresh check again.
   * Current source/pricing/provider conformance and requester revocation history
   * are separate integration invariants; this read cannot authorize execution. */
  async currentSavedPlanAuthority(actor: Actor, value: string): Promise<QuoteAuthoritySnapshot | null> {
    const planId = scopeId(value), acting = { ...actor };
    return transaction(this.db, acting.orgId, async c => {
      const recoveryEpoch = await authority(c, acting, this.destination);
      // First read only access attribution. Never return scope metadata to an unrelated operator.
      const attribution = (await c.query("SELECT created_by,plan->>'approver' AS manager FROM ll_quote_plans WHERE org_id=$1 AND id=$2", [acting.orgId, planId])).rows[0];
      if (!attribution || ![attribution.created_by, attribution.manager].includes(acting.subject))
        throw new ControlError(404, "Saved quote authority not found.");
      const row = (await c.query("SELECT * FROM ll_quote_plans WHERE org_id=$1 AND id=$2", [acting.orgId, planId])).rows[0];
      const plan = row.plan as QuotePlanV2, proposal = row.proposal;
      assertBoundQuotePlanContract(plan);
      if (row.created_by !== plan.requester || plan.requester === plan.approver ||
          row.org_id !== acting.orgId || plan.workspaceId !== acting.orgId ||
          plan.planId.toLowerCase() !== row.id || proposal?.planId !== plan.planId ||
          proposal?.version !== plan.version || proposal?.requester !== row.created_by || proposal?.workspaceId !== acting.orgId ||
          plan.update.actionId.toLowerCase() !== row.quote_action_id || plan.message.actionId.toLowerCase() !== row.message_action_id ||
          quotePlanDigest(plan) !== row.plan_hash || quotePlanDigest(proposal) !== row.proposal_hash)
        throw new ControlError(409, "Saved quote authority integrity could not be verified.");
      // Refuse contention instead of waiting behind a direct member update that may
      // itself be waiting for our workspace lock. A failed read grants no authority.
      const members = (await c.query("SELECT email FROM ll_members WHERE org_id=$1 AND email=ANY($2::text[]) AND active=true FOR SHARE NOWAIT", [acting.orgId, [row.created_by, plan.approver]])).rows;
      if (members.length !== 2 || row.recovery_epoch !== recoveryEpoch || plan.authority.recoveryEpoch !== recoveryEpoch) return null;
      const current = await this.managerSnapshot(c, acting, scopeId(plan.authority.scopeId), plan.approver, plan.policyVersion, recoveryEpoch);
      return sameQuoteAuthority(plan.authority, current) ? structuredClone(current) : null;
    });
  }

}
/** Comparison only; callers must obtain currentAuthority again before delayed use. */
export function sameQuoteAuthority(saved: unknown, current: QuoteAuthoritySnapshot | null) { return current !== null && isDeepStrictEqual(saved, current); }
