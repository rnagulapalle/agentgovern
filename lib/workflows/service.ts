import { NativeQuoteConnector } from '../connectors/native-quote';
import { NativeQuoteMailConnector } from '../connectors/native-quote-mail';
import { nativeMailIdentity } from '../quotes/native-email-transport';
import { quoteRequestIdentity } from '../quotes/effect';
import { createQuoteVerificationReceipt,parseQuoteVerificationReceipt,type QuoteVerificationView } from '../quotes/verification-receipt';
import type { ConnectorAction } from '../connectors/contracts';
import { quoteWorkflowView } from "../quotes/workflow-view";
import { isDeepStrictEqual } from "node:util";
import type { QuoteAuthorityControl } from "../quotes/authority";
import type { QuoteContextLoader } from "../quotes/store";
import { quotePlanDigest } from "../quotes/digest";
import { validateQuotePlanV2, assertBoundQuotePlanContract, type QuotePlanV2 } from "../quotes/plan-v2";
import { reviewedMessageV2, type ReviewedMessageV2 } from "../connectors/content";
import { sameRequestSnapshot } from "../connectors/request";
import { managedWorker } from "../enquiries/dispatch";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { transaction } from "../durable/database";
import { authorize } from "../durable/service";
import { ControlError, type Actor } from "../durable/contracts";
import { ConnectorControl } from "../connectors/service";
import { preparedRequest, requestForDisplay } from "../connectors/request";
export class WorkflowControl {
  constructor(
    readonly db: Pool,
    readonly connectors: ConnectorControl,
    readonly quotes?: { authority: QuoteAuthorityControl; loadContext: QuoteContextLoader; message?: ConnectorControl },
  ) {}
  async create(
    actor: Actor,
    crmAgent: string,
    emailAgent: string,
    runId: string,
    lifecycle: "lead" | "customer" = "customer",
    client?: PoolClient,
    emailContent?: ReviewedMessageV2,
  ) {
    const emailPayload = emailContent ? {template:"reviewed_acknowledgement_v2" as const,...reviewedMessageV2(emailContent)} : {template:"case_received" as const};
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
          "SELECT id,COALESCE(to_jsonb(r)->>'workflow_kind','customer-acknowledgement') AS workflow_kind,COALESCE((to_jsonb(r)->>'workflow_version')::integer,1) AS workflow_version FROM ll_workflow_runs r WHERE org_id=$1 AND id=$2",
          [actor.orgId, runId],
        )
      ).rows[0];
      if (existing) {
        if (existing.workflow_kind !== "customer-acknowledgement" || existing.workflow_version !== 1) throw new ControlError(409, "Workflow ID already belongs to a different plan.");
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
          steps[0].payload.lifecycle !== lifecycle || !sameRequestSnapshot(steps[1].payload,emailPayload)
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
        [2, emailAgent, "email", emailPayload],
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
  /** Creation only. Saved quote plans never authorize connector execution. */
  async createQuote(actor: Actor, planId: string): Promise<string> {
    if (typeof planId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(planId))
      throw new ControlError(400,"Choose an exact saved quote plan.");
    const quotes = this.quotes;
    if (!quotes || quotes.authority.db !== this.db) throw new ControlError(503,"Current server-owned quote authority and source are required.");
    return transaction(this.db, actor.orgId, async c => {
      await this.connectors.authority(c, actor, ["operator"]);
      const row = (await c.query("SELECT * FROM ll_quote_plans WHERE org_id=$1 AND id=$2 AND created_by=$3",[actor.orgId,planId,actor.subject])).rows[0];
      if (!row) throw new ControlError(404,"Saved quote plan not found.");
      assertBoundQuotePlanContract(row.plan);
      if (!await quotes.authority.currentSavedPlanAuthority(actor,planId,c)) throw new ControlError(409,"Saved quote authority changed. Prepare fresh work.");
      const context = await quotes.loadContext(c,actor,Object.freeze({quoteId:row.plan.quote.id,distributorId:row.plan.quote.distributorId}));
      const validated = validateQuotePlanV2(row.proposal,context);
      if (!isDeepStrictEqual(validated,row.plan) || quotePlanDigest(validated)!==row.plan_hash)
        throw new ControlError(409,"Quote source, pricing or exact plan changed. Prepare fresh work.");
      // Loader may await provider reads; named identity and authority must still be current afterwards.
      await this.connectors.authority(c,actor,["operator"]);
      if (!await quotes.authority.currentSavedPlanAuthority(actor,planId,c)) throw new ControlError(409,"Saved quote authority changed. Prepare fresh work.");
      const parts = [
        {ordinal:1,actionId:validated.update.actionId,agentId:validated.update.agentId,connector:"quote",step:"update",request:validated.update.request,dependency:null},
        {ordinal:2,actionId:validated.message.actionId,agentId:validated.message.agentId,connector:"email",step:"message",request:validated.message.request,dependency:validated.update.actionId},
      ] as const;
      for (const part of parts) {
        const active = (await c.query("SELECT 1 FROM ll_agents a JOIN ll_agent_profiles p ON p.org_id=a.org_id AND p.agent_id=a.id JOIN ll_members m ON m.email=p.owner AND m.org_id=a.org_id AND m.active=true WHERE a.org_id=$1 AND a.id=$2 AND a.active=true AND $3=ANY(a.tools) AND p.owner=$4 AND p.connector=$5 AND EXISTS(SELECT 1 FROM ll_tokens t WHERE t.org_id=a.org_id AND t.subject=a.id AND t.role='agent' AND t.active=true)",[actor.orgId,part.agentId,`twin.${part.connector}`,validated.requester,`${part.connector}_twin`])).rows.length;
        if (!active) throw new ControlError(403,"Current owned scoped quote and messaging agents required.");
      }
      const payload = (part:typeof parts[number]) => ({contract:"quote-step-1",planId,planHash:row.plan_hash,step:part.step,quoteRequest:part.request,binding:part.request.binding});
      const old=(await c.query("SELECT * FROM ll_workflow_runs WHERE org_id=$1 AND id=$2",[actor.orgId,planId])).rows[0];
      if (old) {
        const steps=(await c.query("SELECT * FROM ll_workflow_steps WHERE org_id=$1 AND run_id=$2 ORDER BY ordinal",[actor.orgId,planId])).rows;
        if (old.workflow_kind!=="distributor-quote" || old.workflow_version!==1 || old.quote_plan_id!==planId || old.quote_plan_hash!==row.plan_hash || old.created_by!==actor.subject || steps.length!==2 ||
          parts.some((part,index)=>steps[index].action_id!==part.actionId || steps[index].agent_id!==part.agentId || steps[index].connector!==part.connector || steps[index].dependency_action_id!==part.dependency || !isDeepStrictEqual(steps[index].payload,payload(part))))
          throw new ControlError(409,"Workflow ID already belongs to a different exact quote graph.");
        return planId;
      }
      const ids=[planId,...parts.map(p=>p.actionId)];
      const collision=(await c.query("SELECT 1 FROM ll_workflow_runs WHERE org_id=$1 AND id=ANY($2::uuid[]) UNION ALL SELECT 1 FROM ll_workflow_steps WHERE org_id=$1 AND (run_id=ANY($2::uuid[]) OR action_id=ANY($2::uuid[])) UNION ALL SELECT 1 FROM ll_connector_actions WHERE org_id=$1 AND id=ANY($2::uuid[])",[actor.orgId,ids])).rows.length;
      if (collision) throw new ControlError(409,"Quote graph identities already belong to existing work.");
      await c.query("INSERT INTO ll_workflow_runs(org_id,id,created_by,workflow_kind,workflow_version,quote_plan_id,quote_plan_hash) VALUES($1,$2,$3,'distributor-quote',1,$2,$4)",[actor.orgId,planId,actor.subject,row.plan_hash]);
      for (const part of parts) {
        await c.query("INSERT INTO ll_workflow_agents(org_id,agent_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[actor.orgId,part.agentId]);
        await c.query("INSERT INTO ll_workflow_steps(org_id,run_id,ordinal,action_id,agent_id,connector,payload,dependency_action_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[actor.orgId,planId,part.ordinal,part.actionId,part.agentId,part.connector,JSON.stringify(payload(part)),part.dependency]);
      }
      await c.query("INSERT INTO ll_workflow_events(org_id,run_id,kind,subject) VALUES($1,$2,'created',$3)",[actor.orgId,planId,actor.subject]);
      return planId;
    });
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
      if (actor.role === "worker" && ["enquiry-runner", "enquiry-temporal", "quote-temporal"].includes(actor.subject)) await managedWorker(c, actor, id);
      const run = (
        await c.query(
          "SELECT * FROM ll_workflow_runs WHERE org_id=$1 AND id=$2",
          [actor.orgId, id],
        )
      ).rows[0];
      if (run?.workflow_kind === "distributor-quote") {
        const quotes=this.quotes;
        if(actor.role!=="operator" && !(actor.role==="worker" && actor.subject==="quote-temporal"))throw new ControlError(403,"A current named quote owner or exact bound quote workload is required.");
        if(!quotes || quotes.authority.db!==this.db)throw new ControlError(503,"Server-owned quote review authority is required.");
        if(!await quotes.authority.currentSavedPlanAuthority(actor,run.quote_plan_id,c))throw new ControlError(409,"Saved quote review authority changed. Prepare fresh bound work.");
        const row=(await c.query("SELECT * FROM ll_quote_plans WHERE org_id=$1 AND id=$2",[actor.orgId,run.quote_plan_id])).rows[0];
        const plan=row?.plan;assertBoundQuotePlanContract(plan);
        if(run.workflow_version!==1 || run.quote_plan_id!==run.id || run.quote_plan_hash!==row.plan_hash || run.created_by!==row.created_by || quotePlanDigest(plan)!==row.plan_hash)
          throw new ControlError(409,"Exact saved quote graph could not be verified.");
        const steps=(await c.query("SELECT s.*,a.state,a.approved_by,a.approval_until,a.evidence,a.payload AS approved_payload FROM ll_workflow_steps s LEFT JOIN ll_connector_actions a ON a.org_id=s.org_id AND a.id=s.action_id WHERE s.org_id=$1 AND s.run_id=$2 ORDER BY s.ordinal",[actor.orgId,id])).rows;
        this.assertQuoteGraph(plan,row.plan_hash,steps);
        return {...run,quoteView:quoteWorkflowView(plan,row.plan_hash,steps),steps:steps.map(s=>({...s,proposedRequest:null}))};
      }
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
            : steps.map(s => {
                const request = s.approved_payload ? requestForDisplay({...s,payload:s.approved_payload}) : preparedRequest(s.connector,s.payload,this.connectors.provider.contactId ?? "1001",this.connectors.provider.recordScope);
                return { ...s, proposedRequest: request ? {method:request.method,resource:s.connector === "crm" ? `CRM contact ${request.resource.split("/").at(-1)}` : "Email acknowledgement",body:request.body,approvedSourceVersion:request.sourceVersion,requestVersion:request.version} : null };
              }),
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
  private assertQuoteGraph(plan:QuotePlanV2,planHash:string,steps:readonly {ordinal:number;action_id:string;agent_id:string;connector:string;dependency_action_id:string|null;payload:unknown}[]){
    const parts=[{ordinal:1,part:plan.update,connector:"quote",step:"update",dependency:null},{ordinal:2,part:plan.message,connector:"email",step:"message",dependency:plan.update.actionId}];
    if(steps.length!==2 || parts.some((p,i)=>{
      const expected={contract:"quote-step-1",planId:plan.planId,planHash:planHash,step:p.step,quoteRequest:p.part.request,binding:p.part.request.binding};
      return steps[i].ordinal!==p.ordinal || steps[i].action_id!==p.part.actionId || steps[i].agent_id!==p.part.agentId || steps[i].connector!==p.connector || steps[i].dependency_action_id!==p.dependency || !isDeepStrictEqual(steps[i].payload,expected);
    }))throw new ControlError(409,"Exact saved quote steps and dependency could not be verified.");
  }
  private async quoteVerificationContext(c:PoolClient,actor:Actor,id:string){
    await this.connectors.authority(c,actor,['operator']);
    const quotes=this.quotes;
    if(!quotes||quotes.authority.db!==this.db||!quotes.message||quotes.message.db!==this.db||quotes.message.quoteBoundary!==this.connectors.quoteBoundary)
      throw new ControlError(503,'Exact quote verification authority unavailable.');
    const row=(await c.query("SELECT p.*,r.state AS run_state,r.workflow_kind,r.workflow_version,r.quote_plan_hash,r.quote_plan_id,r.id AS run_id,r.created_by AS run_creator FROM ll_quote_plans p JOIN ll_workflow_runs r ON r.org_id=p.org_id AND r.id=p.id WHERE p.org_id=$1 AND p.id=$2",[actor.orgId,id])).rows[0];
    if(!row||row.workflow_kind!=='distributor-quote'||row.workflow_version!==1||row.quote_plan_hash!==row.plan_hash||row.quote_plan_id!==row.id||row.run_id!==row.id||row.run_creator!==row.created_by||![row.created_by,row.plan?.approver].includes(actor.subject))
      throw new ControlError(403,'A current named quote owner or designated manager is required.');
    assertBoundQuotePlanContract(row.plan);const plan=row.plan;
    if(quotePlanDigest(plan)!==row.plan_hash)throw new ControlError(409,'Exact saved quote plan is unavailable.');
    const graphSteps=(await c.query("SELECT * FROM ll_workflow_steps WHERE org_id=$1 AND run_id=$2 ORDER BY ordinal",[actor.orgId,id])).rows;
    this.assertQuoteGraph(plan,row.plan_hash,graphSteps);
    const actions=(await c.query("SELECT s.ordinal,a.* FROM ll_workflow_steps s JOIN ll_connector_actions a ON a.org_id=s.org_id AND a.id=s.action_id WHERE s.org_id=$1 AND s.run_id=$2 ORDER BY s.ordinal",[actor.orgId,id])).rows as (ConnectorAction&{ordinal:number})[];
    const historicalRow=(await c.query("SELECT quote_verification FROM ll_workflow_events WHERE org_id=$1 AND run_id=$2 AND quote_verification IS NOT NULL",[actor.orgId,id])).rows;
    if(historicalRow.length>1)throw new ControlError(409,'Retained quote verification is ambiguous.');
    const historical=historicalRow.length?parseQuoteVerificationReceipt(historicalRow[0].quote_verification):null;
    if(historical&&(historical.workspaceId!==actor.orgId||historical.runId!==id||historical.planHash!==row.plan_hash||historical.quoteId!==plan.quote.id||historical.recoveryEpoch!==row.recovery_epoch||![plan.requester,plan.approver].includes(historical.verifiedBy)||historical.steps.some((step,i)=>{const part=i===0?plan.update:plan.message;return step.actionId!==part.actionId||step.binding!==part.request.binding||step.requestIdentity!==(i===0?quoteRequestIdentity(part.request):nativeMailIdentity(part.request))||actions[i]?.payload_hash!==step.payloadHash;})))
      throw new ControlError(409,'Retained quote verification differs from the exact saved work.');
    return {plan,row,actions,historical,quotes};
  }
  private async quoteVerificationAuthority(c:PoolClient,actor:Actor,context:Awaited<ReturnType<WorkflowControl['quoteVerificationContext']>>){
    const {actions,quotes,plan}=context;
    if(!['active','completed'].includes(context.row.run_state)||actions.length!==2||actions[0].ordinal!==1||actions[1].ordinal!==2||actions[0].id!==plan.update.actionId||actions[1].id!==plan.message.actionId||actions[0].connector!=='quote'||actions[1].connector!=='email'||actions.some(a=>a.state!=='succeeded')||!await quotes.authority.currentSavedPlanAuthority(actor,plan.planId,c))return false;
    for(const a of actions){const control=a.connector==='quote'?this.connectors:quotes.message!;if(!await control.valid(c,actor,a,true,false))return false;}
    return true;
  }
  private async observedQuoteVerification(actor:Actor,id:string){
    const before=await transaction(this.db,actor.orgId,async c=>{const context=await this.quoteVerificationContext(c,actor,id);return {...context,authorized:await this.quoteVerificationAuthority(c,actor,context)};});
    if(!before.authorized)return {context:before,outcome:!['active','completed'].includes(before.row.run_state)||before.actions.some(a=>['conflict','cancelled','rejected'].includes(a.state))||before.actions.length===2&&before.actions.every(a=>a.state==='succeeded')?'conflict' as const:'unknown' as const};
    const quote=this.connectors.provider,mail=before.quotes.message!.provider;
    if(!(quote instanceof NativeQuoteConnector)||!(mail instanceof NativeQuoteMailConnector)||mail.quote!==quote||!mail.matchesPlan(before.plan))return {context:before,outcome:'unknown' as const};
    let q:Awaited<ReturnType<NativeQuoteConnector['verificationEvidence']>>,m:Awaited<ReturnType<NativeQuoteMailConnector['verificationEvidence']>>;
    try{q=await quote.verificationEvidence(before.actions[0]);m=await mail.verificationEvidence(before.actions[1]);}catch{q={observation:{outcome:'unknown',detail:'Current quote observation unavailable.'}};m={observation:{outcome:'unknown',detail:'Current simulated acceptance unavailable.'}};}
    const outcome=q.observation.outcome==='conflict'||m.observation.outcome==='conflict'?'conflict':q.observation.outcome==='verified'&&m.observation.outcome==='verified'&&q.effectDigest&&q.sourceAfter&&m.effectDigest?'verified':'unknown';
    const after=await transaction(this.db,actor.orgId,async c=>{const context=await this.quoteVerificationContext(c,actor,id);return {...context,authorized:await this.quoteVerificationAuthority(c,actor,context)};});
    if(!after.authorized||after.row.plan_hash!==before.row.plan_hash||after.actions.some((a,i)=>a.payload_hash!==before.actions[i].payload_hash||[q,m][i].observation.outcome==='verified'&&(a.evidence as {reference?:string}|null)?.reference!==[q,m][i].observation.reference))return {context:after,outcome:'conflict' as const};
    return {context:after,outcome:outcome as 'verified'|'conflict'|'unknown',quote:q,message:m};
  }
  /** Historical record plus a fresh GET-only check. No recovery POST, resend,
   * approval or execution occurs here; absent historical evidence stays absent. */
  async quoteVerification(actor:Actor,id:string):Promise<QuoteVerificationView>{
    const observed=await this.observedQuoteVerification(actor,id),historical=observed.context.historical;
    let outcome=observed.outcome;
    if(outcome==='verified'&&!historical)outcome='unknown';
    if(outcome==='verified'&&historical&&(historical.steps[0].effectDigest!==observed.quote?.effectDigest||historical.steps[1].effectDigest!==observed.message?.effectDigest||historical.steps[0].sourceAfter!==observed.quote?.sourceAfter))outcome='conflict';
    return {historical,current:{outcome,checkedAt:new Date().toISOString(),detail:outcome==='verified'?'Current quote and simulated message acceptance match the retained verification. This does not establish delivery.':outcome==='conflict'?'Current authority or provider state changed; historical verification does not authorize further work.':'Current correlated evidence or retained final verification is unavailable; keep work held.'}};
  }
  private async verifyQuote(actor:Actor,id:string,run:Awaited<ReturnType<WorkflowControl['read']>>){
    const prior=await transaction(this.db,actor.orgId,c=>this.quoteVerificationContext(c,actor,id));
    if(prior.historical){const view=await this.quoteVerification(actor,id);if(view.current.outcome!=='verified')throw new ControlError(409,'Historical quote verification is retained; current work stays contained.');return {verified:true,receipt:prior.historical};}
    if(run.state!=='active')throw new ControlError(409,'An old completion state is not a retained quote verification.');
    for(const step of run.steps){if(!['succeeded','uncertain','executing'].includes(step.state??''))throw new ControlError(409,'Every exact quote step must execute before verification.');await (step.connector==='quote'?this.connectors:this.quotes!.message!).reconcile(actor,step.action_id);}
    const observed=await this.observedQuoteVerification(actor,id);
    if(observed.outcome!=='verified'||!observed.quote?.effectDigest||!observed.quote.sourceAfter||!observed.message?.effectDigest)throw new ControlError(409,'Current quote or message evidence is unavailable or conflicting.');
    return transaction(this.db,actor.orgId,async c=>{
      const context=await this.quoteVerificationContext(c,actor,id);
      if(!await this.quoteVerificationAuthority(c,actor,context)||context.actions.some((a,i)=>a.payload_hash!==observed.context.actions[i].payload_hash))throw new ControlError(409,'Current quote authority changed; completion stays held.');
      if(context.historical){if(context.historical.steps[0].effectDigest!==observed.quote!.effectDigest||context.historical.steps[1].effectDigest!==observed.message!.effectDigest||context.historical.steps[0].sourceAfter!==observed.quote!.sourceAfter)throw new ControlError(409,'Concurrent retained verification differs from current effects.');return {verified:true,receipt:context.historical};}
      if(context.row.run_state!=='active')throw new ControlError(409,'A current active exact quote run is required.');
      const verifiedAt=(await c.query('SELECT now() AS at')).rows[0].at.toISOString();
      const receipt=createQuoteVerificationReceipt({workspaceId:actor.orgId,runId:id,planHash:context.row.plan_hash,quoteId:context.plan.quote.id,recoveryEpoch:context.row.recovery_epoch,verifiedBy:actor.subject,verifiedAt,steps:[{ordinal:1,actionId:context.plan.update.actionId,binding:context.plan.update.request.binding,requestIdentity:quoteRequestIdentity(context.plan.update.request)!,payloadHash:context.actions[0].payload_hash,effectDigest:observed.quote!.effectDigest!,providerReference:observed.quote!.observation.reference!,sourceAfter:observed.quote!.sourceAfter!},{ordinal:2,actionId:context.plan.message.actionId,binding:context.plan.message.request.binding,requestIdentity:nativeMailIdentity(context.plan.message.request)!,payloadHash:context.actions[1].payload_hash,effectDigest:observed.message!.effectDigest!,providerReference:observed.message!.observation.reference!,sourceAfter:null}]});
      await c.query("UPDATE ll_workflow_runs SET state='completed' WHERE org_id=$1 AND id=$2",[actor.orgId,id]);
      await c.query("INSERT INTO ll_workflow_events(org_id,run_id,kind,subject,at,quote_verification) VALUES($1,$2,'verified',$3,$4,$5)",[actor.orgId,id,actor.subject,verifiedAt,receipt]);
      return {verified:true,receipt};
    });
  }
  async verify(actor: Actor, id: string) {
    if(actor.role==="worker" && actor.subject==="quote-temporal")throw new ControlError(403,"Quote completion requires independent named final verification.");
    const run = await this.read(actor, id);
    if (actor.role !== "operator" && actor.role !== "worker") throw new ControlError(403, "A named operator must verify the run.");
    if(run.workflow_kind === "distributor-quote")return this.verifyQuote(actor,id,run);
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
      const control=run.workflow_kind === "distributor-quote" && step.connector === "email" ? this.quotes?.message : this.connectors;
      if(!control||control.db!==this.db||control.quoteBoundary!==this.connectors.quoteBoundary&&run.workflow_kind==="distributor-quote")throw new ControlError(503,"Exact quote message verification is unavailable.");
      await control.reconcile(actor, step.action_id);
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
      for (const a of steps) {
        const control=run.workflow_kind === "distributor-quote" && a.connector === "email" ? this.quotes?.message : this.connectors;
        if (!control || !(await control.valid(c, actor, a, run.workflow_kind === "distributor-quote", run.workflow_kind !== "distributor-quote")))
          throw new ControlError(
            409,
            "Authority changed. Workflow completion is held.",
          );
      }
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
