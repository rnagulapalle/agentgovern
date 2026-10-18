import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import {QuoteWorkspace,QuoteVerificationStatus,QuoteDecisionControls,quoteNextDecision,quoteCurrentlyVerified,quoteHistoricallyVerified,quotePresentedView,quoteConversationTurns,type QuoteSnapshot} from "./quote-workspace";
import type {QuotePlanV2} from "@/lib/quotes/plan-v2";
// Presentation fixtures do not establish authority or provider conformance.
const plan={version:'distributor-quote-plan-2',approver:'manager@company.example',update:{actionId:'update'},message:{actionId:'message'}} as QuotePlanV2;
function snapshot(update:string|null,message:string|null,run=true):QuoteSnapshot{return {saved:{id:'saved',createdBy:'owner@company.example',createdAt:'now',planHash:'hash',proposalHash:'hash',plan},run:run?{id:'saved',state:'draft'}:null,completion:'not-established',actions:[...(update?[{id:'update',connector:'quote',state:update,payload_hash:'updatehash',approved_by:null}]:[]),...(message?[{id:'message',connector:'email',state:message,payload_hash:'mailhash',approved_by:null}]:[])]};}
function html(s:QuoteSnapshot,viewer='owner@company.example'){return renderToStaticMarkup(createElement(QuoteDecisionControls,{snapshot:s,viewer,busy:false,onOperation:()=>{}}));}
it('workspace keeps bounded disabled composer and separate conversation/artifact/activity before enrolled configuration',()=>{
 const h=renderToStaticMarkup(createElement(QuoteWorkspace));for(const text of ['Distributor quotes','Loading saved quote workflows','Quote request composer','Conversation','Plan','Activity','Preparing a plan does not approve or execute it','Simulated business systems'])expect(h).toContain(text);expect(h).not.toContain('<pre');expect(h).toMatch(/<textarea[^>]*disabled/);expect(h).not.toContain('Approve quote update');expect(h).not.toContain('Send approved confirmation');expect(h).toContain('min-height:44px');
});
it('draft and partial recorded work expose only exact submission and never claim approvals',()=>{
 expect(html(snapshot(null,null,false))).toContain('Submit for approval');const partial=html(snapshot('held',null));expect(partial).toContain('Submission is partial');expect(partial).toContain('Retry exact submission');expect(partial).not.toContain('Apply approved discount');expect(partial).not.toContain('Send approved confirmation');
});
it('independent manager review remains separate from requester execution and dependent mail review',()=>{
 const held=snapshot('held','held');expect(html(held)).not.toContain('Approve quote update');expect(html(held,'manager@company.example')).toContain('Approve quote update');expect(html(held,'manager@company.example')).not.toContain('Approve confirmation');expect(html(snapshot('ready','held'))).toContain('Apply approved discount');expect(html(snapshot('ready','held'),'manager@company.example')).not.toContain('Apply approved discount');
 const updated=snapshot('succeeded','held');expect(html(updated,'manager@company.example')).toContain('Approve confirmation');expect(html(updated,'manager@company.example')).not.toContain('Approve quote update');expect(html(updated)).not.toContain('Send approved confirmation');expect(html(snapshot('succeeded','ready'))).toContain('Send approved confirmation');expect(html(snapshot('succeeded','ready'),'colleague@company.example')).not.toContain('Send approved confirmation');
});
it('uncertain, executing, cancelled and final recorded effects do not fabricate completion or automatic replay',()=>{
 for(const state of ['uncertain','executing']){const h=html(snapshot(state,'held'));expect(h).toContain('Check existing quote effect');expect(h).not.toContain('Apply approved discount');expect(h).not.toContain('Send approved confirmation');expect(h).toContain('outcome is uncertain');}
 const paused=snapshot('ready','held');paused.run!.state='paused';expect(html(paused)).toContain('Workflow paused');expect(html(paused)).not.toContain('Apply approved discount');expect(html(paused,'manager@company.example')).not.toContain('Approve confirmation');
 expect(html(snapshot('cancelled','held'))).toContain('Work is contained');expect(html(snapshot('cancelled','held'))).not.toContain('Check full result');const final=html(snapshot('succeeded','succeeded'));expect(final).toContain('Check full result');expect(final).toContain('action states alone do not establish completion');expect(final).not.toContain('Workflow complete');expect(quoteNextDecision(snapshot('mystery','held'),'owner@company.example')).toContain('stays held');
});

