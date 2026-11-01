import {expect,it} from 'vitest';
import company from './company.json';
import design from './access-design.json';
const people=new Map(company.reference.employees.map(p=>[p.id,p]));
const roles=new Map(design.roles.map(r=>[r.id,r]));
const tools=new Set(company.reference.tools.map(t=>t.id));
const workflows=new Map(company.reference.workflows.map(w=>[w.id,w]));
it('keeps access design non-executable and uses no runtime identities or new AWS resources',()=>{
 expect(design.mode).toBe('design-only-not-authority');expect(design.defaultDecision).toBe('deny');expect(design.executionEnabled).toBe(false);
 expect(design.newAwsResourcesRequired).toBe(false);expect(design.humanAccountsProvisioned).toBe(false);
 expect(design.roleAssignments.every(a=>a.runtimePrincipal===null)).toBe(true);
});
it('covers every person once with diverse roles and explicit lifecycle and expiry',()=>{
 expect(design.roleAssignments).toHaveLength(240);expect(new Set(design.roleAssignments.map(a=>a.employeeId)).size).toBe(240);
 expect(new Set(company.reference.employees.map(e=>e.title)).size).toBeGreaterThan(100);
 expect(new Set(design.roleAssignments.map(a=>a.employmentType))).toEqual(new Set(['employee','contractor','intern']));
 expect(new Set(design.roleAssignments.map(a=>a.roleId)).size).toBe(48);
 for(const a of design.roleAssignments){const p=people.get(a.employeeId)!;expect(p).toBeDefined();expect(roles.has(a.roleId)).toBe(true);expect(a.expiresAfterDays).toBeGreaterThan(0);expect(a.expiresAfterDays).toBeLessThanOrEqual(180);expect(a.accessState).toBe(p.status==='departed'?'revoked':p.status==='leave'?'suspended':'requires-binding');}
});
it('prevents broad human execution and separates intern and contractor tool visibility',()=>{
 for(const r of design.roles){expect(r.controlPlaneIntent.executeAsHuman).toBe(false);expect(r.controlPlaneIntent.grantToolAccess).toBe(false);
  if(r.id.endsWith('-intern')||r.id.endsWith('-contractor')){expect(r.toolAccessIntent.length).toBeLessThanOrEqual(1);expect(r.workflowCapabilityCeiling).toEqual([]);expect(r.controlPlaneIntent.approve).toBe('none');}
  for(const t of r.toolAccessIntent){expect(tools.has(t.toolId)).toBe(true);expect(t.operations.every(op=>op.endsWith('.read'))).toBe(true);expect(t.environment).toBe('sandbox');expect(t.resourceScope).not.toContain('*');}
 }
 expect(roles.get('sales-staff')!.toolAccessIntent.some(t=>t.toolId==='bamboohr')).toBe(false);
 expect(roles.get('support-staff')!.toolAccessIntent.some(t=>t.toolId==='stripe')).toBe(false);
 expect(roles.get('executive-reviewer')!.controlPlaneIntent.executeAsHuman).toBe(false);
});
it('binds every workflow step to an eligible separate owner and explicit tool capability ceiling',()=>{
 expect(design.workflowBoundaries).toHaveLength(32);
 for(const w of design.workflowBoundaries){expect(workflows.has(w.workflowId)).toBe(true);expect(w.runtimeExecutionOwner).toBeNull();expect(w.state).toBe('blocked-until-bound-and-tested');
  expect(w.steps.map(s=>s.toolId)).toEqual(workflows.get(w.workflowId)!.toolIds);
  for(const s of w.steps){const role=roles.get(s.executorRoleId)!;expect(role).toBeDefined();expect(people.get(s.executingOwnerEmployeeId)?.status).toBe('active');
   expect(s.bindingState).toBe('unbound-deny');expect(s.providerOperationVerified).toBe(false);expect(s.capability.providerBinding).toBeNull();expect(s.capability.resourceIds).toEqual([]);expect(s.capability.grantVersion).toBeNull();
   expect(role.workflowCapabilityCeiling.some(c=>c.stepId===s.id&&c.toolId===s.toolId&&c.operationIntent===s.operationIntent&&c.requiresExistingServerGrant)).toBe(true);
   if(!s.operationIntent.endsWith('.read')){expect(s.independentApprovalRequired).toBe(true);expect(s.requiredReviewerEmployeeIds.length).toBeGreaterThan(0);expect(s.requiredReviewerEmployeeIds).not.toContain(s.executingOwnerEmployeeId);expect(s.requiredReviewerEmployeeIds).not.toContain(w.businessOwnerId);for(const id of s.requiredReviewerEmployeeIds)expect(people.get(id)?.status).toBe('active');}
  }
 }
});
it('requires HR-to-IT and support-to-finance handoffs rather than widening the requester',()=>{
 const offboarding=design.workflowBoundaries.find(w=>w.workflowId==='employee-leaver')!.steps.find(s=>s.toolId==='okta')!;
 expect(offboarding.requesterRoleId).toBe('people-staff');expect(offboarding.executorRoleId).toBe('it-staff');expect(offboarding.approvalRoleIds).toEqual(['it-reviewer']);
 const refund=design.workflowBoundaries.find(w=>w.workflowId==='original-payment-refund')!.steps.find(s=>s.toolId==='stripe')!;
 expect(refund.executorRoleId).toBe('finance-staff');expect(refund.approvalRoleIds).toEqual(['finance-reviewer']);
});
it('requires enforcement across delayed actions and preserves uncertainty after a possible effect',()=>{
 expect(design.recheckAt).toEqual(['request','approval','dispatch','retry','effect-verification']);
 expect(design.requiredLifecycleChecks).toContain('delegation-no-wider-than-owner');expect(design.requiredLifecycleChecks).toContain('current-policy-and-grant-version');expect(design.requiredLifecycleChecks).toContain('idempotency-and-effect-readback');
 expect(design.revocationAfterPossibleEffect).toBe('uncertain-no-resend');expect(design.unsupportedOperation).toBe('deny-not-generic-fallback');expect(design.requiredNegativeScenarios).toHaveLength(16);
});
