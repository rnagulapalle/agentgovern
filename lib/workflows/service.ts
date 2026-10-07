import { managedWorker } from "../enquiries/dispatch";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { transaction } from "../durable/database";
import { authorize } from "../durable/service";
import { ControlError, type Actor } from "../durable/contracts";
import { ConnectorControl } from "../connectors/service";
import { connectorBody } from "../connectors/twin";
export class WorkflowControl {
  constructor(
    readonly db: Pool,
    readonly connectors: ConnectorControl,
  ) {}
  async create(
    actor: Actor,
    crmAgent: string,
    emailAgent: string,
    runId: string,
    lifecycle: "lead" | "customer" = "customer",
    client?: PoolClient,
  ) {
    const create = async (c: PoolClient) => {
      await this.connectors.authority(c, actor, ["operator"]);
      if (!["lead", "customer"].includes(lifecycle))
        throw new ControlError(400, "Choose a supported contact lifecycle.");
      if (
        typeof runId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          runId,
        )
      )
        throw new ControlError(
          400,
          "A stable workflow request ID is required.",
        );
      const existing = (
        await c.query(
          "SELECT id FROM ll_workflow_runs WHERE org_id=$1 AND id=$2",
          [actor.orgId, runId],
        )
      ).rows[0];
      if (existing) {
        const steps = (
          await c.query(
            "SELECT agent_id,payload FROM ll_workflow_steps WHERE org_id=$1 AND run_id=$2 ORDER BY ordinal",
            [actor.orgId, runId],
          )
        ).rows;
        if (
          steps.length !== 2 ||
          steps[0].agent_id !== crmAgent ||
          steps[1].agent_id !== emailAgent ||
          steps[0].payload.lifecycle !== lifecycle
        )
          throw new ControlError(
            409,
            "Workflow ID already belongs to a different plan.",
          );
        return runId;
      }
      for (const [id, tool] of [
        [crmAgent, "twin.crm"],
        [emailAgent, "twin.email"],
      ]) {
        if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(id))
          throw new ControlError(
            400,
            "Choose registered CRM and messaging agents.",
          );
        const a = (
          await c.query(
            "SELECT * FROM ll_agents WHERE org_id=$1 AND id=$2 AND active=true AND $3=ANY(tools) AND EXISTS(SELECT 1 FROM ll_tokens t WHERE t.org_id=ll_agents.org_id AND t.subject=ll_agents.id AND t.role='agent' AND t.active=true)",
            [actor.orgId, id, tool],
          )
        ).rows[0];
        if (!a)
          throw new ControlError(
            403,
            "An active scoped agent is required for each step.",
          );
      }
      for (const agent of [crmAgent, emailAgent])
        await c.query(
          "INSERT INTO ll_workflow_agents(org_id,agent_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [actor.orgId, agent],
        );
      const id = runId;
      await c.query(
        "INSERT INTO ll_workflow_runs(org_id,id,created_by) VALUES($1,$2,$3)",
        [actor.orgId, id, actor.subject],
      );
      for (const [ordinal, agent, connector, payload] of [
        [1, crmAgent, "crm", { lifecycle }],
        [2, emailAgent, "email", { template: "case_received" }],
      ] as const)
        await c.query(
          "INSERT INTO ll_workflow_steps(org_id,run_id,ordinal,action_id,agent_id,connector,payload) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            actor.orgId,
            id,
            ordinal,
            randomUUID(),
            agent,
            connector,
            JSON.stringify(payload),
          ],
        );
      await c.query(
        "INSERT INTO ll_workflow_events(org_id,run_id,kind,subject) VALUES($1,$2,'created',$3)",
        [actor.orgId, id, actor.subject],
      );
      return id;
    };
    return client ? create(client) : transaction(this.db, actor.orgId, create);
  }
  async read(actor: Actor, id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id))
      throw new ControlError(400, "Choose a valid workflow.");
    return transaction(this.db, actor.orgId, async (c) => {
      await this.connectors.authority(c, actor, [
        "operator",
        "agent",
        "worker",
      ]);
      const run = (
        await c.query(
          "SELECT * FROM ll_workflow_runs WHERE org_id=$1 AND id=$2",
          [actor.orgId, id],
        )
      ).rows[0];
      const steps = (
        await c.query(
          "SELECT s.*,a.state,a.reason,a.payload_hash,a.payload AS approved_payload,a.evidence,a.approved_by,a.approval_until FROM ll_workflow_steps s LEFT JOIN ll_connector_actions a ON a.org_id=s.org_id AND a.id=s.action_id WHERE s.org_id=$1 AND s.run_id=$2 ORDER BY s.ordinal",
          [actor.orgId, id],
        )
      ).rows;
      if (
        !run ||
        (actor.role === "agent" &&
          !steps.some((s) => s.agent_id === actor.subject))
      )
        throw new ControlError(404, "Workflow not found.");
      // Agents receive only their own immutable step instructions, never peer action payloads.
      return {
        ...run,
        steps:
          actor.role === "agent"
            ? steps.filter((s) => s.agent_id === actor.subject)
            : steps.map(s => ({ ...s, proposedRequest: { method: s.connector === "crm" ? "PATCH" : "POST", resource: s.connector === "crm" ? "CRM contact 1001" : "Email acknowledgement", body: connectorBody(s), approvedSourceVersion: s.approved_payload?.sourceVersion || null } })),
      };
    });
  }
  async list(actor: Actor) {
    return transaction(this.db, actor.orgId, async (c) => {
      await this.connectors.authority(c, actor, ["operator"]);
      return (
        await c.query(
          "SELECT * FROM ll_workflow_runs WHERE org_id=$1 ORDER BY created_at DESC LIMIT 50",
          [actor.orgId],
        )
      ).rows;
    });
  }
  async pause(actor: Actor, id: string) {
    await this.read(actor, id);
    return transaction(this.db, actor.orgId, async (c) => {
      await authorize(c, actor, ["operator"]);
      const run = (
        await c.query(
          "SELECT state FROM ll_workflow_runs WHERE org_id=$1 AND id=$2",
          [actor.orgId, id],
        )
      ).rows[0];
      if (run.state === "paused") return { paused: true };
      if (run.state !== "active")
        throw new ControlError(409, "A completed workflow cannot be paused.");
      await c.query(
        "UPDATE ll_workflow_runs SET state='paused' WHERE org_id=$1 AND id=$2",
        [actor.orgId, id],
      );
      await c.query(
        "INSERT INTO ll_workflow_events(org_id,run_id,kind,subject) VALUES($1,$2,'pause_requested',$3)",
        [actor.orgId, id, actor.subject],
      );
      return { paused: true };
    });
  }
  async verify(actor: Actor, id: string) {
    const run = await this.read(actor, id);
    if (actor.role !== "operator" && actor.role !== "worker") throw new ControlError(403, "A named operator must verify the run.");
    if (actor.role === "worker") await transaction(this.db, actor.orgId, c => managedWorker(c, actor, id));
    if (run.state !== "active")
      throw new ControlError(
        409,
        "Only an active workflow can complete verification.",
      );
    for (const step of run.steps) {
      if (!["succeeded", "uncertain", "executing"].includes(step.state))
        throw new ControlError(
          409,
          "Every step must execute before final verification.",
        );
      await this.connectors.reconcile(actor, step.action_id);
    }
    return transaction(this.db, actor.orgId, async (c) => {
      await this.connectors.authority(c, actor, ["operator", "worker"]);
      if (actor.role === "worker") await managedWorker(c, actor, id);
      const state = (
        await c.query(
          "SELECT state FROM ll_workflow_runs WHERE org_id=$1 AND id=$2",
          [actor.orgId, id],
        )
      ).rows[0];
      const steps = (
        await c.query(
          "SELECT a.* FROM ll_workflow_steps s JOIN ll_connector_actions a ON a.org_id=s.org_id AND a.id=s.action_id WHERE s.org_id=$1 AND s.run_id=$2",
          [actor.orgId, id],
        )
      ).rows;
      if (
        state.state !== "active" ||
        steps.length !== 2 ||
        steps.some((s) => s.state !== "succeeded")
      )
        throw new ControlError(
          409,
          "Uncertain or conflicting outcomes keep this workflow open.",
        );
      for (const a of steps)
        if (!(await this.connectors.valid(c, actor, a, false)))
          throw new ControlError(
            409,
            "Authority changed. Workflow completion is held.",
          );
      await c.query(
        "UPDATE ll_workflow_runs SET state='completed' WHERE org_id=$1 AND id=$2",
        [actor.orgId, id],
      );
      await c.query(
        "INSERT INTO ll_workflow_events(org_id,run_id,kind,subject) VALUES($1,$2,'verified',$3)",
        [actor.orgId, id, actor.subject],
      );
      return { verified: true };
    });
  }
}
