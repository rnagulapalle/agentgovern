import {QuoteTransactionContext} from '../quotes/transaction-context';
import { NativeQuoteMailConnector } from "./native-quote-mail";
import { isDeepStrictEqual } from 'node:util';
import type { Pool, PoolClient } from 'pg';
import { ControlError, type Actor } from '../durable/contracts';
import { QuoteAuthorityControl } from '../quotes/authority';
import { quotePlanDigest } from '../quotes/digest';
import { assertBoundQuotePlanContract, validateQuotePlanV2, type QuotePlanV2 } from '../quotes/plan-v2';
import type { ScopeGrantSnapshot } from './scopes';
import type { ConnectorAction, ConnectorProvider } from './contracts';
export type QuoteStep = 'update' | 'message';
export interface QuoteStepPayload {
 contract:'quote-step-1'; planId:string; planHash:string; step:QuoteStep;
 quoteRequest:QuotePlanV2['update']['request'] | QuotePlanV2['message']['request'];
 binding:string;
}
class QuotePolicyUnavailable extends ControlError { constructor(message:string){super(503,message);} }
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isQuoteAction(a:Pick<ConnectorAction,'connector'|'payload'>) {
 return a.connector==='quote' || !!a.payload && 'contract' in a.payload && a.payload.contract==='quote-step-1';
}
/** Trusted server loader must independently read current source/pricing; supplied
 * capability declarations do not establish provider execution conformance. */
