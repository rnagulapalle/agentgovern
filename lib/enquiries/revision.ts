import { digest } from "../workspace/identity";
import { reviewedMessageV2, type ReviewedMessageV2 } from "../connectors/content";
import type { PoolClient } from "pg";
import { ControlError, type Actor } from "../durable/contracts";
import { enquiryMembershipCurrent } from "../workspace/membership-authority";
import { validId } from "./contracts";

export type EnquiryRevision = { parentId: string; parentHash: string; lifecycle: "lead" | "customer"; message?: ReviewedMessageV2 };
export function parseRevision(value: unknown): EnquiryRevision {
  if (!value || typeof value !== "object" || Array.isArray(value) || !["lifecycle,parentHash,parentId","lifecycle,message,parentHash,parentId"].includes(Object.keys(value).sort().join())) throw new ControlError(400, "Choose one supported record-stage change.");
  const p = value as EnquiryRevision;
  validId(p.parentId);
  if (typeof p.parentHash !== "string" || !/^[a-f0-9]{64}$/.test(p.parentHash) || !["lead", "customer"].includes(p.lifecycle)) throw new ControlError(400, "Review the exact parent plan and choose a supported record stage.");
  return {parentId:p.parentId.toLowerCase(),parentHash:p.parentHash,lifecycle:p.lifecycle,...("message" in p?{message:reviewedMessageV2(p.message)}:{})};
}
// Caller must hold the workspace transaction lock and authenticate the named actor.
// This never creates action approval or dispatch authority.
export async function revisionParent(c: PoolClient, actor: Actor, id: string, revision: EnquiryRevision, intentHash?: string) {
  if (id === revision.parentId) throw new ControlError(409, "A revision needs a new immutable plan ID.");
  if (!(await revisionInstalled(c))) throw new ControlError(503, "Plan revision is not installed.");
  const parent = (await c.query("SELECT * FROM ll_enquiry_plans WHERE org_id=$1 AND id=$2", [actor.orgId, revision.parentId])).rows[0];
  if (!parent) throw new ControlError(404, "Parent plan not found.");
  if (parent.membership_owner?.kind !== "member") throw new ControlError(403, "An invited named plan owner is required for revisions.");
  if (parent.created_by !== actor.subject) throw new ControlError(403, "Only the plan owner can revise its proposed work.");
  if (!(await enquiryMembershipCurrent(c, actor.orgId, parent.id))) throw new ControlError(409, "Saved plan membership changed. Prepare new work.");
  if (parent.plan_hash !== revision.parentHash) throw new ControlError(409, "Review the exact parent plan first.");
  const link = (await c.query("SELECT * FROM ll_enquiry_revisions WHERE org_id=$1 AND (parent_id=$2 OR successor_id=$3)", [actor.orgId, parent.id, id])).rows;
  if (link.length) {
    if (link.length !== 1 || link[0].parent_id !== parent.id || link[0].successor_id !== id || link[0].parent_hash !== revision.parentHash || link[0].lifecycle !== revision.lifecycle || (intentHash ? link[0].intent_hash !== intentHash : (link[0].intent_hash !== null || link[0].change_hash !== digest(JSON.stringify(revision))))) throw new ControlError(409, "This revision ID or parent already belongs to different work. Open its current successor.");
    return { parent, saved: (await c.query("SELECT * FROM ll_enquiry_plans WHERE org_id=$1 AND id=$2", [actor.orgId, id])).rows[0] };
  }
  if (parent.run_id) throw new ControlError(409, "Submitted work cannot be revised. Resume or inspect the existing run.");
  if (parent.fixture_id !== "chat_ack_v1") throw new ControlError(409, "Only the supported acknowledgement plan can be revised.");
  if ((await c.query("SELECT 1 FROM ll_enquiry_plans WHERE org_id=$1 AND id=$2", [actor.orgId, id])).rowCount) throw new ControlError(409, "This successor ID already belongs to other work.");
  return { parent, saved: null };
}
export async function currentPlanLeaf(c: PoolClient, orgId: string, id: string) {
  const installed = await revisionInstalled(c);
  if (installed && (await c.query("SELECT 1 FROM ll_enquiry_revisions WHERE org_id=$1 AND parent_id=$2", [orgId, id])).rowCount) throw new ControlError(409, "This plan has a newer immutable version. Review its current successor.");
}

async function revisionInstalled(c: PoolClient) {
  const row = (await c.query("SELECT to_regprocedure('ll_enquiry_revision24()') AS marker, to_regclass('ll_enquiry_revisions') AS storage, to_regprocedure('ll_membership_authority23()') AS membership")).rows[0];
  if (!row || (!!row.marker !== !!row.storage) || (row.marker && !row.membership)) throw new ControlError(503, "Plan revision installation is incomplete. No work was submitted.");
  return !!row.marker;
}

// Hashes a bounded request, not a transcript; replay never invokes the model again.
export async function refinementParent(c: PoolClient, actor: Actor, id: string, parentId: string, parentHash: string, intentHash: string) {
  if (!(await revisionInstalled(c))) throw new ControlError(503,"Plan revision is not installed.");
  const parent=(await c.query("SELECT * FROM ll_enquiry_plans WHERE org_id=$1 AND id=$2",[actor.orgId,parentId])).rows[0];
  if (!parent || parent.created_by !== actor.subject || parent.membership_owner?.kind !== "member") throw new ControlError(403,"Open your own saved plan to request a change.");
  if (parent.plan_hash !== parentHash || !(await enquiryMembershipCurrent(c,actor.orgId,parentId))) throw new ControlError(409,"Saved plan or membership changed. Open current work.");
  const links=(await c.query("SELECT * FROM ll_enquiry_revisions WHERE org_id=$1 AND (parent_id=$2 OR successor_id=$3)",[actor.orgId,parentId,id])).rows;
  if(links.length){
    if(links.length!==1 || links[0].parent_id!==parentId || links[0].successor_id!==id || links[0].parent_hash!==parentHash || links[0].intent_hash!==intentHash)throw new ControlError(409,"This request or parent already belongs to different work. Open its current version.");
    const saved=(await c.query("SELECT * FROM ll_enquiry_plans WHERE org_id=$1 AND id=$2",[actor.orgId,id])).rows[0];
    if(!saved)throw new ControlError(503,"Saved successor is unavailable.");
    return {parent,saved};
  }
  if(id===parentId || parent.run_id || parent.fixture_id!=="chat_ack_v1" || (await c.query("SELECT 1 FROM ll_enquiry_plans WHERE org_id=$1 AND id=$2",[actor.orgId,id])).rowCount)throw new ControlError(409,"Only unsubmitted current acknowledgement plans can be refined.");
  return {parent,saved:null};
}
export async function revisionListing(c: PoolClient,orgId:string) {
  return await revisionInstalled(c)
    ? (await c.query("SELECT p.*,child.successor_id AS superseded_by,ancestor.parent_id FROM ll_enquiry_plans p LEFT JOIN ll_enquiry_revisions child ON child.org_id=p.org_id AND child.parent_id=p.id LEFT JOIN ll_enquiry_revisions ancestor ON ancestor.org_id=p.org_id AND ancestor.successor_id=p.id WHERE p.org_id=$1 ORDER BY p.created_at DESC,p.id DESC LIMIT 30",[orgId])).rows
    : (await c.query("SELECT * FROM ll_enquiry_plans WHERE org_id=$1 ORDER BY created_at DESC LIMIT 30",[orgId])).rows;
}
