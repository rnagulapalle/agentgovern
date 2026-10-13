import type { Pool } from "pg";
import type { Actor } from "../../lib/durable/contracts";
import { ControlError } from "../../lib/durable/contracts";
import { transaction } from "../../lib/durable/database";
import { managedQuoteWorker } from "../../lib/quotes/background";
import type { QuotePlanV2 } from "../../lib/quotes/plan-v2";
import type { WorkflowControl } from "../../lib/workflows/service";
import { assertQuoteRunContract, type QuoteRunContract, type QuoteActivities, type QuoteProgress } from "../../lib/orchestration/quote-contract";
import { isDeepStrictEqual } from "node:util";
// Server-owned composition receives persisted plan only, never credentials/URLs
// from history. Existing connector boundaries retain all delayed authority checks.
export function quoteActivities(db:Pool,actor:Actor,buildId:string,factory:(plan:Readonly<QuotePlanV2>)=>Promise<WorkflowControl>):QuoteActivities {
 return {async advanceQuoteContract(input:QuoteRunContract):Promise<QuoteProgress>{
  assertQuoteRunContract(input);
  if(buildId!==input.workerBuildId)throw new ControlError(409,"Exact pinned quote worker build required.");
  const plan=await transaction(db,actor.orgId,async c=>{
   const r=await managedQuoteWorker(c,actor,input.planId,"plan");
   if(!isDeepStrictEqual(r.contract,input))throw new ControlError(409,"Quote history differs from immutable dispatch.");
   return Object.freeze(structuredClone(r.plan)) as Readonly<QuotePlanV2>;
  });
  const workflows=await factory(plan);
  if(workflows.db!==db || workflows.connectors.db!==db || workflows.quotes?.authority.db!==db)throw new ControlError(503,"Quote worker controls must use its exact installed pool.");
  // Existing-only factory may await read-only configuration/source checks. It must never provision or enroll. Revalidate identity/route afterwards.
  await transaction(db,actor.orgId,c=>managedQuoteWorker(c,actor,input.planId,"plan"));
  const run=await workflows.read(actor,input.runId);
  if(run.state!=="active")return "contained";
  if(run.steps.length!==2 || run.steps[0].action_id!==input.updateActionId || run.steps[1].action_id!==input.messageActionId)throw new ControlError(409,"Exact two-step quote graph required.");
  for(let i=0;i<run.steps.length;i++){
   const control=i===0?workflows.connectors:workflows.quotes?.message;
   if(!control || control.db!==db)throw new ControlError(503,"Exact quote message control is required.");
   const step=await control.read(actor,run.steps[i].action_id);
   if(["blocked","conflict","rejected","cancelled","recovered"].includes(step.state))return "contained";
   if(step.state==="held")return i===1?"awaiting-message-approval":"waiting";
   if(step.state==="ready")await control.execute(actor,step.id);
   else if(["uncertain","executing","succeeded"].includes(step.state))await control.reconcile(actor,step.id);
   const current=await control.read(actor,step.id);
   if(["blocked","conflict","rejected","cancelled","recovered"].includes(current.state))return "contained";
   if(current.state!=="succeeded")return "waiting";
  }
  // Do not call verify: the named final review is a separate human operation.
  return "awaiting-named-verification";
 }};
}
