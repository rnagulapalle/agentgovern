import { scopedGrantMatches, type ScopeGrantSnapshot } from "../connectors/scopes";
import { requestMatches, sameRequestSnapshot, type RequestSnapshot } from "../connectors/request";
import type { PoolClient } from "pg";
import { ControlError } from "../durable/contracts";
import { bindingMatches, type ConnectorProvider, type ConnectorProposal } from "../connectors/contracts";
export async function workflowProposal(
  c: PoolClient,
  org: string,
  p: ConnectorProposal,
) {
  const step = (
    await c.query(
      "SELECT * FROM ll_workflow_steps WHERE org_id=$1 AND action_id=$2",
      [org, p.actionId],
    )
  ).rows[0];
  if (
    !step &&
    (
      await c.query(
        "SELECT 1 FROM ll_workflow_agents WHERE org_id=$1 AND agent_id=$2",
        [org, p.agentId],
      )
    ).rows[0]
  )
    throw new ControlError(
      403,
      "This agent can submit only enrolled workflow steps.",
    );
  if (
    step &&
    (step.agent_id !== p.agentId ||
      step.connector !== p.connector ||
      JSON.stringify(step.payload) !== JSON.stringify(p.payload))
  )
    throw new ControlError(
      409,
      "The request does not match this workflow step.",
    );
}
export async function workflowDispatch(c: PoolClient, org: string, id: string, provider: ConnectorProvider) {
  const step = (
    await c.query(
      "SELECT s.*,r.state AS run_state FROM ll_workflow_steps s JOIN ll_workflow_runs r ON r.org_id=s.org_id AND r.id=s.run_id WHERE s.org_id=$1 AND s.action_id=$2",
      [org, id],
    )
  ).rows[0];
  if (!step) {
    const bound = (
      await c.query(
        "SELECT 1 FROM ll_connector_actions a JOIN ll_workflow_agents g ON g.org_id=a.org_id AND g.agent_id=a.agent_id WHERE a.org_id=$1 AND a.id=$2",
        [org, id],
      )
    ).rows[0];
    if (bound)
      throw new ControlError(
        403,
        "This agent can execute only enrolled workflow steps.",
      );
    return;
  }
  if (step.run_state !== "active")
    throw new ControlError(409, "This workflow is paused or completed.");
  const missing = (
    await c.query(
      "SELECT s.ordinal FROM ll_workflow_steps s LEFT JOIN ll_connector_actions a ON a.org_id=s.org_id AND a.id=s.action_id LEFT JOIN ll_connector_policies p ON p.org_id=a.org_id AND p.connector=a.connector LEFT JOIN ll_agents g ON g.org_id=a.org_id AND g.id=a.agent_id WHERE s.org_id=$1 AND s.run_id=$2 AND s.ordinal<$3 AND (a.state IS DISTINCT FROM 'succeeded' OR p.active IS DISTINCT FROM true OR p.version IS DISTINCT FROM a.policy_version OR g.active IS DISTINCT FROM true OR NOT ('twin.'||a.connector)=ANY(g.tools) OR NOT EXISTS(SELECT 1 FROM ll_tokens t WHERE t.org_id=g.org_id AND t.subject=g.id AND t.role='agent' AND t.active=true))",
      [org, step.run_id, step.ordinal],
    )
  ).rows;
  const predecessors = (await c.query("SELECT a.agent_id,a.connector,a.payload FROM ll_workflow_steps s JOIN ll_connector_actions a ON a.org_id=s.org_id AND a.id=s.action_id WHERE s.org_id=$1 AND s.run_id=$2 AND s.ordinal<$3",[org,step.run_id,step.ordinal])).rows;
  let scopeInvalid=false;
  for (const a of predecessors) if (!(await scopedGrantMatches(c,org,a,provider))) scopeInvalid=true;
  if (missing.length || scopeInvalid || predecessors.some(a => !bindingMatches(provider,a) || !requestMatches(provider,a)))
    throw new ControlError(
      409,
      "A preceding step is unverified or its authority changed. Downstream execution is held.",
    );
}

export async function enquirySource(c: PoolClient, org: string, actionId: string, version: string | null, binding: string, request: RequestSnapshot, grant: ScopeGrantSnapshot|null = null) {
  const plan = (await c.query("SELECT p.source_version,p.plan,s.ordinal FROM ll_workflow_steps s JOIN ll_enquiry_plans p ON p.org_id=s.org_id AND p.run_id=s.run_id WHERE s.org_id=$1 AND s.action_id=$2", [org, actionId])).rows[0];
  if (plan && grant && (plan.plan.recordEnrollment?.id!==grant.scopeId || plan.plan.recordEnrollment?.version!==grant.scopeVersion)) throw new ControlError(409,"Enrolled record authority changed after plan review. Prepare fresh work.");
  if (plan && plan.plan.connectorBinding !== binding) throw new ControlError(409, "Connector destination changed after plan review. Prepare fresh work; no action was proposed.");
  if (plan && !sameRequestSnapshot(plan.plan.requests?.[plan.ordinal === 1 ? "crm" : "email"],request)) throw new ControlError(409,"The connector request changed after plan review. Prepare fresh work; no action was proposed.");
  if (plan && plan.ordinal === 1 && plan.source_version !== version)
    throw new ControlError(409, "The contact changed after plan review. This enquiry stays held; prepare new work rather than silently changing its evidence.");
}
