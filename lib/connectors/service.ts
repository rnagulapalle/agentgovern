import { NativeQuoteMailConnector } from "./native-quote-mail";
import { NativeQuoteConnector } from "./native-quote";
import { isQuoteAction, type QuoteActionBoundary, type QuoteStep } from "./quote-action";
import { quotePlanDigest } from "../quotes/digest";
import { isDeepStrictEqual } from "node:util";
import { connectorMembershipCurrent, namedActorCurrent, independentConnectorReviewer } from "../workspace/membership-authority";
import { currentScopeGrant, scopedGrantMatches } from "./scopes";
import { sameRequestSnapshot, preparedRequest, requestMatches } from "./request";
import { managedWorker, dispatchOwnership, managedOwnerActive } from "../enquiries/dispatch";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { transaction } from "../durable/database";
import { authorize, tokenHash } from "../durable/service";
import { ControlError, type Actor } from "../durable/contracts";
import { activeApprover } from "../workspace/identity";
import {
  parseConnectorProposal,
  bindingMatches,
  type ConnectorAction,
  type ConnectorProvider,
  type Observation,
} from "./contracts";

import { workflowProposal, workflowDispatch, enquirySource } from "../workflows/guard";

// Only the isolated fixture workspace is supported by these provider contracts.
export class ConnectorControl {
  constructor(
    readonly db: Pool,
    readonly provider: ConnectorProvider,
    readonly quoteBoundary?: QuoteActionBoundary,
  ) {}
  private inTransaction<T>(actor:Actor,callback:(c:PoolClient)=>Promise<T>):Promise<T>{
    return transaction(this.db,actor.orgId,c=>{
      if(this.quoteBoundary&&this.quoteBoundary.db!==this.db)throw new ControlError(503,'Exact quote service pool required.');
      const context=this.quoteBoundary?.transactionContext;
      return context?context.run(c,actor,()=>callback(c)):callback(c);
    });
  }
  async authority(c: PoolClient, actor: Actor, roles: Actor["role"][]) {
    if (actor.orgId !== this.provider.workspaceId)
      throw new ControlError(
        403,
        "Connector is not assigned to this workspace.",
      );
    if (!(await namedActorCurrent(c, actor))) throw new ControlError(403, "Current named workspace session is required.");
    await authorize(c, actor, roles, actor.role === "worker" && ["enquiry-runner", "enquiry-temporal", "quote-temporal"].includes(actor.subject) ? (actor.subject === "quote-temporal" ? "quotes" : "enquiries") : undefined);
  }
  async get(c: PoolClient, actor: Actor, id: string): Promise<ConnectorAction> {
    const a = (
      await c.query(
        "SELECT * FROM ll_connector_actions WHERE org_id=$1 AND id=$2",
        [actor.orgId, id],
      )
    ).rows[0];
    if (!a || (actor.role === "agent" && a.agent_id !== actor.subject))
      throw new ControlError(404, "Action not found.");
    return a;
  }
  async event(c: PoolClient, actor: Actor, id: string, kind: string) {
    await c.query(
      "INSERT INTO ll_connector_events(org_id,action_id,kind,subject) VALUES($1,$2,$3,$4)",
      [actor.orgId, id, kind, actor.subject],
    );
  }
  async state(
    c: PoolClient,
    actor: Actor,
    a: ConnectorAction,
    state: ConnectorAction["state"],
    reason: string,
    evidence: Observation | null = null,
  ) {
    const result = (
      await c.query(
        "UPDATE ll_connector_actions SET state=$3,reason=$4,lease_token=NULL,lease_until=NULL,evidence=COALESCE($5::jsonb,evidence) WHERE org_id=$1 AND id=$2 RETURNING *",
        [
          actor.orgId,
          a.id,
          state,
          reason,
          evidence ? JSON.stringify(evidence) : null,
        ],
      )
    ).rows[0];
    await this.event(c, actor, a.id, state);
    return result as ConnectorAction;
  }
  async valid(
    c: PoolClient,
    actor: Actor,
    a: ConnectorAction,
    approval = true,
    freshQuoteSource = true,
    provider: ConnectorProvider = this.provider,
  ) {
    if (isQuoteAction(a)) {
      if (!this.quoteBoundary || !(await this.quoteBoundary.matches(c,actor,a,provider,freshQuoteSource))) return false;
    } else if (!bindingMatches(this.provider, a) || !requestMatches(this.provider, a) || !(await scopedGrantMatches(c,actor.orgId,a,this.provider))) return false;
    if (!(await managedOwnerActive(c, actor.orgId, a.id)) || !(await connectorMembershipCurrent(c, actor.orgId, a, approval))) return false;
    const row = (
      await c.query(
        "SELECT a.active,a.tools,p.version,p.active AS policy_active,EXISTS(SELECT 1 FROM ll_tokens t WHERE t.org_id=a.org_id AND t.subject=a.id AND t.role='agent' AND t.active=true) AS identity_active FROM ll_agents a JOIN ll_connector_policies p ON p.org_id=a.org_id AND p.connector=$3 WHERE a.org_id=$1 AND a.id=$2",
        [actor.orgId, a.agent_id, a.connector],
      )
    ).rows[0];
    if (
      !row?.active ||
      !row.policy_active ||
      !row.identity_active ||
      !row.tools.includes(`twin.${a.connector}`) ||
      row.version !== a.policy_version
    )
      return false;
    return (
      !approval ||
      Boolean(
        a.approved_by &&
          a.approved_by !== a.proposed_by &&
          a.approval_until &&
          new Date(a.approval_until).getTime() > Date.now() &&
          (await activeApprover(c, actor.orgId, a.approved_by)),
      )
    );
  }
  async propose(actor: Actor, value: unknown) {
    if (this.provider.recordScope && actor.orgId !== this.provider.recordScope.workspaceId) throw new ControlError(403,"Record scope belongs to another workspace.");
    const p = parseConnectorProposal(value);
    const sameRequest = (old: ConnectorAction) =>
      old.agent_id === p.agentId &&
      old.connector === p.connector &&
      (p.connector === "crm"
        ? (old.payload as { lifecycle: string }).lifecycle ===
          (p.payload as { lifecycle: string }).lifecycle
        : sameRequestSnapshot(preparedRequest("email",old.payload,this.provider.contactId ?? "1001",this.provider.recordScope),preparedRequest("email",p.payload,this.provider.contactId ?? "1001",this.provider.recordScope)));
    const previous = await this.inTransaction(actor, async (c) => {
      await this.authority(c, actor, ["agent", "operator"]);
      await workflowProposal(c, actor.orgId, p);
      if (actor.role === "agent" && actor.subject !== p.agentId)
        throw new ControlError(403, "Agent identity must match the request.");
      return (
        await c.query(
          "SELECT * FROM ll_connector_actions WHERE org_id=$1 AND id=$2",
          [actor.orgId, p.actionId],
        )
      ).rows[0] as ConnectorAction | undefined;
    });
    if (previous) {
      if (!sameRequest(previous))
        throw new ControlError(
          409,
          "Action ID already has a different request.",
        );
      return { ...previous, lease_token: null };
    }
    // Trusted source lookup is outside mutation locks. The provider must also
    // enforce this exact version at the write boundary; read-before-write alone
    // does not establish safety against concurrent external updates.
    const binding = this.provider.bindingId;
    if (typeof binding !== "string" || !/^[a-f0-9]{64}$/.test(binding)) throw new ControlError(503, "Trusted connector destination is unavailable.");
    const sourceVersion = await this.provider.source(p.connector);
    if (
      p.connector === "crm" &&
      (!sourceVersion || typeof sourceVersion !== "string")
    )
      throw new ControlError(503, "Trusted contact version is unavailable.");
    const scoped = { ...p.payload, ...(p.connector === "crm" && typeof sourceVersion === "string" ? { sourceVersion } : {}), binding };
    const request = preparedRequest(p.connector,scoped,this.provider.contactId ?? "1001",this.provider.recordScope);
    return this.inTransaction(actor, async (c) => {
      await this.authority(c, actor, ["agent", "operator"]);
      if (binding !== this.provider.bindingId) throw new ControlError(409, "Connector destination changed during preparation. Prepare fresh work.");
      const scopeGrant = this.provider.recordScope ? await currentScopeGrant(c,actor.orgId,p.agentId,this.provider) : null;
      if (this.provider.recordScope && !scopeGrant) throw new ControlError(403,"An active enrolled record grant is required for this agent.");
      const payload = {...scoped,request,...(scopeGrant?{scopeGrant}:{})};
      await enquirySource(c, actor.orgId, p.actionId, sourceVersion, binding, request, scopeGrant);
      await workflowProposal(c, actor.orgId, p);
      if (actor.role === "agent" && actor.subject !== p.agentId)
        throw new ControlError(403, "Agent identity must match the request.");
      const hash = tokenHash(JSON.stringify([p.agentId, p.connector, payload]));
      const old = (
        await c.query(
          "SELECT * FROM ll_connector_actions WHERE org_id=$1 AND id=$2",
          [actor.orgId, p.actionId],
        )
      ).rows[0];
      if (old) {
        if (!sameRequest(old))
          throw new ControlError(
            409,
            "Action ID already has a different request.",
          );
        return { ...old, lease_token: null };
      }
      const policy = (
        await c.query(
          "SELECT version FROM ll_connector_policies WHERE org_id=$1 AND connector=$2",
          [actor.orgId, p.connector],
        )
      ).rows[0];
      const a = (
        await c.query("SELECT * FROM ll_agents WHERE org_id=$1 AND id=$2", [
          actor.orgId,
          p.agentId,
        ])
      ).rows[0];
      if (
        !a ||
        !policy ||
        !(await this.valid(
          c,
          actor,
          {
            ...p,
            payload,
            agent_id: p.agentId,
            policy_version: policy.version,
          } as unknown as ConnectorAction,
          false,
        ))
      )
        throw new ControlError(
          403,
          "Required agent, connector permission or active policy is missing.",
        );
      if (a.reserved >= a.action_limit)
        throw new ControlError(403, "Agent action allowance is exhausted.");
      await c.query(
        "UPDATE ll_agents SET reserved=reserved+1 WHERE org_id=$1 AND id=$2",
        [actor.orgId, p.agentId],
      );
      const created = (
        await c.query(
          "INSERT INTO ll_connector_actions(org_id,id,agent_id,connector,payload,payload_hash,policy_version,state,reason,proposed_by) VALUES($1,$2,$3,$4,$5,$6,$7,'held','A different named operator must approve this exact request.',$8) RETURNING *",
          [
            actor.orgId,
            p.actionId,
            p.agentId,
            p.connector,
            JSON.stringify(payload),
            hash,
            policy.version,
            actor.subject,
          ],
        )
      ).rows[0];
      await this.event(c, actor, p.actionId, "held");
      return created as ConnectorAction;
    });
  }
  private async freshQuoteSource(step:QuoteStep) {
    return !(step==="message" && this.provider instanceof NativeQuoteMailConnector && (await this.provider.predecessor()).outcome==="verified");
  }
  /** Server-only exact saved-plan admission; never exposed by generic proposal parsing. */
  async proposeQuote(actor: Actor, planId: string, planHash: string, step: QuoteStep) {
    if (!this.quoteBoundary || this.quoteBoundary.db !== this.db) throw new ControlError(503,"Saved quote integration is not configured.");
    return this.inTransaction(actor,async c=>{
      await this.authority(c,actor,["operator"]);
      const fresh=await this.freshQuoteSource(step);
      const exact=await this.quoteBoundary!.current(c,actor,planId,planHash,step,fresh);
      if(actor.subject!==exact.plan.requester)throw new ControlError(403,"Only the saved quote requester may submit this step.");
      const candidate={id:exact.actionId,agent_id:exact.agentId,connector:exact.connector,payload:exact.payload,policy_version:exact.plan.policyVersion,proposed_by:actor.subject,approved_by:null} as ConnectorAction;
      const hash=quotePlanDigest([candidate.agent_id,candidate.connector,candidate.payload]);
      const old=(await c.query("SELECT * FROM ll_connector_actions WHERE org_id=$1 AND id=$2",[actor.orgId,candidate.id])).rows[0] as ConnectorAction|undefined;
      if(old){
        if(old.agent_id!==candidate.agent_id || old.connector!==candidate.connector || old.payload_hash!==hash || old.policy_version!==candidate.policy_version || old.proposed_by!==actor.subject || !isDeepStrictEqual(old.payload,candidate.payload))throw new ControlError(409,"Action ID already belongs to different saved work.");
        if(!(await this.valid(c,actor,old,false,fresh)))throw new ControlError(409,"Saved quote authority changed.");
        return {...old,lease_token:null};
      }
      // Before INSERT there is no membership snapshot. Existing INSERT trigger
      // captures requester/agent owner; saved quote authority is checked above.
      if(!(await this.valid(c,actor,{...candidate,id:undefined} as unknown as ConnectorAction,false,fresh)))throw new ControlError(403,"Exact quote agent, grant or current policy is missing.");
      const agent=(await c.query("SELECT reserved,action_limit FROM ll_agents WHERE org_id=$1 AND id=$2",[actor.orgId,candidate.agent_id])).rows[0];
      if(!agent || agent.reserved>=agent.action_limit)throw new ControlError(403,"Agent action allowance is exhausted.");
      await c.query("UPDATE ll_agents SET reserved=reserved+1 WHERE org_id=$1 AND id=$2",[actor.orgId,candidate.agent_id]);
      const created=(await c.query("INSERT INTO ll_connector_actions(org_id,id,agent_id,connector,payload,payload_hash,policy_version,state,reason,proposed_by) VALUES($1,$2,$3,$4,$5,$6,$7,'held','The designated independent manager must approve this exact quote request.',$8) RETURNING *",[actor.orgId,candidate.id,candidate.agent_id,candidate.connector,JSON.stringify(candidate.payload),hash,candidate.policy_version,actor.subject])).rows[0] as ConnectorAction;
      await this.event(c,actor,created.id,"held");return created;
    });
  }
  async review(actor: Actor, id: string, hash: string, approve: boolean) {
    return this.inTransaction(actor, async (c) => {
      await this.authority(c, actor, ["operator"]);
      const a = await this.get(c, actor, id);
      if (a.payload_hash !== hash)
        throw new ControlError(409, "Approval does not match the request.");
      const fresh = isQuoteAction(a) && "contract" in a.payload && a.payload.contract === "quote-step-1" ? await this.freshQuoteSource(a.payload.step) : true;
      if (isQuoteAction(a)) {
        if (!this.quoteBoundary) throw new ControlError(503,"Quote review is unavailable.");
        await this.quoteBoundary.reviewer(c,actor,a,fresh);
      }
      if (a.state !== "held") return { ...a, lease_token: null };
      if (!approve)
        return this.state(
          c,
          actor,
          a,
          "rejected",
          "Request rejected; no external action sent.",
        );
      if (a.proposed_by === actor.subject)
        throw new ControlError(
          403,
          "Independent approval by a different operator is required.",
        );
      if (!(await this.valid(c, actor, a, false,fresh)))
        return this.state(
          c,
          actor,
          a,
          "cancelled",
          "Agent, record grant or policy changed.",
        );
      if (!(await independentConnectorReviewer(c,actor.orgId,id,actor.subject))) throw new ControlError(403,"Independent approval by a different operator is required.");
      await c.query(
        "UPDATE ll_connector_actions SET approved_by=$3,approval_until=clock_timestamp()+interval '15 minutes' WHERE org_id=$1 AND id=$2",
        [actor.orgId, id, actor.subject],
      );
      return this.state(
        c,
        actor,
        await this.get(c, actor, id),
        "ready",
        "Exact request approved for 15 minutes.",
      );
    });
  }
  async execute(actor: Actor, id: string, loseResponse = false) {
    const claim = await this.inTransaction(actor, async (c) => {
      await this.authority(c, actor, ["operator", "worker"]);
      if (actor.role === "worker" && ["enquiry-runner", "enquiry-temporal", "quote-temporal"].includes(actor.subject)) await managedWorker(c, actor, id, true);
      const a = await this.get(c, actor, id);
      await dispatchOwnership(c, actor, id);
      if (
        a.state === "executing" &&
        a.lease_until &&
        new Date(a.lease_until).getTime() <= Date.now()
      )
        return this.state(
          c,
          actor,
          a,
          "uncertain",
          "Worker lease expired. Verify the outcome before any further action.",
        );
      if (a.state !== "ready") return { ...a, lease_token: null };
      if (isQuoteAction(a) && !(((a.connector === "quote" && this.provider instanceof NativeQuoteConnector) || (a.connector === "email" && this.provider instanceof NativeQuoteMailConnector)) && this.quoteBoundary?.policy)) throw new ControlError(503,"Quote provider dispatch is not enabled; the reviewed request remains held from execution.");
      if (isQuoteAction(a) && "contract" in a.payload && a.payload.contract === "quote-step-1") {
        // Fail before leasing when the independent pricing read is unavailable.
        try { await this.quoteBoundary!.current(c,actor,a.payload.planId,a.payload.planHash,a.payload.step,false); }
        catch (error) {
          if (!(error instanceof ControlError) || ![400,403,404,409].includes(error.status)) throw error;
          return this.state(c,actor,a,"cancelled","Quote pricing policy or authority changed before dispatch.");
        }
      }
      if (isQuoteAction(a) && !(await this.valid(c,actor,a,true,false))) return this.state(c,actor,a,"cancelled","Quote pricing policy or authority changed before dispatch.");
      await workflowDispatch(c, actor.orgId, id, this.provider, this.provider instanceof NativeQuoteMailConnector ? async predecessor =>
        await this.valid(c,actor,predecessor,true,false,(this.provider as NativeQuoteMailConnector).quote) && (await (this.provider as NativeQuoteMailConnector).predecessor()).outcome === "verified" : undefined);
      if (!(await this.valid(c, actor, a,true,!(this.provider instanceof NativeQuoteMailConnector))))
        return this.state(
          c,
          actor,
          a,
          "cancelled",
          "Authority or approval expired before dispatch.",
        );
      const lease = randomUUID();
      const r = (
        await c.query(
          "UPDATE ll_connector_actions SET state='executing',reason='Authorized request dispatched.',lease_token=$3,lease_until=clock_timestamp()+interval '30 seconds' WHERE org_id=$1 AND id=$2 RETURNING *",
          [actor.orgId, id, lease],
        )
      ).rows[0];
      await this.event(c, actor, id, "executing");
      return r as ConnectorAction;
    });
    if (!claim.lease_token) return claim;
    // No database lock is held across the network. A dispatched action can
    // finish after containment; cancellation cannot recall an external effect.
    let observed: Observation;
    try {
      observed = await this.provider.write(claim, loseResponse);
    } catch {
      observed = {
        outcome: "unknown",
        detail: "Provider response unavailable. No automatic retry.",
      };
    }
    return this.inTransaction(actor, async (c) => {
      await this.authority(c, actor, ["operator", "worker"]);
      if (actor.role === "worker" && ["enquiry-runner", "enquiry-temporal", "quote-temporal"].includes(actor.subject)) await managedWorker(c, actor, id, true);
      const a = await this.get(c, actor, id);
      if (a.lease_token !== claim.lease_token || a.state !== "executing")
        return { ...a, lease_token: null };
      if (
        !a.lease_until ||
        new Date(a.lease_until).getTime() <= Date.now() ||
        !(await this.valid(c, actor, a, true, false))
      )
        return this.state(
          c,
          actor,
          a,
          "uncertain",
          "Authority or lease changed after dispatch. Verify the external effect.",
          observed,
        );
      return this.observed(c, actor, a, observed);
    });
  }
  async observed(
    c: PoolClient,
    actor: Actor,
    a: ConnectorAction,
    o: Observation,
  ) {
    return this.state(
      c,
      actor,
      a,
      o.outcome === "verified"
        ? "succeeded"
        : o.outcome === "conflict"
          ? "conflict"
          : "uncertain",
      o.detail,
      o,
    );
  }
  async reconcile(actor: Actor, id: string) {
    const before = await this.inTransaction(actor, async (c) => {
      await this.authority(c, actor, ["operator", "worker"]);
      if (actor.role === "worker") await managedWorker(c, actor, id, true);
      const a = await this.get(c, actor, id);
      if (isQuoteAction(a) && !(((a.connector === "quote" && this.provider instanceof NativeQuoteConnector) || (a.connector === "email" && this.provider instanceof NativeQuoteMailConnector)) && this.quoteBoundary?.policy)) throw new ControlError(503,"Quote effect verification is not enabled; do not resend.");
      if (!["executing", "uncertain", "succeeded"].includes(a.state)) return { ...a, lease_token: null };
      if (isQuoteAction(a) ? !(await this.valid(c,actor,a,true,false)) : !bindingMatches(this.provider, a) || !requestMatches(this.provider,a) || !(await scopedGrantMatches(c,actor.orgId,a,this.provider))) return this.state(c, actor, a, "uncertain", "Saved request, record grant or destination changed. Restore the original reviewed contract before verifying the effect; do not resend.");
      if (
        a.state === "executing" &&
        a.lease_until &&
        new Date(a.lease_until).getTime() > Date.now()
      )
        throw new ControlError(409, "Wait for the active worker lease.");
      return { ...a, lease_token: null };
    });
    if (!["executing", "uncertain", "succeeded"].includes(before.state))
      return before;
    let o: Observation;
    try {
      if(this.provider instanceof NativeQuoteMailConnector) {
        const resolutionAllowed=await this.inTransaction(actor,async c=>{
          await this.authority(c,actor,actor.role === "worker" && actor.subject === "quote-temporal" ? ["worker"] : ["operator"]);
          if(actor.role === "worker")await managedWorker(c,actor,id,true);
          const current=await this.get(c,actor,id);
          return ["uncertain","succeeded"].includes(current.state) && await this.valid(c,actor,current,true,false);
        });
        if(resolutionAllowed)await this.provider.resolvePending(before);
      }
      o = await this.provider.inspect(before);
    } catch {
      o = {
        outcome: "unknown",
        detail: "Outcome evidence unavailable. Do not retry.",
      };
    }
    return this.inTransaction(actor, async (c) => {
      await this.authority(c, actor, ["operator", "worker"]);
      if (actor.role === "worker") await managedWorker(c, actor, id, true);
      const a = await this.get(c, actor, id);
      if (!["executing", "uncertain", "succeeded"].includes(a.state))
        return { ...a, lease_token: null };
      if (isQuoteAction(a) ? !(await this.valid(c,actor,a,true,false)) : !bindingMatches(this.provider, a) || !requestMatches(this.provider,a) || !(await scopedGrantMatches(c,actor.orgId,a,this.provider)) || !(await connectorMembershipCurrent(c,actor.orgId,a,true))) return this.state(c, actor, a, "uncertain", "Request, record grant or destination changed during effect verification. Do not resend.",o);
      return this.observed(c, actor, a, o);
    });
  }
  async read(actor: Actor, id: string) {
    return this.inTransaction(actor, async (c) => {
      await this.authority(c, actor, ["agent", "operator", "worker"]);
      if (actor.role === "worker" && ["enquiry-runner", "enquiry-temporal", "quote-temporal"].includes(actor.subject)) await managedWorker(c, actor, id, true);
      return { ...(await this.get(c, actor, id)), lease_token: null };
    });
  }
  async snapshot(actor: Actor) {
    return this.inTransaction(actor, async (c) => {
      await this.authority(c, actor, ["operator"]);
      return {
        policies: (
          await c.query(
            "SELECT connector,active,version FROM ll_connector_policies WHERE org_id=$1",
            [actor.orgId],
          )
        ).rows,
        actions: (
          await c.query(
            "SELECT * FROM ll_connector_actions WHERE org_id=$1 ORDER BY created_at DESC LIMIT 100",
            [actor.orgId],
          )
        ).rows.map((a) => ({ ...a, lease_token: null })),
        events: (
          await c.query(
            "SELECT * FROM ll_connector_events WHERE org_id=$1 ORDER BY id DESC LIMIT 100",
            [actor.orgId],
          )
        ).rows,
      };
    });
  }
  async contain(actor: Actor, connector: string) {
    if (!["crm", "email", "quote"].includes(connector))
      throw new ControlError(400, "Unknown connector.");
    return this.inTransaction(actor, async (c) => {
      await this.authority(c, actor, ["operator"]);
      await c.query(
        "UPDATE ll_connector_policies SET active=false,version=version+1 WHERE org_id=$1 AND connector=$2",
        [actor.orgId, connector],
      );
      const rows = (
        await c.query(
          "SELECT * FROM ll_connector_actions WHERE org_id=$1 AND connector=$2 AND state IN ('held','ready','executing')",
          [actor.orgId, connector],
        )
      ).rows;
      for (const a of rows)
        await this.state(
          c,
          actor,
          a,
          a.state === "executing" ? "uncertain" : "cancelled",
          "Connector contained. Dispatched effects require verification.",
        );
      await c.query(
        "INSERT INTO ll_events(org_id,kind,subject) VALUES($1,$2,$3)",
        [actor.orgId, `connector_${connector}_contained`, actor.subject],
      );
      return { contained: true };
    });
  }
  async enable(actor: Actor, connector: string) {
    if (!["crm", "email", "quote"].includes(connector))
      throw new ControlError(400, "Unknown connector.");
    return this.inTransaction(actor, async (c) => {
      await this.authority(c, actor, ["operator"]);
      await c.query(
        "UPDATE ll_connector_policies SET active=true,version=version+1 WHERE org_id=$1 AND connector=$2",
        [actor.orgId, connector],
      );
      await c.query(
        "INSERT INTO ll_events(org_id,kind,subject) VALUES($1,$2,$3)",
        [actor.orgId, `connector_${connector}_enabled`, actor.subject],
      );
      // Old approvals remain invalid. Enabling permits fresh proposals only.
      return { enabled: true };
    });
  }
}
