import type { Pool, PoolClient } from "pg";
import { ControlError, type Actor } from "../durable/contracts";
import { transaction } from "../durable/database";
import { authorize } from "../durable/service";
import { memberAuthority } from "../workspace/identity";
import { quotePlanDigest } from "./digest";
export { quotePlanDigest } from "./digest";
import { validateQuotePlan, type QuotePlan } from "./plan";
import { validateQuotePlanV2, assertBoundQuotePlanContract, type QuotePlanV2 } from "./plan-v2";
import { sameQuoteAuthority, type QuoteAuthoritySnapshot } from "./authority";

export type QuoteContextLoader = (
  client: PoolClient, actor: Actor,
  reference: Readonly<{ quoteId: string; distributorId: string }>,
) => Promise<unknown>;
export type QuoteAuthorityResolver = (client: PoolClient, actor: Actor,
  reference: Readonly<{scopeId:string; member:string; policyVersion:number}>) => Promise<QuoteAuthoritySnapshot | null>;
export interface SavedQuotePlan {
  id: string; createdBy: string; createdAt: string; planHash: string;
  proposalHash: string; plan: QuotePlan | QuotePlanV2;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const scope = /^[A-Za-z0-9_-]{1,64}$/;

function reference(input: unknown, actor: Actor) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ControlError(400, "A quote proposal is required.");
  const descriptors = Object.getOwnPropertyDescriptors(input);
  for (const key of ["planId", "workspaceId", "requester", "quote"]) {
    if (!descriptors[key] || !Object.hasOwn(descriptors[key], "value")) throw new ControlError(400, "Exact quote references are required.");
  }
  const p = input as Record<string, unknown>;
  if (typeof p.planId !== "string" || !uuid.test(p.planId) || p.workspaceId !== actor.orgId || p.requester !== actor.subject ||
      !p.quote || typeof p.quote !== "object" || Array.isArray(p.quote)) throw new ControlError(403, "Quote proposal does not belong to this member and workspace.");
  const q = Object.getOwnPropertyDescriptors(p.quote);
  if (!["id", "distributorId"].every(k => Object.hasOwn(q[k] ?? {}, "value") && typeof q[k].value === "string" && scope.test(q[k].value)))
    throw new ControlError(400, "Exact quote references are required.");
  return Object.freeze({ quoteId: q.id.value as string, distributorId: q.distributorId.value as string });
}
async function authority(client: PoolClient, actor: Actor): Promise<string> {
  await authorize(client, actor, ["operator"]);
  if (!(await memberAuthority(client, actor))) throw new ControlError(403, "A current named member session is required for saved quote proposals.");
  const epoch = process.env.LOOPLABS_RECOVERY_EPOCH;
  if (!epoch || !uuid.test(epoch)) throw new ControlError(503, "Saved quote proposals require enrolled workspace recovery.");
  // authorize/memberAuthority already checked the existing external recovery fence.
  return epoch.toLowerCase();
}
function saved(row: Record<string, unknown>, actor: Actor, epoch: string): SavedQuotePlan {
  const proposal = row.proposal as Record<string, unknown>;
  const plan = row.plan as QuotePlan | QuotePlanV2;
  if (row.org_id !== actor.orgId || row.created_by !== actor.subject || row.recovery_epoch !== epoch)
    throw new ControlError(409, "Saved quote proposal is contained or belongs to another member.");
  if (!proposal || !plan || quotePlanDigest(proposal) !== row.proposal_hash || quotePlanDigest(plan) !== row.plan_hash ||
      !["distributor-quote-plan-1","distributor-quote-plan-2"].includes(plan.version) || plan.workspaceId !== actor.orgId || plan.requester !== actor.subject ||
      plan.planId.toLowerCase() !== row.id || proposal.planId !== plan.planId ||
      proposal.workspaceId !== actor.orgId || proposal.requester !== actor.subject ||
      plan.update.actionId.toLowerCase() !== row.quote_action_id || plan.message.actionId.toLowerCase() !== row.message_action_id)
    throw new ControlError(409, "Saved quote proposal integrity could not be verified.");
  if (plan.version === "distributor-quote-plan-2") assertBoundQuotePlanContract(plan);
  return { id: row.id as string, createdBy: row.created_by as string,
    createdAt: (row.created_at as Date).toISOString(), planHash: row.plan_hash as string,
    proposalHash: row.proposal_hash as string, plan: structuredClone(plan) };
}

