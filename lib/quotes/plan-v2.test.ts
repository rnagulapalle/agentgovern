import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { validateQuotePlan } from "./plan";
import { validateQuotePlanV2, assertBoundQuotePlanContract, type QuotePlanProposalV2, type QuotePlanContextV2 } from "./plan-v2";
import type { QuoteAuthoritySnapshot } from "./authority";
function v2Data(): {proposal:QuotePlanProposalV2;context:QuotePlanContextV2} {
 const q={id:"quote-42",distributorId:"distributor-7",recipient:"buyer@example.test",sourceVersion:"v3",currency:"USD" as const,subtotalMinor:100000,lines:[{id:"line-1",quantity:10,unitPriceMinor:10000}]};
 const a:QuoteAuthoritySnapshot={contract:"quote-authority-1",scopeId:randomUUID(),scopeVersion:1,workspaceId:"company-a",quoteId:q.id,distributorId:q.distributorId,recipient:q.recipient,sender:"sales@example.test",quoteBinding:"a".repeat(64),emailBinding:"b".repeat(64),member:"manager@example.test",policyVersion:3,grantVersion:1,capability:"quote.discount.approve",recoveryEpoch:randomUUID()};
 const action=randomUUID();return {
 proposal:{version:"distributor-quote-plan-2",planId:randomUUID(),workspaceId:a.workspaceId,requester:"owner@example.test",approver:a.member,policyVersion:3,quote:q,discountBps:1400,update:{actionId:action,agentId:"quote-agent"},message:{actionId:randomUUID(),agentId:"message-agent",dependsOn:action},authority:structuredClone(a)},
 context:{contract:"quote-plan-context-2",authority:structuredClone(a),pricing:{workspaceId:a.workspaceId,requester:"owner@example.test",quote:structuredClone(q),approvalGrants:[{member:a.member,workspaceId:a.workspaceId,quoteId:q.id,policyVersion:3,active:true,capability:"quote.discount.approve"}],policy:{version:3,delegatedBps:1000,hardCapBps:2000,active:true},agents:[{id:"quote-agent",workspaceId:a.workspaceId,active:true,quoteId:q.id,action:"quote.update"},{id:"message-agent",workspaceId:a.workspaceId,active:true,quoteId:q.id,action:"quote.message"}],provider:{workspaceId:a.workspaceId,quoteId:q.id,binding:a.quoteBinding,contract:"quote-conditional-write-1",atomicSourceVersion:true,actionIdIdempotency:true,effectReadback:true},email:{workspaceId:a.workspaceId,quoteId:q.id,from:a.sender,recipient:a.recipient,actionIdIdempotency:true,effectReadback:true}}}
 };
}
it("retains exact v1 prices/body while binding immutable quote/email authority",()=>{
 const {proposal:p,context:c}=v2Data(),plan=validateQuotePlanV2(p,c);const {authority:ignored,...v1}=p;void ignored;
 const legacy=validateQuotePlan({...v1,version:"distributor-quote-plan-1"},c.pricing);
 expect(plan.totalMinor).toBe(86000);expect(plan.update).toEqual(legacy.update);expect(plan.message.request.body).toEqual(legacy.message.request.body);
 expect(plan.message.request).toMatchObject({contract:"quote-email-request-1",binding:c.authority.emailBinding,workspaceId:p.workspaceId,quoteId:p.quote.id});
 expect(()=>assertBoundQuotePlanContract(plan)).not.toThrow();expect(()=>assertBoundQuotePlanContract(legacy)).toThrow("Historical");
 expect(Object.isFrozen(plan.authority)).toBe(true);expect(Object.isFrozen(plan.message.request.body)).toBe(true);
});
it.each(["scopeVersion","grantVersion","member","policyVersion","recoveryEpoch","emailBinding","quoteBinding","scopeId","workspaceId","quoteId","distributorId","recipient","sender","capability","contract"] as const)("changed %s cannot be rebound",key=>{
 const {proposal:p,context:c}=v2Data();const old=c.authority[key];(c.authority as unknown as Record<string,unknown>)[key]=typeof old==="number"?old+1:"changed";
 expect(()=>validateQuotePlanV2(p,c)).toThrow("current quote");
});
it.each([null,[],{},new Date(),{extra:true}])("malformed/absent authority and context default deny %j",value=>{
 const {proposal:p,context:c}=v2Data();expect(()=>validateQuotePlanV2({...p,authority:value},c)).toThrow();expect(()=>validateQuotePlanV2(p,{...c,authority:value})).toThrow();expect(()=>validateQuotePlanV2(p,value)).toThrow();
});
it("rejects accessor/symbol/prototype authority and proposals without evaluating getters",()=>{
 const {proposal:p,context:c}=v2Data();let touched=false;const bad={...p.authority};Object.defineProperty(bad,"member",{get(){touched=true;return p.approver;},enumerable:true});
 expect(()=>validateQuotePlanV2({...p,authority:bad},c)).toThrow();expect(touched).toBe(false);
 expect(()=>validateQuotePlanV2({...p,[Symbol("x")]:1},c)).toThrow();expect(()=>validateQuotePlanV2(Object.assign(Object.create(p),p),c)).toThrow();
 expect(()=>validateQuotePlanV2({...p,version:"distributor-quote-plan-1"},c)).toThrow();expect(()=>validateQuotePlanV2(p,{...c,contract:"other"})).toThrow();
});
it.each(["quoteId","distributorId","member","policyVersion","recipient","sender","quoteBinding"] as const)("matched authority %s still must correlate with quote/pricing",key=>{
 const {proposal:p,context:c}=v2Data();const value=key==="policyVersion"?4:key==="member"||key==="recipient"||key==="sender"?"other@example.test":key==="quoteBinding"?"c".repeat(64):"other";
 (p.authority as unknown as Record<string,unknown>)[key]=value;(c.authority as unknown as Record<string,unknown>)[key]=value;expect(()=>validateQuotePlanV2(p,c)).toThrow();
});
it.each([0,-1,1.5,2147483648,NaN])("invalid authority integer %s refuses",value=>{
 const {proposal:p,context:c}=v2Data();p.authority.grantVersion=value;c.authority.grantVersion=value;expect(()=>validateQuotePlanV2(p,c)).toThrow();
});
it("missing atomic provider proof and ambiguous money remain denied by retained validator",()=>{
 const {proposal:p,context:c}=v2Data();expect(()=>validateQuotePlanV2({...p,discountBps:2100},c)).toThrow();expect(()=>validateQuotePlanV2(p,{...c,pricing:{...c.pricing,provider:{...c.pricing.provider,atomicSourceVersion:false}}})).toThrow();
});
it.each(["binding","workspaceId","quoteId","contract"])("bound contract checker rejects mismatched email %s",key=>{
 const {proposal:p,context:c}=v2Data(),plan=structuredClone(validateQuotePlanV2(p,c));(plan.message.request as unknown as Record<string,unknown>)[key]="other";expect(()=>assertBoundQuotePlanContract(plan)).toThrow();
});
it("bound check rejects missing v2 and missing authority",()=>{expect(()=>assertBoundQuotePlanContract(null)).toThrow();expect(()=>assertBoundQuotePlanContract({version:"distributor-quote-plan-2"})).toThrow();});

