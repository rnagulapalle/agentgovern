import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it,vi} from "vitest";
import {VerificationEvidence,verifiedStepNote,RunExecutionGuidance,RunLoadingState} from "./enquiry-progress";
// Isolate the ownership controller: these render tests prove its inclusion,
// not worker availability, network polling or execution authorization.
vi.mock("./enquiry-execution",()=>({EnquiryExecution:({id}:{id:string})=>createElement("section",{"data-execution-guidance":id})}));
it("failed saved-run loading exposes the error and a read-only retry, without offering execution or approval",()=>{
 let calls=0;
 const retry=()=>{calls++;};
 const html=renderToStaticMarkup(createElement(RunLoadingState,{error:"Sign in to your workspace.",busy:false,retry}));
 expect(html).toContain('role="alert"');expect(html).toContain("Sign in to your workspace.");
 expect(html).toContain("has not been resubmitted");expect(html).toContain("Load saved progress again");
 expect(html).not.toContain("Opening saved progress");expect(html).not.toMatch(/Approve|Execute|Confirm saved submission|data-execution-guidance/);
 expect(calls).toBe(0);
 const pending=renderToStaticMarkup(createElement(RunLoadingState,{error:"Unavailable",busy:true,retry}));
 expect(pending).toContain('disabled=""');
 const initial=renderToStaticMarkup(createElement(RunLoadingState,{error:"",busy:false,retry}));
 expect(initial).toContain('role="status"');expect(initial).not.toContain("button");expect(calls).toBe(0);
});
const run={id:"run-private-reference",created_by:"owner@example.test",state:"completed",steps:[{ordinal:1,connector:"crm",action_id:"crm-action",agent_id:"crm-agent",state:"succeeded",payload:{},payload_hash:"hash1",reason:"Exact contact update verified by read-back from the simulated CRM.",approved_by:"reviewer@example.test",evidence:{outcome:"verified",detail:"Exact contact update verified by read-back from the simulated CRM.",reference:"crm-private-reference"}},{ordinal:2,connector:"email",action_id:"email-action",agent_id:"email-agent",state:"succeeded",payload:{},payload_hash:"hash2",reason:"Simulated provider accepted the approved message. This is not proof of real delivery.",approved_by:"reviewer@example.test",evidence:{outcome:"verified",detail:"Simulated provider accepted the approved message. This is not proof of real delivery.",reference:"email-private-reference"}}]};
it("verified result keeps business outcome primary and technical references closed but available",()=>{
 const html=renderToStaticMarkup(createElement(VerificationEvidence,{run}));expect(html).toContain('aria-label="Verification evidence"');expect(html).toContain("No real customer email was delivered");
 const match=html.match(/<details>([\s\S]*)<\/details>/);expect(match).not.toBeNull();expect(match![1]).toContain("run-private-reference");expect(match![1]).toContain("email-private-reference");expect(html.slice(0,html.indexOf("<details>"))).not.toContain("private-reference");expect(html).not.toContain("<details open");expect(html).not.toContain("button");
});
it("summary never promotes incomplete, uncertain, unverified or mismatched action pairs to completion",()=>{
 for(const changed of [{...run,state:"active"},{...run,steps:run.steps.slice(0,1)},{...run,steps:run.steps.map(s=>({...s,state:"uncertain"}))},{...run,steps:run.steps.map(s=>({...s,evidence:{...s.evidence,outcome:"unknown"}}))},{...run,steps:run.steps.map(s=>({...s,action_id:"same"}))}])expect(renderToStaticMarkup(createElement(VerificationEvidence,{run:changed}))).toBe("");
});
it("compact notes only replace fully verified successful text; uncertain reasons remain exact",()=>{
 expect(verifiedStepNote(run.steps[0],true)).toBe("Customer record update verified.");expect(verifiedStepNote(run.steps[1],true)).toContain("simulated email provider");expect(verifiedStepNote(run.steps[1],false)).toBe(run.steps[1].reason);expect(verifiedStepNote({...run.steps[1],state:"uncertain",reason:"Response lost; do not resend."},true)).toBe("Response lost; do not resend.");
});

it("fully verified completion removes obsolete scheduling guidance while retaining simulation limits and detailed receipts",()=>{
 const html=renderToStaticMarkup(createElement(RunExecutionGuidance,{id:run.id,run}));expect(html).toBe("");
 const receipt=renderToStaticMarkup(createElement(VerificationEvidence,{run}));expect(receipt).toContain("No real customer email was delivered.");expect(receipt).toContain("Verification references");expect(receipt).toContain("crm-private-reference");expect(receipt).toContain("email-private-reference");
});
it("uncertain, partial, approved-queued and not-yet-final outcomes retain the existing execution ownership controller",()=>{
 const cases=[
 {...run,state:"active",steps:run.steps.map(s=>({...s,state:"ready"}))},
 {...run,state:"active",steps:run.steps.map(s=>({...s,state:s.ordinal===1?"uncertain":"held"}))},
 {...run,state:"active",steps:run.steps.map(s=>({...s,state:s.ordinal===1?"succeeded":null}))},
 {...run,state:"active"},
 {...run,steps:run.steps.slice(0,1)},
 {...run,steps:run.steps.map(s=>({...s,evidence:{...s.evidence,outcome:"unknown"}}))},
 {...run,steps:run.steps.map(s=>({...s,action_id:"duplicate"}))},
 {...run,steps:run.steps.map(s=>({...s,connector:"email"}))},
 {...run,state:"paused"}
 ];
 for(const pending of cases){const html=renderToStaticMarkup(createElement(RunExecutionGuidance,{id:pending.id,run:pending}));expect(html).toContain('data-execution-guidance="run-private-reference"');expect(renderToStaticMarkup(createElement(VerificationEvidence,{run:pending}))).toBe("");}
});
