import {createElement, type ComponentProps} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import {WorkflowStepSummary,WorkflowVerificationSummary,WorkflowRunSummary} from "./workflow-workspace";
type Step = ComponentProps<typeof WorkflowStepSummary>["step"];
const step:Step={ordinal:1,action_id:"private-crm-action",agent_id:"private-agent",connector:"crm",payload:{lifecycle:"customer"},state:"held",reason:"Detailed policy reason",payload_hash:"hash",approved_by:null,evidence:null};
const message:Step={...step,ordinal:2,action_id:"private-mail-action",connector:"email",proposedRequest:{method:"POST",resource:"Email acknowledgement",body:{to:["customer@example.test"],subject:"Reviewed subject",text:"Reviewed content, not a current template."},approvedSourceVersion:null}};
const render=(s:Step)=>renderToStaticMarkup(createElement(WorkflowStepSummary,{step:s},createElement("button",{disabled:true},"Approve exact action")));
it("primary activity shows independent review and exact business change; private identifiers and reasons remain closed",()=>{
 const html=render(step),primary=html.slice(0,html.indexOf('<details>'));
 expect(primary).toContain("Set the sample contact lifecycle to customer");expect(primary).toContain("Waiting for an independent reviewer");expect(primary).not.toContain("private-agent");expect(primary).not.toContain("Detailed policy reason");expect(html).toContain("Stable action: private-crm-action");expect(html).not.toContain('<details open');expect(html).toContain('<button disabled="">Approve exact action</button>');
});
it("exact stored customer message remains reviewable once with technical payload closed",()=>{
 const html=render(message);expect(html).toContain("Exact customer message · customer@example.test");expect(html).toContain("Reviewed subject");expect(html).toContain("Reviewed content, not a current template.");expect(html).toContain("Technical details: exact system request");expect(html).not.toContain('<details open');
 const before=html.slice(0,html.indexOf('<details>'));expect(before).not.toContain("Reviewed content");expect(before).not.toContain("<pre");
});
it("missing or malformed saved message is unavailable rather than replaced by a template",()=>{
 for(const body of [{}, {to:["a@example.test","b@example.test"],subject:"x",text:"y"}, {to:["a@example.test"],subject:"",text:"y"}])expect(render({...message,proposedRequest:{...message.proposedRequest!,body}})).toContain("Exact saved message unavailable");
});
it("uncertainty, conflicts, queued and malformed states keep their existing containment explanations",()=>{
 for(const [state,note] of [["uncertain","may have taken effect"],["conflict","Keep dependent work on hold"],["executing","do not repeat the action"],["ready","Current authority is checked again"],["unknown","No new action is offered automatically"]]){
 const html=render({...step,state});expect(html).toContain(note);expect(html).not.toContain("Acknowledgement verified");
 }
 const html=render({...step,state:"succeeded",approved_by:"manager@company.example",evidence:{outcome:"verified",detail:"Simulated provider confirmed this effect",reference:"private-reference"}});expect(html).toContain("Approved by: manager@company.example");expect(html).toContain("Observed effect: Simulated provider confirmed this effect");expect(html.slice(0,html.indexOf('<details>'))).not.toContain("private-reference");expect(html).toContain("full run still needs its final check");
});
const run={id:"private-run",state:"completed",steps:[{...step,state:"succeeded",evidence:{outcome:"verified",detail:"CRM verified",reference:"crm-ref"}},{...message,state:"succeeded",evidence:{outcome:"verified",detail:"Mail verified",reference:"mail-ref"}}]};
it("final business result requires the existing exact two-step verified receipt contract, with references closed",()=>{
 const html=renderToStaticMarkup(createElement(WorkflowVerificationSummary,{run}));expect(html).toContain('aria-label="Verification evidence"');expect(html).toContain("No real email was delivered");expect(html.slice(0,html.indexOf('<details>'))).not.toContain("private-run");expect(html).not.toContain('<details open');expect(html).toContain("mail-ref");
 for(const changed of [{...run,state:"active"},{...run,steps:run.steps.slice(0,1)},{...run,steps:run.steps.map(s=>({...s,evidence:{...s.evidence!,outcome:"unknown"}}))},{...run,steps:run.steps.map(s=>({...s,state:"uncertain"}))},{...run,steps:run.steps.map(s=>({...s,action_id:"duplicate"}))},{...run,steps:run.steps.map(s=>({...s,connector:"email"}))}])expect(renderToStaticMarkup(createElement(WorkflowVerificationSummary,{run:changed}))).toBe("");
});
it("an unsupported completion label is explicitly review-needed, never a verified business status",()=>{
 const html=renderToStaticMarkup(createElement(WorkflowRunSummary,{run:{...run,steps:run.steps.slice(0,1)}}));expect(html).toContain("Saved outcome needs review");expect(html).not.toContain("Acknowledgement verified");
});