it("bound correlation check refuses forged request/action/dependency metadata without implying execution readiness",()=>{
 const {proposal:p,context:c}=v2Data();
 for(const mutate of [
  (plan:ReturnType<typeof validateQuotePlanV2>)=>{plan.message.request.idempotencyKey=randomUUID();},
  (plan:ReturnType<typeof validateQuotePlanV2>)=>{plan.update.request.workspaceId="other";},
  (plan:ReturnType<typeof validateQuotePlanV2>)=>{plan.message.dependency.actionId=randomUUID();},
  (plan:ReturnType<typeof validateQuotePlanV2>)=>{plan.message.request.body.to=["other@example.test"];},
 ]){const plan=structuredClone(validateQuotePlanV2(p,c));mutate(plan);expect(()=>assertBoundQuotePlanContract(plan)).toThrow();}
 let touched=false;const bad={};Object.defineProperty(bad,"version",{get(){touched=true;return "distributor-quote-plan-2";}});expect(()=>assertBoundQuotePlanContract(bad)).toThrow();expect(touched).toBe(false);
});

it("real-domain canonical named member is distinct from test-only message destinations",()=>{
 const {proposal:p,context:c}=v2Data();p.requester="owner@company.example";p.approver="manager@company.example";p.authority.member=p.approver;c.authority.member=p.approver;c.pricing.requester=p.requester;c.pricing.approvalGrants[0].member=p.approver;
 expect(validateQuotePlanV2(p,c).approver).toBe(p.approver);
 for(const bad of ["Bad@company.example","bad","bad@company.example "]){const proposal=structuredClone(p),context=structuredClone(c);proposal.authority.member=bad;context.authority.member=bad;expect(()=>validateQuotePlanV2(proposal,context)).toThrow();}
 for(const field of ["sender","recipient"] as const){const proposal=structuredClone(p),context=structuredClone(c);proposal.authority[field]="person@company.example";context.authority[field]="person@company.example";expect(()=>validateQuotePlanV2(proposal,context)).toThrow();}
});
