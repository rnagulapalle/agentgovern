import type { Pool, PoolClient } from "pg";
import { ControlError, type Actor } from "../durable/contracts";
import { transaction } from "../durable/database";
import { digest } from "../workspace/identity";
import { WorkflowControl } from "../workflows/service";
import { approvedReply, checkContact, enquiryFixture, validId, type Contact } from "./contracts";

export class EnquiryControl {
  constructor(readonly db: Pool, readonly workflows: WorkflowControl, readonly contact: () => Promise<Contact>) {}
  async policies(c: PoolClient, actor: Actor) {
    await this.workflows.connectors.authority(c, actor, ["operator"]);
    const rows = (await c.query("SELECT connector,version FROM ll_connector_policies WHERE org_id=$1 AND active=true ORDER BY connector", [actor.orgId])).rows;
    if (rows.length !== 2) throw new ControlError(409, "Both sample connectors must be available before preparing work.");
    return Object.fromEntries(rows.map((r) => [r.connector, r.version]));
  }
  async list(actor: Actor) {
    return transaction(this.db, actor.orgId, async (c) => {
      await this.workflows.connectors.authority(c, actor, ["operator"]);
      return (await c.query("SELECT * FROM ll_enquiry_plans WHERE org_id=$1 ORDER BY created_at DESC LIMIT 30", [actor.orgId])).rows;
    });
  }
  async prepare(actor: Actor, id: string, fixtureId: string) {
    validId(id);
    const fixture = enquiryFixture(fixtureId);
    await transaction(this.db, actor.orgId, (c) => this.policies(c, actor));
    if (fixture.id === "missing") return { clarification: "Who sent this enquiry? A verified sender is required before matching a contact or preparing a message." };
    if (fixture.id === "unmatched") return { clarification: "This sender does not match the supported sample contact. Ask a person to identify the right record; no contact is created automatically." };
    if (fixture.id === "pricing") return { clarification: "This enquiry requests a discount. Approved information only permits an acknowledgement; a person must decide pricing. No discount or customer commitment is proposed." };
    const contact = await this.contact();
    checkContact(contact);
    return transaction(this.db, actor.orgId, async (c) => {
      const versions = await this.policies(c, actor);
      const old = (await c.query("SELECT * FROM ll_enquiry_plans WHERE org_id=$1 AND id=$2", [actor.orgId, id])).rows[0];
      if (old) {
        if (old.fixture_id !== fixtureId) throw new ControlError(409, "This enquiry ID already belongs to different work.");
        return { saved: old };
      }
      const plan = { enquiry: fixture, contact: { id: contact.id, email: contact.email }, crm: { lifecycle: contact.lifecycle }, reply: approvedReply, approval: "Independent named approval for each effect", scope: "Private provider twins; no real delivery" };
      const hash = digest(JSON.stringify([plan, contact.version, versions]));
      const saved = (await c.query("INSERT INTO ll_enquiry_plans(org_id,id,fixture_id,source_version,policy_versions,plan,plan_hash,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *", [actor.orgId, id, fixtureId, contact.version, JSON.stringify(versions), JSON.stringify(plan), hash, actor.subject])).rows[0];
      return { saved };
    });
  }
  async start(actor: Actor, id: string, hash: string, crm: string, email: string) {
    validId(id);
    if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) throw new ControlError(400, "Review the exact saved plan first.");
    await transaction(this.db, actor.orgId, (c) => this.policies(c, actor));
    const contact = await this.contact();
    checkContact(contact);
    return transaction(this.db, actor.orgId, async (c) => {
      const versions = await this.policies(c, actor);
      const plan = (await c.query("SELECT * FROM ll_enquiry_plans WHERE org_id=$1 AND id=$2", [actor.orgId, id])).rows[0];
      if (!plan) throw new ControlError(404, "Enquiry plan not found.");
      if (plan.plan_hash !== hash) throw new ControlError(409, "The plan changed. Review it again before starting work.");
      // A response lost after commit must resume the same immutable run, not
      // reject solely because that run has since changed the provider version.
      if (!plan.run_id && (plan.source_version !== contact.version || JSON.stringify(plan.policy_versions) !== JSON.stringify(versions)))
        throw new ControlError(409, "The record or policy changed. Prepare a new plan and review it before execution.");
      if (!plan.run_id && (await c.query("SELECT 1 FROM ll_workflow_runs WHERE org_id=$1 AND id=$2", [actor.orgId, id])).rows[0])
        throw new ControlError(409, "This ID already belongs to unrelated work. Start a new enquiry plan.");
      const runId = await this.workflows.create(actor, crm, email, id, plan.plan.crm.lifecycle, c);
      await c.query("UPDATE ll_enquiry_plans SET run_id=$3 WHERE org_id=$1 AND id=$2", [actor.orgId, id, runId]);
      return { runId };
    });
  }
}
