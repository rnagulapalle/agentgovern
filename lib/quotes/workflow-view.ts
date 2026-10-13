import { assertBoundQuotePlanContract, type QuotePlanV2 } from "./plan-v2";
export interface QuoteWorkflowStepView {
  ordinal:number; title:string; status:string; state:string|null;
  actionId:string; approvedBy:string|null; evidenceReference:string|null;
}
export interface QuoteWorkflowView {
  contract:"quote-workflow-view-1"; planId:string; planHash:string;
  quoteId:string; distributorId:string; currency:"USD"; subtotalMinor:number; totalMinor:number;
  discountBps:number; delegatedBps:number; hardCapBps:number; manager:string;
  customer:string; subject:string; message:string; sourceVersion:string;
  completion:"not-established"; steps:QuoteWorkflowStepView[];
}
export interface QuoteWorkflowObservation {
  ordinal:number; action_id:string; state:string|null; approved_by:string|null;
  evidence?:{outcome?:string;reference?:string}|null;
}
/** Saved business snapshot only. Action states and recorded observations never
 * establish a fresh provider readback or final workflow verification here. */
export function quoteWorkflowView(plan:QuotePlanV2,planHash:string,steps:QuoteWorkflowObservation[]):QuoteWorkflowView {
  assertBoundQuotePlanContract(plan);
  const status=(step:QuoteWorkflowObservation)=>{
    if(step.state==="uncertain" || step.state==="executing")return "Outcome awaiting verification";
    if(["conflict","rejected","cancelled"].includes(step.state??""))return "Needs review; dependent work stays held";
    if(step.state==="succeeded")return step.ordinal===1?"Quote effect recorded; current verification required":"Message acceptance recorded; final verification pending";
    if(step.state==="ready")return step.ordinal===1?"Exact approval recorded; execution checks pending":"Exact approval recorded; waiting for verified quote";
    if(step.state===null || step.state==="held")return step.ordinal===1?"Manager approval required":"Waiting for verified quote and separate approval";
    return "Status unavailable; execution stays held";
  };
  return {contract:"quote-workflow-view-1",planId:plan.planId,planHash,quoteId:plan.quote.id,
    distributorId:plan.quote.distributorId,currency:plan.quote.currency,subtotalMinor:plan.quote.subtotalMinor,
    totalMinor:plan.totalMinor,discountBps:plan.discountBps,delegatedBps:plan.policy.delegatedBps,hardCapBps:plan.policy.hardCapBps,
    manager:plan.approver,customer:plan.quote.recipient,subject:plan.message.request.body.subject,message:plan.message.request.body.text,
    sourceVersion:plan.quote.sourceVersion,completion:"not-established",steps:steps.map(step=>({ordinal:step.ordinal,
      title:step.ordinal===1?"Update distributor quote":"Send customer confirmation",status:status(step),state:step.state,
      actionId:step.action_id,approvedBy:step.approved_by,evidenceReference:typeof step.evidence?.reference==="string"?step.evidence.reference:null}))};
}
