import type { PoolClient } from "pg";
import type { Actor } from "../durable/contracts";
import { memberAuthority } from "./identity";

type Identity = { kind: "member"; subject: string; generation: string } | { kind: "legacy"; subject: string; role: "operator" | "agent" };
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
export async function membershipAuthorityInstalled(c: PoolClient): Promise<boolean> {
  return Boolean((await c.query("SELECT to_regprocedure('ll_membership_authority23()') AS present")).rows[0].present);
}
/** A named identity never falls through to a legacy token, including moved members. */
export async function namedActorCurrent(c: PoolClient, actor: Actor): Promise<boolean> {
  if (!(await membershipAuthorityInstalled(c))) return true;
  const row = (await c.query("SELECT email FROM ll_members WHERE email=$1 FOR SHARE NOWAIT", [actor.subject])).rows[0];
  return (!row && !(await c.query("SELECT ll_named_subject_exists($1) AS present", [actor.subject])).rows[0].present) || actor.role === "operator" && await memberAuthority(c, actor);
}
async function currentIdentity(c: PoolClient, org: string, value: unknown): Promise<boolean> {
  if (!object(value) || typeof value.subject !== "string" || !value.subject || value.subject.length > 254) return false;
  const s = value as unknown as Identity;
  const m = (await c.query("SELECT m.org_id,m.active,g.generation FROM ll_members m LEFT JOIN ll_quote_member_generations g ON g.email=m.email AND g.org_id=m.org_id WHERE m.email=$1 FOR SHARE OF m NOWAIT", [s.subject])).rows[0];
  if (s.kind === "member") return Object.keys(value).length === 3 && typeof s.generation === "string" && /^[1-9][0-9]*$/.test(s.generation) && m?.org_id === org && m.active === true && String(m.generation) === s.generation;
  if (s.kind !== "legacy" || Object.keys(value).length !== 3 || m || (await c.query("SELECT ll_named_subject_exists($1) AS present", [s.subject])).rows[0].present || !["operator", "agent"].includes(s.role)) return false;
  return Boolean((await c.query("SELECT 1 FROM ll_tokens WHERE org_id=$1 AND subject=$2 AND role=$3 AND active=true", [org, s.subject, s.role])).rows[0]);
}
export async function enquiryMembershipCurrent(c: PoolClient, org: string, planId: string): Promise<boolean> {
  if (!(await membershipAuthorityInstalled(c))) return true;
  const p = (await c.query("SELECT created_by,membership_owner FROM ll_enquiry_plans WHERE org_id=$1 AND id=$2", [org, planId])).rows[0];
  return Boolean(p && object(p.membership_owner) && p.membership_owner.subject === p.created_by && await currentIdentity(c, org, p.membership_owner));
}
/** Historical NULL snapshots remain readable but are not execution authority. */
export async function connectorMembershipCurrent(c: PoolClient, org: string, action: { id?: string; agent_id: string; proposed_by?: string; approved_by?: string | null; payload_hash?: string; policy_version: number }, approval: boolean): Promise<boolean> {
  if (!(await membershipAuthorityInstalled(c))) return true;
  // Proposal preparation has not persisted an action yet; INSERT captures current identities.
  if (!action.id) return !approval;
  const a = (await c.query("SELECT membership_proposal,membership_approval FROM ll_connector_actions WHERE org_id=$1 AND id=$2", [org, action.id])).rows[0];
  const p = a?.membership_proposal;
  if (!object(p) || p.version !== 1 || Object.keys(p).length !== 5 || !object(p.requester) || p.requester.subject !== action.proposed_by || !(await currentIdentity(c, org, p.requester))) return false;
  const owner = (await c.query("SELECT owner FROM ll_agent_profiles WHERE org_id=$1 AND agent_id=$2", [org, action.agent_id])).rows[0];
  if (owner ? !object(p.owner) || p.owner.subject !== owner.owner || !(await currentIdentity(c, org, p.owner)) : p.owner !== null) return false;
  const plan = (await c.query("SELECT p.id,p.membership_owner FROM ll_enquiry_plans p JOIN ll_workflow_steps s ON s.org_id=p.org_id AND s.run_id=p.run_id WHERE s.org_id=$1 AND s.action_id=$2", [org, action.id])).rows[0];
  if (plan ? p.planId !== plan.id || JSON.stringify(p.planOwner) !== JSON.stringify(plan.membership_owner) || !(await enquiryMembershipCurrent(c, org, plan.id)) : p.planOwner !== null || p.planId !== null) return false;
  if (!approval) return true;
  const ap = a.membership_approval;
  return object(ap) && ap.version === 1 && Object.keys(ap).length === 4 && ap.payloadHash === action.payload_hash && ap.policyVersion === action.policy_version && object(ap.approver) && ap.approver.subject === action.approved_by && ![p.requester.subject, object(p.owner) ? p.owner.subject : null, object(p.planOwner) ? p.planOwner.subject : null].includes(action.approved_by) && await currentIdentity(c, org, ap.approver);
}

export async function independentConnectorReviewer(c: PoolClient, org: string, id: string, subject: string): Promise<boolean> {
  if (!(await membershipAuthorityInstalled(c))) return true;
  const row = (await c.query("SELECT membership_proposal FROM ll_connector_actions WHERE org_id=$1 AND id=$2", [org,id])).rows[0];
  const p = row?.membership_proposal;
  return object(p) && p.version === 1 && ![p.requester,p.owner,p.planOwner].some(identity => object(identity) && identity.subject === subject);
}