/** Durable proposals only: deliberately no approve, dispatch, provider or orchestration method. */
export class QuotePlanStore {
  constructor(readonly db: Pool, private readonly loadContext: QuoteContextLoader, private readonly resolveAuthority?: QuoteAuthorityResolver) {}
  private async current(client: PoolClient, actor: Actor, plan: ReturnType<typeof validateQuotePlan> | QuotePlanV2, epoch: string) {
    if (plan.version !== "distributor-quote-plan-2") return;
    if (!this.resolveAuthority) throw new ControlError(409,"A server-owned current quote authority resolver is required for bound plans.");
    const current = await this.resolveAuthority(client, actor, Object.freeze({scopeId:plan.authority.scopeId,member:plan.approver,policyVersion:plan.policyVersion}));
    if (plan.authority.recoveryEpoch !== epoch || !sameQuoteAuthority(plan.authority,current))
      throw new ControlError(409,"Quote scope, manager grant or recovery authority changed. Prepare fresh bound work.");
  }

  async save(actor: Actor, input: unknown): Promise<SavedQuotePlan> {
    // Snapshot before awaiting enrollment so in-process mutation cannot change the target.
    const target = reference(input, actor);
    quotePlanDigest(input);
    const proposal = structuredClone(input);
    return transaction(this.db, actor.orgId, async client => {
      const epoch = await authority(client, actor);
      const context = await this.loadContext(client, actor, target);
      const plan = (proposal as {version?:unknown}).version === "distributor-quote-plan-2"
        ? validateQuotePlanV2(proposal,context) : validateQuotePlan(proposal, context);
      await this.current(client,actor,plan,epoch);
      if (plan.workspaceId !== actor.orgId || plan.requester !== actor.subject)
        throw new ControlError(403, "Quote proposal does not belong to this member and workspace.");
      // The loader supplies current explicit capability grants; invited membership alone
      // never creates that authority. Recheck membership after its awaited snapshot read.
      // Capability-grant reads/writes must share the workspace lock/version discipline;
      // actual approval and dispatch must independently revalidate current authority.
      if (plan.approver === actor.subject || !(await client.query(
        "SELECT 1 FROM ll_members WHERE email=$1 AND org_id=$2 AND active=true",
        [plan.approver, actor.orgId],
      )).rows.length) throw new ControlError(409, "A current independent workspace reviewer is required before saving this quote proposal.");
      // The loader is server-owned but may await other enrollment queries; recheck delayed identity.
      if (await authority(client, actor) !== epoch) throw new ControlError(409, "Workspace recovery changed while preparing the quote.");
      const proposalHash = quotePlanDigest(proposal), planHash = quotePlanDigest(plan);
      const old = (await client.query("SELECT * FROM ll_quote_plans WHERE org_id=$1 AND id=$2", [actor.orgId, plan.planId])).rows[0];
      if (old) {
        await this.current(client,actor,plan,epoch);
        if (await authority(client,actor) !== epoch) throw new ControlError(409,"Workspace recovery changed while preparing the quote.");
        if (old.created_by !== actor.subject || old.proposal_hash !== proposalHash || old.plan_hash !== planHash)
          throw new ControlError(409, "This quote proposal ID already belongs to different saved work.");
        return saved(old, actor, epoch);
      }
      const collisions = await client.query("SELECT 1 FROM ll_quote_plans WHERE org_id=$1 AND (id=ANY($2::uuid[]) OR quote_action_id=ANY($2::uuid[]) OR message_action_id=ANY($2::uuid[]))",
        [actor.orgId, [plan.planId, plan.update.actionId, plan.message.actionId]]);
      if (collisions.rows.length) throw new ControlError(409, "Quote proposal action IDs already belong to saved work.");
      await this.current(client,actor,plan,epoch);
      if (await authority(client,actor) !== epoch) throw new ControlError(409,"Workspace recovery changed while preparing the quote.");
      const row = (await client.query("INSERT INTO ll_quote_plans(org_id,id,created_by,recovery_epoch,proposal,proposal_hash,plan,plan_hash,quote_action_id,message_action_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
        [actor.orgId, plan.planId, actor.subject, epoch, JSON.stringify(proposal), proposalHash, JSON.stringify(plan), planHash, plan.update.actionId, plan.message.actionId])).rows[0];
      return saved(row, actor, epoch);
    });
  }

  async read(actor: Actor, id: string): Promise<SavedQuotePlan> {
    if (typeof id !== "string" || !uuid.test(id)) throw new ControlError(400, "A saved quote proposal ID is required.");
    return transaction(this.db, actor.orgId, async client => {
      const epoch = await authority(client, actor);
      const row = (await client.query("SELECT * FROM ll_quote_plans WHERE org_id=$1 AND id=$2 AND created_by=$3", [actor.orgId, id, actor.subject])).rows[0];
      if (!row) throw new ControlError(404, "Saved quote proposal not found.");
      return saved(row, actor, epoch);
    });
  }

  async list(actor: Actor): Promise<SavedQuotePlan[]> {
    return transaction(this.db, actor.orgId, async client => {
      const epoch = await authority(client, actor);
      const rows = (await client.query("SELECT * FROM ll_quote_plans WHERE org_id=$1 AND created_by=$2 ORDER BY created_at DESC,id LIMIT 30", [actor.orgId, actor.subject])).rows;
      return rows.map(row => saved(row, actor, epoch));
    });
  }
}
