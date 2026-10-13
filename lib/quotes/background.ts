import type { PoolClient } from "pg";
import { isDeepStrictEqual } from "node:util";
import { authorize } from "../durable/service";
import { assertTenantPool } from "../durable/tenant-pool";
import { ControlError, type Actor } from "../durable/contracts";
import { quotePlanDigest } from "./digest";
import { quoteRequestIdentity } from "./effect";
import { nativeMailIdentity } from "./native-email-transport";
import { assertBoundQuotePlanContract } from "./plan-v2";
import { assertQuoteRunContract } from "../orchestration/quote-contract";
// A separate installed workload role is mandatory. Token possession alone is not
// a named session, and it cannot borrow an enquiry worker's role or routing.
export async function managedQuoteWorker(c: PoolClient, actor: Actor, id: string, kind: "plan" | "run" | "action" = "run") {
  if (actor.role !== "worker" || actor.subject !== "quote-temporal") throw new ControlError(403,"Quote background workload required.");
  const binding=await assertTenantPool(c,actor.orgId);
  if(binding.purpose!=="worker")throw new ControlError(403,"Quote execution requires its scoped worker pool.");
  await authorize(c,actor,["worker"],"quotes");
  if(!(await c.query("SELECT 1 FROM ll_quote_workload_roles WHERE org_id=$1 AND role_oid=$2::oid AND purpose='worker'",[actor.orgId,binding.roleOid])).rowCount)throw new ControlError(403,"Dedicated quote worker installation required.");
  if(!(await c.query("SELECT to_regclass('ll_quote_background_routes') present")).rows[0].present)throw new ControlError(503,"Quote background route is not installed.");
  const field=kind==="plan"?"p.id=$2":kind==="run"?"p.id=$2":"(p.quote_action_id=$2 OR p.message_action_id=$2)";
  const rows=(await c.query("SELECT r.*,r.worker_role_oid::text AS worker_role_oid,r.scheduler_role_oid::text AS scheduler_role_oid,p.plan,p.plan_hash AS saved_hash,p.recovery_epoch AS saved_epoch,p.id AS saved_run FROM ll_quote_background_routes r JOIN ll_quote_plans p ON p.org_id=r.org_id AND p.id=r.plan_id WHERE r.org_id=$1 AND "+field,[actor.orgId,id])).rows;
  if(rows.length!==1)throw new ControlError(403,"Exact quote background dispatch was not requested.");
  const r=rows[0],plan=r.plan;
  const roles=(await c.query("SELECT q.role_oid::text oid,q.purpose FROM ll_quote_workload_roles q JOIN pg_roles r ON r.oid=q.role_oid WHERE q.org_id=$1 AND q.role_oid=ANY($2::oid[]) AND r.rolcanlogin AND NOT(r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication) AND NOT EXISTS(SELECT 1 FROM pg_auth_members g WHERE g.member=r.oid)",[actor.orgId,[r.worker_role_oid,r.scheduler_role_oid]])).rows;
  if(r.worker_role_oid===r.scheduler_role_oid||roles.length!==2||!roles.some(v=>v.oid===r.worker_role_oid&&v.purpose==="worker")||!roles.some(v=>v.oid===r.scheduler_role_oid&&v.purpose==="scheduler"))throw new ControlError(409,"Exact distinct quote workload roles changed.");
  assertQuoteRunContract(r.contract);assertBoundQuotePlanContract(plan);
  if(r.worker_role_oid!==binding.roleOid||r.recovery_epoch!==binding.epoch||r.saved_epoch!==binding.epoch||r.contract.recoveryEpoch!==binding.epoch
    ||r.plan_hash!==r.saved_hash||quotePlanDigest(plan)!==r.saved_hash||r.contract.planHash!==r.saved_hash||r.contract.planId!==r.plan_id||r.contract.runId!==r.saved_run
    ||r.contract.updateActionId!==plan.update.actionId||r.contract.messageActionId!==plan.message.actionId
    ||r.contract.updateRequestIdentity!==quoteRequestIdentity(plan.update.request)||r.contract.messageRequestIdentity!==nativeMailIdentity(plan.message.request)
    ||!isDeepStrictEqual(r.authority,plan.authority)||r.contract.workerBuildId!==r.worker_build_id)
      throw new ControlError(409,"Quote background history or workload authority changed.");
  return r;
}
