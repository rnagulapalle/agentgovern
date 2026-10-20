import {describe,it,expect} from 'vitest';
import {engineers,scenarios,evaluateDemo,models,validPolicy,type DemoRequest} from './demo';
const base=scenarios[0].request;
const engineer=()=>structuredClone(engineers[0]);
describe('presentation-only coding control examples',()=>{
 it('permits the bounded example without consuming usage or mutating a request',()=>{const e=engineer(),before=structuredClone(e),request={...base};expect(evaluateDemo(e,request).outcome).toBe('allowed');expect(e).toEqual(before);expect(request).toEqual(base);expect(evaluateDemo(e,request)).toEqual(evaluateDemo(e,request));});
 it('holds production scope separately instead of treating a prompt as approval',()=>{expect(evaluateDemo(engineer(),scenarios[3].request).outcome).toBe('review');expect(evaluateDemo(engineer(),scenarios[3].request).reason).toContain('Nothing was executed');});
 it.each([
  ['unpermitted model',{model:models[1].id},'Model entitlement'],
  ['unknown skill',{skill:'deploy-anywhere'},'Approved skill'],
  ['unknown prompt',{prompt:'review-v999'},'Approved prompt version'],
  ['prompt/skill mismatch',{prompt:'repair-v2'},'Approved prompt version'],
  ['secret category',{dataClass:'secret'},'Sensitive data policy'],
  ['token exhaustion',{tokens:640001},'Token allowance'],
  ['spend exhaustion',{estimatedDollars:56.61},'Spend allowance'],
  ['unknown environment',{environment:'unrestricted'},'Valid request'],
  ['unknown data category',{dataClass:'unknown'},'Valid request'],
  ['negative usage',{tokens:-1},'Valid request'],
  ['fractional token request',{tokens:1.5},'Valid request'],
  ['nonfinite cost',{estimatedDollars:NaN},'Valid request'],
 ] as [string,Partial<DemoRequest>,string][])('refuses %s',(_,patch,check)=>{const r=evaluateDemo(engineer(),{...base,...patch});expect(r.outcome).toBe('blocked');expect(r.checks.at(-1)).toEqual({name:check,passed:false});});
 it('allows exact remaining limits, then refuses one more token or cent',()=>{const e=engineer();const exact={...base,tokens:e.policy.tokenLimit-e.tokens,estimatedDollars:e.policy.dollarLimit-e.spent};expect(evaluateDemo(e,exact).outcome).toBe('allowed');expect(evaluateDemo(e,{...exact,tokens:exact.tokens+1}).outcome).toBe('blocked');expect(evaluateDemo(e,{...exact,estimatedDollars:exact.estimatedDollars+.01}).outcome).toBe('blocked');});
 it('re-evaluates changed controls without inheriting earlier permission',()=>{const e=engineer();expect(evaluateDemo(e,base).outcome).toBe('allowed');e.policy.modelIds=[models[1].id];expect(evaluateDemo(e,base).outcome).toBe('blocked');});
 it('refuses empty identity, malformed allowance and incompatible template configuration',()=>{for(const patch of [{id:''},{tokens:NaN},{spent:-1},{policy:{...engineer().policy,modelIds:[]}},{policy:{...engineer().policy,tokenLimit:Infinity}},{policy:{...engineer().policy,skillIds:['review'],promptIds:['repair-v2']}}])expect(evaluateDemo({...engineer(),...patch},base).outcome).toBe('blocked');expect(validPolicy({...engineer().policy,dollarLimit:0})).toBe(false);});
});

it('assigns every fictional engineer to the explicit Acme organization and a known team with valid model access',async()=>{
 const {organization,teams}=await import('./demo');
 expect(engineers).toHaveLength(6);expect(teams).toHaveLength(3);expect(new Set(engineers.map(e=>e.id)).size).toBe(6);
 for(const e of engineers){expect(e.orgId).toBe(organization.id);expect(teams.some(t=>t.name===e.team)).toBe(true);expect(e.email).toMatch(/@acme\.example\.test$/);expect(validPolicy(e.policy)).toBe(true);}
 for(const t of teams){expect(engineers.filter(e=>e.team===t.name)).toHaveLength(2);expect(engineers.some(e=>e.team===t.name&&e.name===t.lead)).toBe(true);}
});
