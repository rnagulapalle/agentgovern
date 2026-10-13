import { managedQuoteWorker } from "../quotes/background";
import { enquiryMembershipCurrent, membershipAuthorityInstalled } from "../workspace/membership-authority";
import type { PoolClient } from "pg";
import type { Actor } from "../durable/contracts";
import { ControlError } from "../durable/contracts";
// No human session or approval is impersonated by the background dispatcher.
export async function managedWorker(c: PoolClient, actor: Actor, id: string, action = false) {
  if(actor.role === "worker" && actor.subject === "quote-temporal"){await managedQuoteWorker(c,actor,id,action?"action":"run");return;}
  if (actor.role !== "worker" || !["enquiry-runner", "enquiry-temporal"].includes(actor.subject) || !(await c.query("SELECT to_regclass('ll_enquiry_dispatch') AS present")).rows[0].present)
    throw new ControlError(403, "This worker cannot operate a reviewed enquiry.");
  const query = action
    ? "SELECT 1 FROM ll_enquiry_dispatch d JOIN ll_enquiry_plans p ON p.org_id=d.org_id AND p.id=d.plan_id JOIN ll_workflow_steps s ON s.org_id=p.org_id AND s.run_id=p.run_id WHERE d.org_id=$1 AND s.action_id=$2"
    : "SELECT 1 FROM ll_enquiry_dispatch d JOIN ll_enquiry_plans p ON p.org_id=d.org_id AND p.id=d.plan_id WHERE d.org_id=$1 AND p.run_id=$2";
  if (!(await c.query(query, [actor.orgId, id])).rows[0]) throw new ControlError(403, "Background dispatch was not requested for this run.");
  await dispatchOwnership(c, actor, id, action);
}

// Absence of migration/ownership preserves the legacy path; Temporal defaults deny.
export async function dispatchOwnership(c: PoolClient, actor: Actor, actionId: string, action = true) {
  // Select the immutable graph kind from shared workflow tables before
  // touching quote-only storage. ACK roles deliberately have no quote grants.
  const graph=(await c.query(action
    ? "SELECT CASE WHEN to_jsonb(r)?'workflow_kind' THEN to_jsonb(r)->>'workflow_kind' ELSE 'customer-acknowledgement' END AS workflow_kind FROM ll_workflow_steps s JOIN ll_workflow_runs r ON r.org_id=s.org_id AND r.id=s.run_id WHERE s.org_id=$1 AND s.action_id=$2"
    : "SELECT CASE WHEN to_jsonb(r)?'workflow_kind' THEN to_jsonb(r)->>'workflow_kind' ELSE 'customer-acknowledgement' END AS workflow_kind FROM ll_workflow_runs r WHERE org_id=$1 AND id=$2",[actor.orgId,actionId])).rows;
  if(graph.length>1 || graph.some(r=>!['customer-acknowledgement','distributor-quote'].includes(r.workflow_kind)))throw new ControlError(409,"Exact supported workflow kind required.");
  let quoteSource=graph[0]?.workflow_kind === "distributor-quote";
  if(action){
    const saved=(await c.query("SELECT connector,payload->>'contract' AS contract FROM ll_connector_actions WHERE org_id=$1 AND id=$2",[actor.orgId,actionId])).rows;
    const quoteAction=saved.some(a=>a.connector==='quote'||a.contract==='quote-step-1');
    if(saved.length && graph.length && quoteAction !== (graph[0].workflow_kind==='distributor-quote'))throw new ControlError(409,"Saved action differs from its workflow kind.");
    quoteSource ||= quoteAction;
  }
  if(quoteSource && (await c.query("SELECT to_regclass('ll_quote_background_routes') present")).rows[0].present){
    const routed=Boolean((await c.query("SELECT 1 FROM ll_quote_background_routes r JOIN ll_quote_plans p ON p.org_id=r.org_id AND p.id=r.plan_id WHERE r.org_id=$1 AND "+(action?"(p.quote_action_id=$2 OR p.message_action_id=$2)":"p.id=$2"),[actor.orgId,actionId])).rowCount);
    if(routed){await managedQuoteWorker(c,actor,actionId,action?"action":"run");return;}
  }
  if(actor.role=== "worker" && actor.subject==="quote-temporal")throw new ControlError(403,"This quote worker does not own the run.");
  let owned = false;
  if ((await c.query("SELECT to_regclass('ll_temporal_dispatch') AS present")).rows[0].present)
    owned = Boolean((await c.query("SELECT 1 FROM ll_temporal_dispatch d JOIN ll_enquiry_plans p ON p.org_id=d.org_id AND p.id=d.plan_id JOIN ll_workflow_steps s ON s.org_id=p.org_id AND s.run_id=p.run_id WHERE d.org_id=$1 AND " + (action ? "s.action_id=$2" : "p.run_id=$2"), [actor.orgId, actionId])).rows[0]);
  const temporal = actor.role === "worker" && actor.subject === "enquiry-temporal";
  if (owned !== temporal) throw new ControlError(403, "This executor does not own the run.");
}
export async function managedOwnerActive(c: PoolClient, org: string, actionId: string) {
  if (await membershipAuthorityInstalled(c)) {
    const plan = (await c.query("SELECT p.id FROM ll_enquiry_plans p JOIN ll_workflow_steps s ON s.org_id=p.org_id AND s.run_id=p.run_id WHERE s.org_id=$1 AND s.action_id=$2", [org,actionId])).rows[0];
    return !plan || await enquiryMembershipCurrent(c,org,plan.id);
  }
  if (!(await c.query("SELECT to_regclass('ll_enquiry_dispatch') AS present")).rows[0].present) return true;
  const row = (await c.query("SELECT EXISTS(SELECT 1 FROM ll_members m WHERE m.org_id=p.org_id AND m.email=p.created_by AND m.active=true) AS active FROM ll_enquiry_dispatch d JOIN ll_enquiry_plans p ON p.org_id=d.org_id AND p.id=d.plan_id JOIN ll_workflow_steps s ON s.org_id=p.org_id AND s.run_id=p.run_id WHERE d.org_id=$1 AND s.action_id=$2", [org, actionId])).rows[0];
  return !row || row.active === true;
}