import {WorkflowWorkspace} from "./workflow-workspace";
it("embedded Activity omits repeated prepared-workflow introduction while standalone workflow setup retains its validation boundary",()=>{
 const embedded=renderToStaticMarkup(createElement(WorkflowWorkspace,{embeddedRunId:"saved-run"}));expect(embedded).not.toContain("Sample customer-record and message workflow.");expect(embedded).not.toContain("Submit for approval");
 const standalone=renderToStaticMarkup(createElement(WorkflowWorkspace));expect(standalone).toContain("Sample customer-record and message workflow.");expect(standalone).toContain("no real customer record changes or email is delivered");
});

it("customer handoff navigation points quote owners to the dedicated quote workspace",()=>{
 const html=renderToStaticMarkup(createElement(WorkflowWorkspace));
 expect(html).toContain("Saved customer handoffs");
 expect(html).toContain('href="/control-plane/quotes"');
 expect(html).toContain("Distributor quotes →");
 const embedded=renderToStaticMarkup(createElement(WorkflowWorkspace,{embeddedRunId:"saved-run"}));
 expect(embedded).not.toContain("Saved customer handoffs");
});

it("activity heading reflects uncertain, partial and final-check states without flattening them into approval or completion",()=>{
 for(const [changed,title] of [
  [{...run,state:"active",steps:run.steps.map(s=>({...s,state:"uncertain"}))},"Checking the outcome"],
  [{...run,state:"active",steps:run.steps.map(s=>({...s,state:null}))},"Submission incomplete"],
  [{...run,state:"active"},"Final verification pending"],
  [{...run,state:"active",steps:run.steps.map(s=>({...s,state:"held"}))},"Waiting for independent approval"]
 ] as const){const html=renderToStaticMarkup(createElement(WorkflowRunSummary,{run:changed}));expect(html).toContain(title);expect(html).not.toContain("Acknowledgement verified");}
});


it("final-step copy requires both exact verified effects, never a completion label alone",()=>{
 const first=run.steps[0], view=(value:ComponentProps<typeof WorkflowStepSummary>["run"],s=first)=>renderToStaticMarkup(createElement(WorkflowStepSummary,{step:s,run:value}));
 const completed=view(run);expect(completed).toContain("passed their final check");expect(completed).not.toContain("still needs its final check");expect(completed).toContain("CRM verified");expect(completed).toContain("Stable action: private-crm-action");expect(completed).not.toContain('<details open');
 for(const changed of [{...run,state:"active"},{...run,state:"paused"},{...run,steps:[first]},
 {...run,steps:[first,{...run.steps[1],state:null}]},{...run,steps:[first,{...run.steps[1],state:"uncertain"}]},
 {...run,steps:[first,{...run.steps[1],evidence:null}]},{...run,steps:[first,{...run.steps[1],evidence:{outcome:"unknown",detail:"Unavailable",reference:"mail-ref"}}]},
 {...run,steps:[first,{...run.steps[1],action_id:first.action_id}]}]){const html=view(changed);expect(html).not.toContain("passed their final check");expect(html).toContain("full run still needs its final check");}
 expect(view(run,{...first,action_id:"foreign-step"})).not.toContain("passed their final check");
 const uncertain={...first,state:"uncertain"},html=view({...run,steps:[uncertain,run.steps[1]]},uncertain);expect(html).toContain("may have taken effect");expect(html).not.toContain("passed their final check");
});

