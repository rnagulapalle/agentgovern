import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClarityHome, ClarityPlatform } from "./clarity-pages";
import { CapabilityAnimation } from "./capability-animation";
import { ArchitectureFlow } from "./clarity-experience";
import { ProductOverview } from "./product-overview";
import { ProductScope } from "./public-scope";
import workflowCopy from "@/lib/marketing-workflows-copy.json";
import copy from "@/lib/marketing-clarity-copy.json";
import workflow from "@/lib/marketing-tab-workflow-copy.json";

function render(platform=false, profile:Record<string,boolean>={}) { return renderToStaticMarkup(createElement(platform?ClarityPlatform:ClarityHome,profile)); }
describe("public product narrative",()=>{
 it("preserves shared navigation anchors and a single main heading",()=>{
  const html=render();
  for(const id of ["main-content","automation","controls","how-it-works","recovery","faq","demo"])expect(html).toContain(`id="${id}"`);
  expect(html.match(/<h1/g)).toHaveLength(1);
  expect(html).toContain('href="/contact-sales"');
  expect(html).toContain('href="/platform"');
  expect(html).not.toContain('clarity-recovery');
  expect(html).not.toContain('ll-recovery-diagram');
  expect(html.match(/id="recovery"/g)).toHaveLength(1);
  expect(html).not.toContain('href="/control-plane/actions"');
 });
 it("keeps source copy intact and current proof limits visible",()=>{
  const html=render();
  const plain=html.replace(/<[^>]+>/g,'').replace(/&#x27;/g,"'").replace(/&amp;/g,'&').replace(/&quot;/g,'"');
  for(const value of [copy.hero.title,copy.hero.body,workflowCopy.body,workflowCopy.note])expect(plain).toContain(value);
  expect(html).not.toContain(copy.hero.scope);
  expect(html).not.toContain(copy.architecture.note);
  expect(html).not.toMatch(/1,204|Trusted in production|SOC 2 compliant|error-free/i);
 });
 it("showcases three bounded business workflows instead of repeating the control stages",()=>{
  const html=render();
  const plain=html.replace(/<[^>]+>/g,'').replace(/&#x27;/g,"'").replace(/&amp;/g,'&').replace(/&quot;/g,'"');
  for(const workflow of workflowCopy.workflows) {
   expect(plain).toContain(workflow.title);
   expect(plain).toContain(workflow.body);
  }
  expect(html).not.toContain('One quote workflow in a test setup');
  expect(html).not.toContain('clarity-proof');
  expect(html).toContain('No real money moves and no customer email is sent.');
  expect(html).toContain('href="/platform#verified-outcomes"');
 });
 it("frames deployment as a decision with the team on both public pages",()=>{
  for (const platform of [false,true]) {
   const html=render(platform);
   expect(html).toContain('Deployment designed around your security and control requirements');
   expect(html).toContain('Scoped access for each agent');
   expect(html).toContain('Named reviewers for exact actions');
   expect(html).toContain('aria-label="Controlled deployment architecture"');
   expect(html).toContain('aria-label="Pause deployment animation"');
   expect(html).toContain('Illustrative architecture, not live system data.');
   expect(html).not.toContain('enterprise-grade reliability');
   expect(html).not.toMatch(/air-gapped|hybrid deployment|on-prem deployment/i);
   expect(html.match(/id="deployment-title"/g)).toHaveLength(1);
  }
 });
 it("identifies prior team experience without customer or endorsement claims",()=>{
  for(const platform of [false,true]) {
   const html=render(platform);
   expect(html).toContain('aria-label="Prior team experience"');
   expect(html).toContain('Meta Ads');
   expect(html).toContain('WhatsApp Business');
   expect(html.match(/id="team-title"/g)).toHaveLength(1);
   expect(html).not.toMatch(/endorsed by Meta|Meta is a customer|solved all privacy/i);
  }
 });
 it("offers one selected keyboard tab with an associated panel and pause control",()=>{
  const html=render();
  expect(html.match(/role="tab"/g)).toHaveLength(4);
  expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
  expect(html.match(/tabindex="-1"/g)).toHaveLength(3);
  expect(html).toContain('role="tabpanel"');
  expect(html).toContain('aria-label="Pause workflow animation"');
  expect(html).toContain('aria-pressed="false"');
 });
 it("preserves product deep links and invitation scope without a second h1",()=>{
  const html=render(true);
  for(const id of ["workflow-boundaries","approved-execution","verified-outcomes","coding-agent-controls","recovery"])expect(html).toContain(`id="${id}"`);
  expect(html.match(/<h1/g)).toHaveLength(1);
  expect(html).toContain('No real money moves');
  expect(html).toContain('no customer email is delivered');
 });
 it("preserves the exact existing deployment-specific scope text",()=>{
  for(const profile of [{},{quoteOnly:true},{scriptDemo:true}]) {
   const existing=renderToStaticMarkup(createElement(ProductOverview,profile));
   const scope=renderToStaticMarkup(createElement(ProductScope,profile));
   expect(existing).toContain(scope);
  }
 });
 it("does not promote unavailable profiles into enabled functionality",()=>{
  const quote=render(true,{quoteOnly:true});
  expect(quote).toContain('one invited quote workflow');
  expect(quote).toContain('other platform workspaces are not available');
  const script=render(true,{scriptDemo:true});
  expect(script).toContain('Live customer connectors, refunds and a general workflow builder are not available');
 });
});


describe("illustrative ecosystem diagram",()=>{
 it("groups recognizable locally rendered marks without implying connected integrations",()=>{
  const html=renderToStaticMarkup(createElement(ArchitectureFlow));
  for(const label of ["MCP clients","Models","Frameworks","Google","AWS","HubSpot","GitHub","Slack","Salesforce"])
   expect(html).toContain(`aria-label="${label}"`);
  expect(html.match(/class="clarity-brand-mark"/g)).toHaveLength(29);
  expect(html).not.toContain(copy.architecture.note);
  expect(html).not.toMatch(/https:\/\/|Connected|Supported integrations/);
  expect(html).toContain('src="/brand-icons/google.svg"');
  expect(html).toContain('color:#FF7A59');
 });
});

describe("one customer acknowledgement across all control stages",()=>{
 it("keeps one workflow and customer record across all four diagrams",()=>{
  for(const [stage,label] of ["Define","Approve","Verify","Reconcile"].entries()) {
   const html=renderToStaticMarkup(createElement(CapabilityAnimation,{stage}));
   expect(html).toContain(`aria-label="${label} workflow illustration"`);
   expect(html).toContain(workflow.diagram.workflow);
   expect(html).toContain(workflow.diagram.record);
   expect(html).toContain(workflow.diagram.sampleNote);
   expect(html).toContain('aria-label="Pause tab animation"');
   expect(html).not.toMatch(/Net 90|Net 30|discount|25%|Recover/);
  }
  for(const platform of [false,true]) {
   const html=render(platform);
   expect(html).toContain('Reconcile');
   expect(html).not.toContain('Treat uncertainty carefully');
   expect(html).toContain(workflow.title);
   expect(html).toContain(workflow.items[0].body);
  }
 });
 it("keeps approval and dependent email held rather than illustrating an outgoing effect",()=>{
  for(const stage of [0,1,2,3]) {
   const html=renderToStaticMarkup(createElement(CapabilityAnimation,{stage}));
   const held=html.match(/<path[^>]*class="[^"]*motion-held-path[^"]*"[^>]*>/g);
   expect(held?.length).toBeGreaterThan(0);
   for(const path of held??[])expect(path).not.toContain('motion-packet');
  }
  const approval=renderToStaticMarkup(createElement(CapabilityAnimation,{stage:1}));
  expect(approval).toContain('Sarah Chen');
  expect(approval).toContain(workflow.diagram.crmApproval);
  expect(approval).toContain(workflow.diagram.emailApproval);
  expect(approval).toContain(workflow.diagram.dependency);
 });
 it("distinguishes verified readback from an uncertain response without prescribing a blind retry",()=>{
  const verify=renderToStaticMarkup(createElement(CapabilityAnimation,{stage:2}));
  expect(verify).toContain(workflow.diagram.crmReadback);
  expect(verify).toContain(workflow.diagram.mayContinue);
  const reconcile=renderToStaticMarkup(createElement(CapabilityAnimation,{stage:3}));
  for(const value of [workflow.diagram.lostResponse,workflow.diagram.checkExisting,workflow.diagram.foundOnce,workflow.diagram.noDuplicate,workflow.diagram.unknownHeld])expect(reconcile).toContain(value);
  expect(reconcile).not.toMatch(/Restore|Rollback|Retry now|motion-proposed-path/);
 });
});