it('current request retains missing-discount clarification and explicit correction without sending assistant authority',()=>{
 const history=[{role:'user' as const,text:'Prepare the distributor quote for manager review.'},{role:'assistant' as const,text:'What discount percentage should the designated manager review?'}];
 expect(quoteConversationTurns(history,'14%')).toEqual([{role:'user',text:history[0].text},{role:'user',text:'14%'}]);
 expect(quoteConversationTurns([...history,{role:'user',text:'14%'}],'Correct that discount to15%')).toHaveLength(3);
 // New request clears displayed history and selection; no earlier context leaks.
 expect(quoteConversationTurns([],'Prepare a5% discount for this selected quote.')).toEqual([{role:'user',text:'Prepare a5% discount for this selected quote.'}]);
 expect(()=>quoteConversationTurns(Array.from({length:6},()=>({role:'user' as const,text:'14%'})),'14%')).toThrow('six bounded');expect(()=>quoteConversationTurns([], 'x'.repeat(801))).toThrow('bounded');expect(()=>quoteConversationTurns(Array.from({length:3},()=>({role:'user' as const,text:'x'.repeat(800)})),'14%')).toThrow('bounded');
});

import type {QuoteVerificationView} from '@/lib/quotes/verification-receipt';
it('retained verification is displayed separately from fresh current status and never grants a control',()=>{
 const historical={verifiedAt:'2026-10-10T00:00:00.000Z',runId:'saved-run',receiptHash:'retained-hash',steps:[{ordinal:1,actionId:'quote-action',providerReference:'quote-ref'},{ordinal:2,actionId:'email-action',providerReference:'email-ref'}]} as QuoteVerificationView['historical'];
 const render=(outcome:'verified'|'unknown'|'conflict',history=historical)=>renderToStaticMarkup(createElement(QuoteVerificationStatus,{view:{historical:history,current:{outcome,checkedAt:'2026-10-10T01:00:00.000Z',detail:'Actual current check'}}}));
 for(const outcome of ['unknown','conflict'] as const){const h=render(outcome);expect(h).toContain('Recorded result');expect(h).toContain('were verified at completion');expect(h).toContain('Current check');expect(h).toContain('expired approvals cannot be reused');expect(h).not.toContain('Current verification needs attention');expect(h).not.toContain('verified now');expect(h).not.toContain('<button');expect(h).not.toContain('<pre');expect(h).toContain('<details>');}
 expect(render('verified')).toContain('Current authority and provider evidence match the recorded result');expect(render('unknown',null)).toContain('No final verification record');expect(render('verified',null)).not.toContain('verified now');expect(render('verified')).not.toContain('real customer delivery');expect(renderToStaticMarkup(createElement(QuoteVerificationStatus,{view:null}))).toBe('');
});

it('background continuation is initial-stage owner-only and queued state never claims execution or exposes manual sends',()=>{
 const s=snapshot('ready','held');s.background={available:true,state:null};expect(html(s)).toContain('Continue in background');expect(html(s,'manager@company.example')).not.toContain('Continue in background');s.background.state='pending';const queued=html(s);expect(queued).not.toContain('Continue in background');expect(queued).not.toContain('Apply approved discount');expect(queued).toContain('queued work is not execution');expect(queued).toContain('no quote effect is established');s.background.available=false;expect(html(s)).not.toContain('Apply approved discount');expect(html(s)).not.toContain('Continue in background');expect(html(s)).toContain('queued work is not execution');expect(html(s)).toContain('service is unavailable');
 const updated=snapshot('succeeded','ready');updated.background={available:true,state:'started'};expect(html(updated)).not.toContain('Send approved confirmation');expect(html(updated)).not.toContain('Check full result');const final=snapshot('succeeded','succeeded');final.background={available:true,state:'started'};expect(html(final)).toContain('Check full result');
 for(const update of ['held','uncertain','conflict']){const held=snapshot(update,'held');held.background={available:true,state:null};expect(html(held)).not.toContain('Continue in background');}
});