// Reuse the component's existing fixture contract; no provider calls or action
// execution. SDK property filtering is evaluated separately in analytics.test.
import {chromium} from '@playwright/test';
import {createRequire} from 'node:module';
const requireProof=createRequire(import.meta.url);
async function mountedProofRead(response:unknown,status:number,verify:(page:import('@playwright/test').Page,methods:string[])=>Promise<void>,realSdk=false){
 const esbuild=requireProof(requireProof.resolve('esbuild',{paths:[requireProof.resolve('@temporalio/worker')]}));
 const built=await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{WorkflowWorkspace}from'./components/control-plane/workflow-workspace';${realSdk?`import posthog from 'posthog-js';import{filterWorkflowProofEvent}from'./lib/analytics';`:''}window.proofCaptures=[];${realSdk?`posthog.init('public-test-key',{api_host:'http://proof.fixture',opt_out_useragent_filter:true,autocapture:false,capture_pageview:false,capture_pageleave:false,disable_session_recording:true,advanced_disable_feature_flags:true,person_profiles:'never',before_send:event=>{if(event?.event==='workflow_proof_viewed'){window.proofSdkKeys=Object.keys(event.properties);window.proofFiltered=filterWorkflowProofEvent(event)}return null}});posthog.register_for_session({$is_test:true});`:''}createRoot(document.getElementById('root')).render(<WorkflowWorkspace/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"test"','process.env.NEXT_PUBLIC_POSTHOG_KEY':'"public-test-key"'},plugins:realSdk?[]:[{name:'capture-observer',setup(build:{onResolve:(a:unknown,b:()=>unknown)=>void;onLoad:(a:unknown,b:()=>unknown)=>void}){build.onResolve({filter:/^posthog-js$/},()=>({path:'sdk',namespace:'proof-fixture'}));build.onLoad({filter:/.*/,namespace:'proof-fixture'},()=>({contents:'export default {capture:(...args)=>window.proofCaptures.push(args)}',loader:'js'}));}}],logLevel:'silent'});
 const browser=await chromium.launch({headless:true});const page=await browser.newPage();const methods:string[]=[];const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!=='http://proof.fixture')return route.abort();
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<div data-private class="ph-no-capture"><div id="root"></div></div>'});
   methods.push(route.request().method());
   if(url.pathname==='/api/workspace/agents')return route.fulfill({json:{agents:[]}});
   if(url.searchParams.has('run'))return route.fulfill({status,json:response});
   return route.fulfill({json:[{id:'private-run',state:'completed'}]});
  });
  await page.goto('http://proof.fixture/');await page.addScriptTag({content:built.outputFiles[0].text});await page.getByRole('button',{name:'private- · completed',exact:true}).waitFor({timeout:2000}).catch(async()=>{throw Error(JSON.stringify({errors,body:await page.locator('body').innerText(),methods}))});await verify(page,methods);
 }finally{await browser.close();}
}
const captured=(page:import('@playwright/test').Page)=>page.evaluate(()=> (window as unknown as {proofCaptures:unknown[]}).proofCaptures);
it('mounted explicit Open captures one permitted saved-proof display, not initial load or repeated read; makes only GET requests',()=>mountedProofRead(run,200,async(page,methods)=>{
 expect(await captured(page)).toEqual([]);await page.getByRole('button',{name:'private- · completed',exact:true}).click();await page.getByRole('status').getByText('Acknowledgement verified',{exact:true}).waitFor();
 expect(await captured(page)).toEqual([['workflow_proof_viewed',{proof_kind:'crm_to_message_private_twin',verification_state:'verified'}]]);
 await page.getByRole('button',{name:'private- · completed',exact:true}).click();expect(await captured(page)).toHaveLength(1);expect(methods.every(m=>m==='GET')).toBe(true);
 expect(await page.locator('[data-private].ph-no-capture').count()).toBe(1);
}));
it('mounted denied Open emits nothing and shows the existing error without POST or execution',()=>mountedProofRead({error:'Read denied'},403,async(page,methods)=>{
 await page.getByRole('button',{name:'private- · completed',exact:true}).click();await page.getByRole('alert').getByText('Read denied',{exact:true}).waitFor();expect(await captured(page)).toEqual([]);expect(methods.every(m=>m==='GET')).toBe(true);
}));
it('mounted wrong-run successful HTTP response cannot emit proof engagement',()=>mountedProofRead({...run,id:'foreign-run'},200,async(page)=>{
 await page.getByRole('button',{name:'private- · completed',exact:true}).click();await page.getByRole('status').getByText('Acknowledgement verified',{exact:true}).waitFor();expect(await captured(page)).toEqual([]);
}));

// This local fixture admits headless SDK processing only to evaluate the hook.
// Its hook returns null and all external requests are blocked: no analytics delivery.
it('actual SDK final hook retains its configured public ingestion token and QA-safe classification while stripping automatic context',()=>mountedProofRead(run,200,async(page)=>{
 await page.getByRole('button',{name:'private- · completed',exact:true}).click();await page.getByRole('status').getByText('Acknowledgement verified',{exact:true}).waitFor();
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {proofSdkKeys:unknown}).proofSdkKeys),{timeout:2000}).toBeDefined();
 const value=await page.evaluate(()=>({keys:(window as unknown as {proofSdkKeys:string[]}).proofSdkKeys,filtered:(window as unknown as {proofFiltered:{event:string;properties:Record<string,unknown>}}).proofFiltered}));
 expect(value.keys).toContain('token');expect(value.keys).toContain('$current_url');expect(value.filtered.event).toBe('workflow_proof_viewed');expect(value.filtered.properties.token).toBe('public-test-key');expect(value.filtered.properties.verification_state).toBe('verified');expect(value.filtered.properties.$is_test).toBe(true);
 expect(value.filtered.properties).not.toHaveProperty('$current_url');expect(value.filtered.properties).not.toHaveProperty('$set');expect(JSON.stringify(value.filtered)).not.toContain('private-run');
},true));
