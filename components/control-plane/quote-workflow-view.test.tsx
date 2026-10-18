import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect,it } from "vitest";
import { QuoteWorkflowArtifact } from "./quote-workflow-view";
import type { QuoteWorkflowView } from "@/lib/quotes/workflow-view";
const view:QuoteWorkflowView={contract:"quote-workflow-view-1",planId:"private-plan-reference",planHash:"private-plan-hash",quoteId:"Q-42",distributorId:"Distributor7",currency:"USD",subtotalMinor:100000,totalMinor:86000,discountBps:1400,delegatedBps:1000,hardCapBps:2000,manager:"manager@company.example",customer:"buyer@example.test",subject:"Your quote",message:"The proposed quote is USD860.00.",sourceVersion:"private-source-reference",completion:"not-established",steps:[{ordinal:1,title:"Update distributor quote",status:"Manager approval required",state:null,actionId:"private-update-reference",approvedBy:null,evidenceReference:null},{ordinal:2,title:"Send customer confirmation",status:"Waiting for verified quote and separate approval",state:null,actionId:"private-message-reference",approvedBy:null,evidenceReference:null}]};
it("business snapshot explains requested14percent versus10percent and downstream hold without technical output",()=>{
 const html=renderToStaticMarkup(createElement(QuoteWorkflowArtifact,{view}));
 for(const text of ["14%","10%","20%","$1,000.00","$860.00","manager@company.example","Manager approval required","Waiting for verified quote","Viewing it does not approve or execute"])expect(html).toContain(text);
 expect(html).not.toContain("<pre");expect(html).not.toContain("<button");expect(html).not.toContain("<details open");
 const primary=html.slice(0,html.indexOf("<details>"));expect(primary).not.toContain("private-");expect(html).toContain("private-update-reference");expect(html).toContain("private-plan-hash");
});
it("ordinary within-delegation proposals do not falsely claim a policy exceedance",()=>{
 const html=renderToStaticMarkup(createElement(QuoteWorkflowArtifact,{view:{...view,discountBps:1000,totalMinor:90000}}));expect(html).toContain("is within");expect(html).not.toContain("exceeds");expect(html).toContain("Exact independent approval is required");
});
it("uncertain and recorded outcomes remain truthful and message content is escaped",()=>{
 const html=renderToStaticMarkup(createElement(QuoteWorkflowArtifact,{view:{...view,message:"<script>untrusted</script>",steps:view.steps.map(s=>({...s,state:"succeeded",status:s.ordinal===1?"Quote effect recorded; current verification required":"Outcome awaiting verification",evidenceReference:"private-recorded-effect"}))}}));
 expect(html).toContain("current verification required");expect(html).toContain("Outcome awaiting verification");expect(html).not.toContain("verified now");expect(html).not.toContain("<script>");expect(html).toContain("&lt;script&gt;");
});

it("compact overview keeps exact pricing, independent steps and the unchanged message outside collapsed technical references",()=>{
 const html=renderToStaticMarkup(createElement(QuoteWorkflowArtifact,{view})),primary=html.slice(0,html.indexOf('<details>'));
 for(const text of ['List subtotal','Proposed total','14%','10%','20%','Designated manager','manager@company.example','Update distributor quote','Send customer confirmation','buyer@example.test','Your quote','The proposed quote is USD860.00.'])expect(primary).toContain(text);
 expect(primary.match(/aria-label="Exact customer message"/g)).toHaveLength(1);expect(primary).not.toContain('private-');expect(primary).not.toContain('Provider-twin');expect(html).not.toContain('<details open');expect(html).toContain('aria-label="Quote actions"');
});