// Mounted Chromium consumer checks with labelled API response doubles. This
// establishes client loading behavior, not authentication/provider conformance.
import {chromium} from '@playwright/test';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const moduleRequire=createRequire(import.meta.url);
async function mountedWorkspace(run:(page:import('@playwright/test').Page)=>Promise<void>,history:{status:number;body:unknown},setup:{status:number;body:unknown},respond?:(request:import('@playwright/test').Request)=>{status:number;body:unknown}|undefined){
 const esbuild=moduleRequire(moduleRequire.resolve('esbuild',{paths:[moduleRequire.resolve('@temporalio/worker')]})) as {build:(options:Record<string,unknown>)=>Promise<{outputFiles:{text:string}[]}>};
 const bundled=await esbuild.build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import {QuoteWorkspace} from './components/control-plane/quote-workspace';createRoot(document.getElementById('app')).render(<QuoteWorkspace/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',format:'iife',write:false,jsx:'automatic',alias:{'@':resolve('.')},define:{'process.env.NODE_ENV':'"test"'}});
 const browser=await chromium.launch({headless:true});try{const page=await browser.newPage();await page.route('https://looplabs-owned.test/**',async route=>{const path=new URL(route.request().url()).pathname;if(path==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><div id="app"></div>'});const response=respond?.(route.request())??(path==='/api/workspace/quotes/setup'?setup:history);await route.fulfill({status:response.status,contentType:'application/json',body:JSON.stringify(response.body)});});await page.goto('https://looplabs-owned.test/');await page.addScriptTag({content:bundled.outputFiles[0].text});await run(page);}finally{await browser.close();}
}
const currentSetup={viewer:'owner@company.example',available:true,scopes:[{id:'current-scope',quoteId:'quote-42',distributorId:'dist-7',manager:'manager@company.example',canPrepare:true,plans:[]}]};
it('mounted quote workspace retains valid current setup after historical authority409, with explicit history failure',async()=>mountedWorkspace(async page=>{
 await page.getByText('Saved workflow history unavailable: Old manager authority changed.').waitFor();expect(await page.getByLabel('Enrolled quote').inputValue()).toBe('current-scope');expect(await page.getByLabel('Your request',{exact:true}).isEnabled()).toBe(true);await page.getByLabel('Your request',{exact:true}).fill('Prepare14% distributor discount');expect(await page.getByRole('button',{name:'Prepare quote plan',exact:true}).isEnabled()).toBe(true);expect(await page.getByText('Loading saved quote workflows…').count()).toBe(0);expect(await page.getByText('Saved quote workflows',{exact:true}).count()).toBe(0);
},{status:409,body:{error:'Old manager authority changed.'}},{status:200,body:currentSetup}),15000);
it('mounted quote workspace refuses preparation on setup failure while successful history stays visible',async()=>mountedWorkspace(async page=>{
 await page.getByText('Quote configuration unavailable: Current scope unavailable.').waitFor();expect(await page.getByLabel('Your request',{exact:true}).isDisabled()).toBe(true);expect(await page.getByRole('button',{name:'Prepare quote plan',exact:true}).isDisabled()).toBe(true);await page.getByText('Saved quote workflows',{exact:true}).waitFor();expect(await page.getByLabel('Enrolled quote').inputValue()).toBe('');expect(await page.getByText('Designated manager: manager@company.example').count()).toBe(0);
},{status:200,body:{quotes:[{id:'saved',quoteId:'quote-42',distributorId:'dist-7',discountBps:1400,totalMinor:86000,manager:'manager@company.example'}]}},{status:503,body:{error:'Current scope unavailable.'}}),15000);
it('mounted independent loaders preserve both failures without enabling a default quote',async()=>mountedWorkspace(async page=>{
 await page.getByText('Saved workflow history unavailable: History access refused.').waitFor();await page.getByText('Quote configuration unavailable: Setup access refused.').waitFor();expect(await page.getByLabel('Your request',{exact:true}).isDisabled()).toBe(true);expect(await page.getByRole('button',{name:'Prepare quote plan',exact:true}).isDisabled()).toBe(true);expect(await page.getByText('Loading saved quote workflows…').count()).toBe(0);
},{status:409,body:{error:'History access refused.'}},{status:403,body:{error:'Setup access refused.'}}),15000);

it('the workspace carries one provider-twin notice and route-scoped compact presentation without changing decision controls',()=>{
 const h=renderToStaticMarkup(createElement(QuoteWorkspace));expect(h.match(/no real customer update or email delivery/g)).toHaveLength(1);expect(h).toContain('quote-workspace');expect(h).toContain('.quote-workspace .quote-composer[hidden]');expect(h).toContain('grid-template-columns:repeat(3,minmax(0,1fr))');expect(h).not.toContain('position:sticky');
});
const preparedPlan={...plan,planId:'prepared-plan',quote:{id:'quote-42',distributorId:'dist-7',currency:'USD',subtotalMinor:100000,recipient:'buyer@example.test',sourceVersion:'source-reference'},policy:{delegatedBps:1000,hardCapBps:2000},totalMinor:86000,discountBps:1400,message:{actionId:'message',request:{body:{subject:'Your exact quote',text:'USD860.00 at14% discount.'}}}} as QuotePlanV2;
it.each([390,1280])('mounted%dpx navigation keeps composer in Conversation and preserves new request from Plan and Activity',async width=>mountedWorkspace(async page=>{
 await page.setViewportSize({width,height:900});await page.getByLabel('Your request',{exact:true}).fill('Prepare14% discount.');await page.getByRole('button',{name:'Prepare quote plan',exact:true}).click();
 await page.getByRole('tab',{name:'Plan',exact:true}).waitFor();await page.getByRole('heading',{name:'Review the quote and customer confirmation'}).waitFor();
 expect(await page.getByRole('tab',{name:'Plan',exact:true}).getAttribute('aria-selected')).toBe('true');expect(await page.getByRole('form',{name:'Quote request composer',includeHidden:true}).isVisible()).toBe(false);
 for(const text of ['14%','10%','20%','Your exact quote','USD860.00 at14% discount.'])expect(await page.getByLabel('Distributor quote workflow').textContent()).toContain(text);
 expect(await page.getByRole('button',{name:'Submit for approval',exact:true}).isVisible()).toBe(true);expect(await page.getByRole('button',{name:'New quote request',exact:true}).isVisible()).toBe(true);
 const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>window.innerWidth,buttons:Array.from(document.querySelectorAll('.quote-workspace button')).filter(b=>b.getClientRects().length).map(b=>({height:b.getBoundingClientRect().height,font:Number.parseFloat(getComputedStyle(b).fontSize)})),referencesOpen:document.querySelector('.quote-overview details')?.hasAttribute('open')}));expect(layout.overflow).toBe(false);expect(layout.referencesOpen).toBe(false);for(const button of layout.buttons){expect(button.height).toBeGreaterThanOrEqual(44);expect(button.font).toBeGreaterThanOrEqual(16);}
 await page.getByRole('tab',{name:'Activity',exact:true}).click();expect(await page.getByRole('form',{name:'Quote request composer',includeHidden:true}).isVisible()).toBe(false);expect(await page.getByRole('button',{name:'New quote request',exact:true}).isVisible()).toBe(true);
 await page.getByRole('tab',{name:'Conversation',exact:true}).click();expect(await page.getByRole('form',{name:'Quote request composer'}).isVisible()).toBe(true);
 await page.getByRole('tab',{name:'Plan',exact:true}).click();await page.getByRole('button',{name:'New quote request',exact:true}).click();expect(await page.getByRole('tab',{name:'Conversation',exact:true}).getAttribute('aria-selected')).toBe('true');expect(await page.getByLabel('Your request',{exact:true}).inputValue()).toBe('');expect(await page.getByLabel('Enrolled quote').inputValue()).toBe('current-scope');expect(await page.getByRole('button',{name:'Prepare quote plan',exact:true}).isDisabled()).toBe(true);expect(await page.getByRole('button',{name:'Submit for approval',exact:true}).count()).toBe(0);
},{status:200,body:{quotes:[],saved:{id:'saved',createdBy:'owner@company.example',createdAt:'now',planHash:'hash',proposalHash:'hash',plan:preparedPlan},reply:'Saved proposal for independent review.'}},{status:200,body:currentSetup}),15000);


import {QuoteWorkflowArtifact} from './quote-workflow-view';
import type {QuoteWorkflowView} from '@/lib/quotes/workflow-view';
function verifiedPresentation(){
 const s=snapshot('succeeded','succeeded');
 s.run!.state='completed';s.background={available:true,state:'started'};
 s.saved.plan={...preparedPlan,planId:s.saved.id,workspaceId:'workspace',authority:{recoveryEpoch:'epoch'},
  update:{actionId:'update',request:{binding:'quote-binding'}},
  message:{...preparedPlan.message,request:{...preparedPlan.message.request,binding:'email-binding'}}} as QuotePlanV2;
 const v={historical:{runId:'saved',planHash:'hash',workspaceId:'workspace',quoteId:'quote-42',recoveryEpoch:'epoch',steps:[
  {ordinal:1,actionId:'update',binding:'quote-binding',payloadHash:'updatehash'},
  {ordinal:2,actionId:'message',binding:'email-binding',payloadHash:'mailhash'}]},current:{outcome:'verified',checkedAt:'2026-10-11T00:00:00.000Z',detail:'Exact current readbacks'}} as QuoteVerificationView;
 const artifact={planId:'saved',planHash:'hash',quoteId:'quote-42',distributorId:'dist-7',currency:'USD',subtotalMinor:100000,totalMinor:86000,discountBps:1400,delegatedBps:1000,hardCapBps:2000,manager:'manager@company.example',customer:'buyer@example.test',subject:'Quote',message:'USD860.00',sourceVersion:'v3',completion:'not-established',steps:[1,2].map((ordinal)=>({ordinal,actionId:ordinal===1?'update':'message',title:ordinal===1?'Update distributor quote':'Send customer confirmation',status:'Effect recorded; current verification required',state:'succeeded',approvedBy:'manager@company.example',evidenceReference:null}))} as QuoteWorkflowView;
 return {s,v,artifact};
}
it('correlated current receipt removes contradictory pending copy while retaining full-result recheck and simulated-acceptance scope',()=>{
 const {s,v,artifact}=verifiedPresentation();expect(quoteCurrentlyVerified(s,v)).toBe(true);
 const projected=quotePresentedView(artifact,s,v);expect(projected).not.toBe(artifact);expect(artifact.steps[0].status).toContain('verification required');expect(projected.completion).toBe('not-established');
 const result=renderToStaticMarkup(createElement(QuoteWorkflowArtifact,{view:projected,currentlyVerified:true}));
 expect(result).toContain('Quote update verified');expect(result).toContain('Confirmation acceptance verified');expect(result).not.toContain('current verification required');expect(result).not.toContain('approval is required');expect(result).not.toContain('delivered');
 const controls=renderToStaticMarkup(createElement(QuoteDecisionControls,{snapshot:s,viewer:s.saved.createdBy,busy:false,onOperation:()=>{},verification:v}));
 expect(controls).toContain('Quote update and confirmation acceptance are verified');expect(controls).toContain('Recheck current status');expect(controls).toContain('Refresh saved state');expect(controls).not.toContain('worker waits');expect(controls).not.toContain('action states alone');expect(controls).not.toContain('Approve confirmation');expect(controls).not.toContain('Send approved confirmation');
});
it.each(['unknown','conflict'] as const)('historical success with current%s retains completed result without claiming current verification',outcome=>{
 const {s,v,artifact}=verifiedPresentation();v.current.outcome=outcome;
 expect(quoteCurrentlyVerified(s,v)).toBe(false);expect(quoteHistoricallyVerified(s,v)).toBe(true);const presented=quotePresentedView(artifact,s,v);expect(presented.steps[0].status).toBe('Quote update verified at completion');expect(presented.steps[1].status).toBe('Confirmation acceptance verified at completion');expect(quoteNextDecision(s,s.saved.createdBy,v)).toContain('was verified at completion');const result=renderToStaticMarkup(createElement(QuoteWorkflowArtifact,{view:presented,historicallyVerified:true}));expect(result).not.toContain('approval is required');expect(result).not.toContain('delivered');
 expect(renderToStaticMarkup(createElement(QuoteDecisionControls,{snapshot:s,viewer:s.saved.createdBy,busy:false,onOperation:()=>{},verification:v}))).not.toContain('acceptance are verified');
});
it('held, uncertain, paused, missing receipt and recorded states alone never become verified presentation',()=>{
 const {s,v,artifact}=verifiedPresentation();expect(quoteCurrentlyVerified(s,null)).toBe(false);expect(quoteCurrentlyVerified(s,{...v,historical:null})).toBe(false);
 for(const state of ['held','ready','uncertain','executing','conflict']){const changed=structuredClone(s);changed.actions[1].state=state;expect(quoteCurrentlyVerified(changed,v)).toBe(false);expect(quotePresentedView(artifact,changed,v)).toBe(artifact);}
 for(const state of ['active','paused','cancelled','mystery']){const changed=structuredClone(s);changed.run!.state=state;expect(quoteCurrentlyVerified(changed,v)).toBe(false);}
});
it('foreign or changed receipt identity and mismatched displayed graph cannot supply completed step labels',()=>{
 const {s,v,artifact}=verifiedPresentation();
 for(const field of ['runId','planHash','workspaceId','quoteId','recoveryEpoch'] as const){const changed=structuredClone(v);changed.historical![field]='foreign';expect(quoteCurrentlyVerified(s,changed)).toBe(false);expect(quoteHistoricallyVerified(s,changed)).toBe(false);}
 for(const field of ['actionId','binding','payloadHash'] as const){const changed=structuredClone(v);changed.historical!.steps[0][field]='foreign';expect(quoteCurrentlyVerified(s,changed)).toBe(false);expect(quoteHistoricallyVerified(s,changed)).toBe(false);}
 const reversed=structuredClone(v);reversed.historical!.steps.reverse();expect(quoteCurrentlyVerified(s,reversed)).toBe(false);
 const missing=structuredClone(v);missing.historical!.steps.pop();expect(quoteCurrentlyVerified(s,missing)).toBe(false);
 for(const field of ['planId','planHash'] as const){const changed={...artifact,[field]:'foreign'};expect(quotePresentedView(changed,s,v)).toBe(changed);}
 const changed=structuredClone(artifact);changed.steps[1].actionId='foreign';expect(quotePresentedView(changed,s,v)).toBe(changed);
});


it.each([390,1280])('mounted %dpx completed quote rechecks read-only status after expiry without resending or reapproving',async width=>{
 const {s,v,artifact}=verifiedPresentation();v.historical!.verifiedAt='2026-10-11T00:00:00.000Z';
 const requests:string[]=[];let expired=false;
 await mountedWorkspace(async page=>{
  await page.setViewportSize({width,height:1000});await page.getByText('Saved quote workflows',{exact:true}).click();await page.getByRole('button',{name:'View quote-42 · dist-7 · 14%'}).click();
  await page.getByText('Current authority and provider evidence match the recorded result.',{exact:true}).waitFor();
  expired=true;await page.getByRole('button',{name:'Recheck current status',exact:true}).click();
  await page.getByText('Current authority or provider state has changed.',{exact:true}).waitFor();
  expect(await page.getByText('Quote update verified at completion',{exact:true}).isVisible()).toBe(true);
  expect(await page.getByText('Confirmation acceptance verified at completion',{exact:true}).isVisible()).toBe(true);
  expect(await page.getByText('Permission for further actions',{exact:true}).isVisible()).toBe(true);
  expect(await page.getByRole('alert').count()).toBe(0);
  for(const name of ['Apply approved discount','Send approved confirmation','Approve quote update','Approve confirmation','Continue in background','Check full result'])expect(await page.getByRole('button',{name,exact:true}).count()).toBe(0);
  expect(requests).toEqual(['resolve','resolve']);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)).toBe(false);
 },{status:200,body:{quotes:[{id:s.saved.id,quoteId:'quote-42',distributorId:'dist-7',discountBps:1400}]}},{status:200,body:{...currentSetup,scopes:[{...currentSetup.scopes[0],manager:s.saved.plan.approver}]}},request=>{
  const url=new URL(request.url());
  if(url.pathname.endsWith('/verification'))return {status:200,body:{...v,current:{...v.current,outcome:expired?'conflict':'verified',detail:expired?'Current authority or provider state changed; historical verification does not authorize further work.':v.current.detail}}};
  if(request.method()==='POST'){const {operation}=request.postDataJSON();requests.push(operation);return {status:200,body:s};}
  if(url.searchParams.has('run'))return {status:200,body:{view:artifact}};
 });
},15000);