/** Fresh trusted pricing metadata, independent of mutable quote readback. */
export type CurrentQuotePolicy=(client:PoolClient,actor:Actor,reference:Readonly<{workspaceId:string;quoteId:string;policyVersion:number}>)=>Promise<unknown>;
export type CurrentQuoteContext=(client:PoolClient,actor:Actor,plan:Readonly<QuotePlanV2>)=>Promise<unknown>;
/** Admission/review integration only. No provider dispatch is enabled here. */
export class QuoteActionBoundary {
 constructor(readonly db:Pool,readonly authority:QuoteAuthorityControl,readonly context:CurrentQuoteContext,readonly policy?:CurrentQuotePolicy,readonly transactionContext?:QuoteTransactionContext){
  if(transactionContext&&(!(transactionContext instanceof QuoteTransactionContext)||transactionContext.pool!==db))throw new ControlError(503,'Exact installed quote callback context required.');
  if(authority.db!==db)throw new ControlError(503,'Quote authority must use the same installed service pool.');
 }
 async current(c:PoolClient,actor:Actor,planId:string,planHash:string,step:QuoteStep,freshSource=true){
  if(!uuid.test(planId)|| !/^[a-f0-9]{64}$/.test(planHash)|| !['update','message'].includes(step))throw new ControlError(400,'Exact saved quote plan and step required.');
  const authority=await this.authority.currentSavedPlanAuthority(actor,planId,c);
  if(!authority)throw new ControlError(409,'Saved quote authority changed.');
  const row=(await c.query('SELECT * FROM ll_quote_plans WHERE org_id=$1 AND id=$2',[actor.orgId,planId])).rows[0];
  const plan=row?.plan as QuotePlanV2;assertBoundQuotePlanContract(plan);
  if(row.plan_hash!==planHash || quotePlanDigest(plan)!==planHash || plan.version!=='distributor-quote-plan-2')throw new ControlError(409,'Exact saved quote plan changed.');
  if(!freshSource && !(await this.currentPolicy(c,actor,plan)))throw new ControlError(409,'Quote pricing policy changed after review. Keep affected work contained.');
  if(freshSource){
   const fresh=validateQuotePlanV2(row.proposal,await this.context(c,actor,Object.freeze(structuredClone(plan))));
   if(!isDeepStrictEqual(fresh,plan))throw new ControlError(409,'Quote source or policy changed. Prepare a fresh plan.');
  }
  const part=step==='update'?plan.update:plan.message;
  const rows=(await c.query("SELECT g.version,p.owner FROM ll_connector_scope_grants g JOIN ll_agent_profiles p ON p.org_id=g.org_id AND p.agent_id=g.agent_id JOIN ll_members m ON m.org_id=p.org_id AND m.email=p.owner AND m.active=true WHERE g.org_id=$1 AND g.scope_id=$2 AND g.agent_id=$3 AND g.active=true",[actor.orgId,authority.scopeId,part.agentId])).rows;
  if(rows.length!==1 || rows[0].owner!==plan.requester)throw new ControlError(403,'Exact quote agent requires the saved owner and enrolled scope grant.');
  const scopeGrant:ScopeGrantSnapshot={scopeId:authority.scopeId,scopeVersion:authority.scopeVersion,grantVersion:rows[0].version};
  const payload:QuoteStepPayload & {scopeGrant:ScopeGrantSnapshot}={contract:'quote-step-1',planId:plan.planId,planHash,step,quoteRequest:structuredClone(part.request),binding:part.request.binding,scopeGrant};
  return {plan,payload,actionId:part.actionId,agentId:part.agentId,connector:step==='update'?'quote' as const:'email' as const};
 }
 /** No source substitution: policy metadata has its own trusted fresh read. */
 async currentPolicy(c:PoolClient,actor:Actor,plan:QuotePlanV2){
  if(!this.policy)throw new QuotePolicyUnavailable('Fresh quote pricing policy evidence is unavailable. Keep affected work contained.');
  let current:unknown;try{current=await this.policy(c,actor,Object.freeze({workspaceId:plan.workspaceId,quoteId:plan.quote.id,policyVersion:plan.policyVersion}));}catch{throw new QuotePolicyUnavailable('Fresh quote pricing policy evidence is unavailable. Keep affected work contained.');}
  if(!current||typeof current!=='object'||Array.isArray(current)||Object.getPrototypeOf(current)!==Object.prototype||Reflect.ownKeys(current).length!==4||Object.values(Object.getOwnPropertyDescriptors(current)).some(d=>!('value'in d)||!d.enumerable))throw new QuotePolicyUnavailable('Fresh quote pricing policy evidence is unavailable. Keep affected work contained.');
  const value=current as {contract?:unknown;workspaceId?:unknown;quoteId?:unknown;policy?:unknown};
  if(value.contract!=='quote-pricing-policy-1'||value.workspaceId!==plan.workspaceId||value.quoteId!==plan.quote.id)throw new QuotePolicyUnavailable('Fresh quote pricing policy evidence belongs to another context.');
  return isDeepStrictEqual(value.policy,plan.policy)&&plan.policy.active===true&&plan.policy.version===plan.policyVersion;
 }
 async matches(c:PoolClient,actor:Actor,a:ConnectorAction,provider:ConnectorProvider,freshSource=true){
  if(!isQuoteAction(a) || !a.payload || !('contract' in a.payload) || a.payload.contract!=='quote-step-1')return false;
  const p=a.payload;
  try{
   const exact=await this.current(c,actor,p.planId,p.planHash,p.step,freshSource);
   return (!(provider instanceof NativeQuoteMailConnector) || provider.matchesPlan(exact.plan)) && (!a.id || exact.actionId===a.id) && exact.agentId===a.agent_id && exact.connector===a.connector && exact.plan.policyVersion===a.policy_version && exact.plan.requester===a.proposed_by && provider.workspaceId===exact.plan.workspaceId && provider.bindingId===p.binding && (!a.id || a.payload_hash===quotePlanDigest([a.agent_id,a.connector,p])) && isDeepStrictEqual(exact.payload,p) && (!a.approved_by || a.approved_by===exact.plan.approver);
  }catch(e){if(!freshSource && e instanceof QuotePolicyUnavailable)return false;if(e instanceof ControlError && [400,403,404,409].includes(e.status))return false;throw e;}
 }
 async reviewer(c:PoolClient,actor:Actor,a:ConnectorAction,freshSource=true){
  if(!isQuoteAction(a) || !('contract' in a.payload) || a.payload.contract!=='quote-step-1')throw new ControlError(409,'Exact quote action unavailable.');
  const current=await this.current(c,actor,a.payload.planId,a.payload.planHash,a.payload.step,freshSource);
  if(actor.subject!==current.plan.approver || actor.subject===current.plan.requester)throw new ControlError(403,'Only the independent designated manager may review this quote action.');
 }
}
