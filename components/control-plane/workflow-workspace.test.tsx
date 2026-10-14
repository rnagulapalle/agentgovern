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
 const html=render(message);expect(html).toContain("Exact customer message · customer@example.test");expect(html).toContain("Reviewed subject");expect(html).toContain("Reviewed content, not a current template.");expect(html).toContain("Exact proposed connector request");expect(html).not.toContain('<details open');
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
 const embedded=renderToStaticMarkup(createElement(WorkflowWorkspace,{embeddedRunId:"saved-run"}));expect(embedded).not.toContain("Prepared CRM and messaging workflow.");expect(embedded).not.toContain("Submit prepared action");
 const standalone=renderToStaticMarkup(createElement(WorkflowWorkspace));expect(standalone).toContain("Prepared CRM and messaging workflow.");expect(standalone).toContain("no real CRM or email is connected");
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
