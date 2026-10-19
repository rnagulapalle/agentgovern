import { expect, it } from "vitest";
import { chromium, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const requireModule = createRequire(import.meta.url);
// Use the shipped global reset, tokens and Geist bytes for component visual QA.
// This remains an isolated API fixture, not production/browser acceptance.
const fixtureStyles=(async()=>{
 const postcss=requireModule("postcss"),tailwind=requireModule("tailwindcss");
 const global=await postcss([tailwind({config:resolve("tailwind.config.ts"),content:[{raw:'<span class="sr-only"></span>',extension:"html"}]})]).process(await readFile("app/globals.css","utf8"),{from:resolve("app/globals.css")});
 const font=(await readFile("node_modules/geist/dist/fonts/geist-sans/Geist-Regular.woff2")).toString("base64");
 return global.css+`@font-face{font-family:Geist;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:400;font-display:block}:root{--font-geist-sans:Geist;--font-geist-mono:monospace}`+await readFile("app/control-plane/control-plane.css","utf8")+await readFile("components/control-plane/discovery-workspace.css","utf8");
})();
const scope = { tenantId: "fixture-workspace", connectionId: "aws-123456789012-us-west-2", accountId: "123456789012", region: "us-west-2" };
const arn = "arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/customer_assistant-1234567890";
const secondArn = "arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/service_assistant-0987654321";
const scanId = "00000000-0000-4000-8000-000000000001";
const inventory = () => ({ scope, status: "observed", scanId, observedAt: new Date().toISOString(), stale: false, completeness: "complete-api-traversal", failures: [], historyTruncated: false, records: [arn,secondArn].map((resourceArn) => ({ record: { scope, resourceArn, resourceId: resourceArn.split("/").at(-1), version: "1", observedAt: new Date().toISOString(), roleReference: null, workloadIdentityReference: null }, observedInCurrentScan: true, stale: false })) });
function guidedHistory(toolSteps=false) {
  const at=new Date(Date.now()-1000).toISOString(),events=[];
  for(const [index,outcome]of ["completed","awaiting_approval","declined"].entries()) {
    const base={runId:`run-${index}`,actionId:null,occurredAt:at,attempt:1,traceId:String(index+1).repeat(32),spanId:"b".repeat(16),triggerChannel:"slack",reportedDeploymentVersion:"1",actionName:null,provider:null,decision:null,reasonCode:null,reportedOutcome:null,ruleId:null,ruleVersion:null,requestedPercent:null,approvalThreshold:null,maximumDiscount:null,quoteId:index===0?"Q-original":"Q-shared",evidence:"source-reported",effectVerified:false,approvalIdentityVerified:false};
    events.push({...base,eventId:`event-${index}-1`,eventName:"workflow.started"},{...base,eventId:`event-${index}-2`,eventName:"policy.evaluated",requestedPercent:[5,25,80][index],decision:["auto_approve","needs_approval","decline"][index],approvalThreshold:20,maximumDiscount:70},{...base,eventId:`event-${index}-3`,eventName:outcome==="awaiting_approval"?"workflow.paused":"workflow.finished",reportedOutcome:outcome});
  }
  if(toolSteps){
    const first=events.find(e=>e.runId==="run-0")!;
    for(const [index,action_name]of ["classify","resolve_customer","price","record_crm","send_quote"].entries()){
      events.push({...first,eventId:`tool-${index}`,eventName:"action.completed",actionId:`action-${index}`,actionName:action_name,provider:index===0?"anthropic":index===2?"pricing":index===4?"slack":"hubspot",occurredAt:new Date(Date.parse(at)+(index>=3?index+2:index+1)).toISOString()});
    }
    const policy=events.find(e=>e.runId==="run-0"&&e.eventName==="policy.evaluated")!;policy.occurredAt=new Date(Date.parse(at)+4).toISOString();
    const finish=events.find(e=>e.runId==="run-0"&&e.eventName==="workflow.finished")!;finish.occurredAt=new Date(Date.parse(at)+10).toISOString();
  }
  return {enrollment:{displayName:"Customer service agent",owner:"owner@example.test",logGroup:"/company/agent-events",enrolledAt:at},checkedAt:new Date().toISOString(),source:{runtimeArn:arn,enrolledRuntimeVersion:"1",logGroup:"/company/agent-events",startTime:Date.now()-86400000,endTime:Date.now()},events,completeness:"complete-api-traversal",unsupportedRecords:0,duplicateDeliveries:0,conflictingEventIds:[],failures:[],enforcement:"not-established"};
}
type Call = { path: string; method: string; body: Record<string,unknown> | null };
async function mounted(run: (page: Page, calls: Call[]) => Promise<void>, options: { access?: boolean; activityError?: boolean; delayed?: Promise<void>; stale?: boolean; retainedVersion?: boolean; guided?: boolean; enrolled?: boolean; historyUnavailable?: boolean; historyFailsAfterFirst?:boolean; enrollmentFailsAfterFirst?:boolean; enrolledVersion?:string; approvalConnected?:boolean; toolSteps?:boolean; historyVersions?:string[]; emptyHistory?:boolean } = {}) {
  const esbuild = requireModule(requireModule.resolve("esbuild", { paths: [requireModule.resolve("@temporalio/worker")] }));
  const bundle = await esbuild.build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {AwsConnectionJourney} from './components/control-plane/aws-connection-journey';createRoot(document.getElementById('app')).render(<AwsConnectionJourney/>);`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, platform: "browser", format: "iife", write: false, jsx: "automatic", alias: { "@": resolve(".") }, define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' } });
  function snapshot() {
    const value = inventory();
    if (options.retainedVersion) {
      const previous = structuredClone(value.records[0]);
      previous.observedInCurrentScan = false;
      value.records[0].record.version = "2";
      value.records.unshift(previous);
    }
    return value;
  }
  const browser = await chromium.launch({ headless: true }), calls: Call[] = []; let configured = false, owner: string | null = null, onboarded = Boolean(options.enrolled),historyReads=0,enrollmentReads=0;
  try {
    const page = await browser.newPage();page.setDefaultTimeout(4000);
    await page.route("https://aws-journey-fixture.test/**", async route => {
      const path = new URL(route.request().url()).pathname, method = route.request().method(), body = route.request().postDataJSON() as Record<string,unknown> | null;
      if (path === "/") return route.fulfill({ contentType: "text/html", body: `<main class="cp-app"><div class="cp-durable cp-discovery" id="app"></div></main><script>${bundle.outputFiles[0].text}</script>` });
      calls.push({ path, method, body }); let result: unknown, status = 200;
      if (path === "/api/workspace/discovery" && method === "POST") {
        if (body?.operation === "configure") { configured = true; result = { scope, status: "configured", authorityGranted: false }; }
        else result = snapshot();
      } else if (path === "/api/workspace/discovery" && new URL(route.request().url()).searchParams.has("connectionId")) {
        result = options.stale ? { ...snapshot(), stale: true } : snapshot();
      } else if (path === "/api/workspace/discovery") result = { connections: configured ? [{ scope, status: "configured", scanReady: options.access !== false, authorizationAvailable: Boolean(options.guided) }] : [], scanningAvailable: configured && options.access !== false };
      else if (path === "/api/workspace/discovery/activity") {
        if (options.delayed) await options.delayed;
        if (options.activityError) { status = 503; result = { error: "Activity access is not configured for this agent version." }; }
        else result = { reference: { ...body }, checkedAt: new Date().toISOString(), retention: "request-only", completeness: "complete-api-traversal", failures: [], unsupportedRecords: 0, observations: [{ sourceEventId: "event-one", timestamp: Date.now(), observation: { operation: "InvokeAgentRuntime", requestId: "request-one", sessionId: "session-one", effectVerified: false } }], toolActivity: "unknown", enforcement: "unverified" };
      } else if (path === "/api/workspace/discovery/onboarding") {
        if(body?.operation === "enrollment"&&options.enrollmentFailsAfterFirst&&++enrollmentReads>1){status=503;result={error:"Saved enrollment lookup unavailable"};}
        else if(body?.operation === "enrollment") result={enrollment:onboarded&&(!options.enrolledVersion||body.version===options.enrolledVersion)?guidedHistory().enrollment:null};
        else if(body?.operation === "authorization") result={url:"https://us-west-2.console.aws.amazon.com/cloudformation/home?region=us-west-2",roleArn:"arn:aws:iam::123456789012:role/LoopLabsObservation-fixture",expiresAt:new Date(Date.now()+900000).toISOString(),authorityGranted:false};
        else if(body?.operation === "verify") result={status:"identity-verified",inventory:snapshot(),authorityGranted:false};
        else if(body?.operation === "sources") result={groups:[{name:"/company/agent-events",retentionDays:30}],truncated:false};
        else if(body?.operation === "onboard") {onboarded=true;result={mode:"observation-only",enforcement:"not-established",supportedEventsObserved:9};}
        else if(body?.operation === "history" && (options.historyUnavailable||options.historyFailsAfterFirst&&++historyReads>1)) {status=503;result={error:"AWS history identity could not be verified. No history was accepted."};}
        else if(body?.operation === "history" && onboarded) {const h=guidedHistory(options.toolSteps);if(options.emptyHistory)h.events=[];else if(options.historyVersions)h.events.forEach((e,i)=>{e.reportedDeploymentVersion=options.historyVersions![i%options.historyVersions!.length];});result=h;}
        else {status=409;result={error:"Onboard this agent for observation before opening its history."};}
      } else if(path === "/api/workspace/discovery/approvals") result={connected:options.approvalConnected!==false,requests:[],reviewer:"owner@example.test",canReview:true};
      else if (path === "/api/workspace/discovery/owners") {
        if (method === "POST") { owner = String(body?.owner); result = { authorityGranted: false }; }
        else if (new URL(route.request().url()).search) result = { ownership: owner ? "reviewed" : "unmapped", owner, authorityGranted: false, enforcement: "unverified" };
        else result = { owners: [{ email: "owner@example.test", name: "Fixture Owner" }], truncated: false };
      } else { status = 404; result = { error: "Unregistered fixture route" }; }
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(result) });
    });
    await page.goto("https://aws-journey-fixture.test/");
    await page.addStyleTag({ content: await fixtureStyles });

    await page.getByLabel("AWS account ID").fill(scope.accountId); await page.getByLabel("AWS region").fill(scope.region);
    await page.getByRole("button", { name: "Save AWS account", exact: true }).click();
    await page.getByText("AWS account scope saved.", { exact: false }).waitFor();
    await run(page, calls);
  } finally { await browser.close(); }
}
async function openAgent(page: Page, saved = false) {
  await page.getByRole("button", { name: "Open account", exact: false }).click();
  // Saved enrollment opens automatically; do not race its transient inventory button.
  if (saved) { await page.getByRole("heading", { name: "Agent workspace", exact: true }).or(page.getByRole("heading", { name: "Agent connection needs attention", exact: true })).waitFor(); return; }
  await page.getByRole("button", { name: "Review agent", exact: false }).first().click();
}
it("mounted journey saves generated scope, reviews actual API-shaped inventory/activity, assigns owner and never enables execution", async () => mounted(async (page, calls) => {
  await openAgent(page);
  await page.getByRole("button", { name: "Check last 15 minutes", exact: true }).click();
  await page.getByText("Agent invocation reported", { exact: true }).waitFor();
  expect(await page.getByText("Tool activity unknown · Outcome not verified", { exact: true }).isVisible()).toBe(true);
  const activity = calls.find(c => c.path.endsWith("/activity")); expect(activity?.body).toEqual({ connectionId: scope.connectionId, scanId, resourceArn: arn, version: "1" });
  await page.getByRole("button", { name: "Continue to control setup", exact: false }).click();
  await page.getByText("Review accountable owner", { exact: true }).click(); await page.getByLabel("Invited owner").selectOption("owner@example.test"); await page.getByRole("button", { name: "Save owner review", exact: true }).click();
  await page.getByText("Owner reviewed: owner@example.test", { exact: true }).waitFor();
  expect(await page.getByRole("button", { name: "Enable controls · setup required", exact: true }).isDisabled()).toBe(true);
  expect(calls.filter(c => c.method === "POST").every(c => ["/api/workspace/discovery", "/api/workspace/discovery/activity", "/api/workspace/discovery/owners"].includes(c.path))).toBe(true);
  expect(calls.find(c => c.body?.operation === "configure")?.body).toEqual({ operation: "configure", connectionId: scope.connectionId, accountId: scope.accountId, region: scope.region });
}), 20000);
it("missing access and stale inventory are explicit blockers rather than connected or empty-success states", async () => {
  await mounted(async page => {
    await page.getByRole("button", { name: "Open account", exact: false }).click();
    await page.getByText("Read-only access setup required", { exact: true }).waitFor();
    expect(await page.getByText("Read-only access setup required", { exact: true }).isVisible()).toBe(true);
    expect(await page.getByRole("button", { name: "Discover agents in AWS", exact: true }).count()).toBe(0);
  }, { access: false });
  await mounted(async page => {
    await page.getByRole("button", { name: "Open account", exact: false }).click();
    expect(await page.getByRole("button", { name: "Review agent", exact: false }).first().isDisabled()).toBe(true);
    expect(await page.getByRole("button", { name: "Review activity", exact: false }).isDisabled()).toBe(true);
  }, { stale: true });
}, 20000);
it("denied activity read shows its blocker and does not display no-events or invented outcomes", async () => mounted(async page => {
  await openAgent(page); await page.getByRole("button", { name: "Check last 15 minutes", exact: true }).click();
  await page.getByRole("alert").waitFor(); expect(await page.getByRole("alert").textContent()).toContain("not configured");
  expect(await page.getByText("No supported invocation events found in this read", { exact: true }).count()).toBe(0);
  expect(await page.getByText("Agent invocation reported", { exact: true }).count()).toBe(0);
}, { activityError: true }), 20000);
it("mobile navigation fits and a late event response cannot appear under another selected agent", async () => {
  let release!: () => void; const delayed = new Promise<void>(resolve => { release = resolve; });
  try { await mounted(async (page, calls) => {
    await page.setViewportSize({ width: 390, height: 844 }); await openAgent(page);
    await page.getByRole("button", { name: "Check last 15 minutes", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('button')?.textContent !== undefined);
    await page.getByLabel("Selected AWS agent", { exact: true }).selectOption(secondArn+"|1");
    release(); await page.waitForTimeout(75);
    expect(await page.getByText("Agent invocation reported", { exact: true }).count()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(calls.filter(c => c.path.endsWith("/activity"))).toHaveLength(1);
  }, { delayed }); } finally { release(); }
}, 20000);

it("retained earlier runtime version cannot shadow the current discovered version", async () => mounted(async (page, calls) => {
  await page.getByRole("button", { name: "Open account", exact: false }).click();
  expect(await page.getByRole("button", { name: "Review agent", exact: false }).first().isDisabled()).toBe(true);
  await page.getByRole("button", { name: "Review agent", exact: false }).nth(1).click();
  await page.getByRole("button", { name: "Check last 15 minutes", exact: true }).click();
  await page.getByText("Agent invocation reported", { exact: true }).waitFor();
  expect(calls.find(c => c.path.endsWith("/activity"))?.body).toEqual({ connectionId: scope.connectionId, scanId, resourceArn: arn, version: "2" });
  await page.getByRole("button", { name: "Continue to control setup", exact: false }).click();
  expect(await page.getByRole("button", { name: "Enable controls · setup required", exact: true }).isDisabled()).toBe(true);
}, { retainedVersion: true }), 20000);

it("onboarding explains optional telemetry and enforcement gaps without claiming the agent connection failed", async () => mounted(async (page, calls) => {
  await openAgent(page);
  await page.getByRole("heading", { name: "Understand your integration coverage", exact: true }).waitFor();
  expect(await page.getByText("Missing tool events or an execution checkpoint do not mean the agent connection failed.", { exact: false }).isVisible()).toBe(true);
  expect(await page.getByText("Workflow history requires observation onboarding and a supported telemetry source", { exact: true }).isVisible()).toBe(true);
  await page.getByText("Recommendations for your workflow builder", { exact: true }).click();
  expect(await page.getByText("AWS storage alone does not make every format readable.", { exact: false }).isVisible()).toBe(true);
  const download = page.getByRole("link", { name: "Download workflow builder guidance", exact: true });
  expect(await download.getAttribute("href")).toBe("/guides/aws-agent-integration.txt");
  expect(await download.getAttribute("download")).not.toBeNull();
  const guide = await readFile("public/guides/aws-agent-integration.txt", "utf8");
  expect(guide).toContain("Observation release and staged extension");
  expect(guide).toContain("Telemetry is not an enforcement mechanism.");
  expect(calls.some(c => c.path.endsWith("/activity"))).toBe(false);
  await page.getByRole("button", { name: "Check last 15 minutes", exact: true }).click();
  await page.getByRole("alert").waitFor();
  expect(await page.getByRole("heading", { name: "Understand your integration coverage", exact: true }).isVisible()).toBe(true);
  expect(await page.getByText("Agent invocation reported", { exact: true }).count()).toBe(0);
}, { activityError: true }), 20000);

it("guided fixture reviews AWS access, discovers, onboards and renders permitted, held and blocked source runs",async()=>mounted(async(page,calls)=>{
 page.setDefaultTimeout(4000);
 await page.getByRole("button",{name:"Open account",exact:false}).click();
 await page.getByText("Manage AWS access",{exact:true}).click();
 await page.getByLabel("Custom workflow log group · optional").fill("/company/agent-events");
 await page.getByRole("button",{name:"Prepare AWS access request",exact:true}).click();
 const link=page.getByRole("link",{name:"Review access in AWS",exact:true});await link.waitFor();expect(await link.getAttribute("href")).toContain("https://us-west-2.console.aws.amazon.com/cloudformation/home");
 await page.getByRole("button",{name:"Verify AWS access and discover",exact:true}).click();await page.getByText("AWS account identity verified.",{exact:false}).waitFor();
 await page.getByRole("button",{name:"Review agent",exact:false}).first().click();await page.getByRole("button",{name:"Continue to onboarding",exact:false}).click();
 await page.getByLabel("Agent name",{exact:true}).fill("Customer service agent");await page.getByLabel("Accountable owner",{exact:true}).selectOption("owner@example.test");
 await page.getByRole("button",{name:"Find AWS log sources",exact:true}).click();await page.getByLabel("CloudWatch workflow log group",{exact:true}).fill("/company/agent-events");
 await page.getByRole("checkbox",{name:"I have reviewed that this telemetry source belongs to the selected agent.",exact:true}).check();await page.getByRole("button",{name:"Onboard for observation",exact:true}).click();
 await page.getByText("Completed · agent reported",{exact:true}).waitFor();expect(await page.getByText("Awaiting manager approval",{exact:true}).isVisible()).toBe(true);expect(await page.getByText("Blocked by workflow policy",{exact:true}).isVisible()).toBe(true);
 await page.getByText("About this history · source-reported",{exact:true}).click();
 expect(await page.getByText("Effects and approver identities have not been independently verified.",{exact:false}).isVisible()).toBe(true);
 expect(calls.find(c=>c.body?.operation==="onboard")?.body).toMatchObject({connectionId:scope.connectionId,resourceArn:arn,version:"1",owner:"owner@example.test",logGroup:"/company/agent-events"});
 expect(calls.some(c=>["approve","execute","invoke"].includes(String(c.body?.operation)))).toBe(false);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
},{guided:true}),20000);

it("returning to an enrolled AWS agent restores its saved source and history without repeating onboarding",async()=>mounted(async(page,calls)=>{
 await openAgent(page, true);
 await page.getByText("Agent setup saved.",{exact:false}).waitFor();
 expect(await page.getByText("25% discount",{exact:true}).count()).toBe(1);
 await page.getByText("Review saved history setup",{exact:true}).click();
 expect(await page.getByLabel("CloudWatch workflow log group",{exact:true}).inputValue()).toBe("/company/agent-events");
 expect(await page.getByLabel("Accountable owner",{exact:true}).inputValue()).toBe("owner@example.test");
 expect(calls.filter(c=>c.body?.operation==="onboard")).toHaveLength(0);
},{guided:true,enrolled:true}),20000);

it("failed saved history read is explicit and never invents enrolled status",async()=>mounted(async(page,calls)=>{
 await openAgent(page, true);
 await page.getByRole("alert").filter({hasText:"AWS history identity could not be verified"}).waitFor();
 expect(await page.getByText("Agent setup saved.",{exact:false}).count()).toBe(0);
 expect(calls.some(c=>c.body?.operation==="onboard")).toBe(false);
},{guided:true,enrolled:true,historyUnavailable:true}),20000);

it("stale discovery still opens an existing enrollment without granting new onboarding",async()=>mounted(async(page,calls)=>{
 await openAgent(page, true);await page.getByText("Agent setup saved.",{exact:false}).waitFor();
 expect(calls.filter(c=>c.body?.operation==="onboard")).toHaveLength(0);
},{guided:true,enrolled:true,stale:true}),20000);
it("stale discovery requires refresh for an unenrolled agent",async()=>mounted(async page=>{
 await openAgent(page);await page.getByRole("alert").filter({hasText:"Refresh the agent list before setting up observation"}).waitFor();
 expect(await page.getByRole("button",{name:"Onboard for observation",exact:true}).count()).toBe(0);
},{guided:true,stale:true}),20000);

it("history selects one execution into a separate trace and filters Slack without changing source runs",async()=>mounted(async(page)=>{
 await openAgent(page, true);await page.getByText("Agent setup saved.",{exact:false}).waitFor();
 expect(await page.locator("button.aws-execution").count()).toBe(3);expect(await page.locator("button.aws-execution[aria-pressed=true]").count()).toBe(0);
 await page.screenshot({path:".local/aws-history-compact-desktop-fixture.png",fullPage:true});
 await page.getByText("25% discount",{exact:true}).click();expect(await page.locator("button.aws-execution[aria-pressed=true]").count()).toBe(1);
 await page.getByRole("heading",{name:"Execution steps",exact:true}).waitFor();
 expect(await page.getByLabel("Execution steps for run-1",{exact:true}).isVisible()).toBe(true);
 expect(await page.getByLabel("Execution steps for run-0",{exact:true}).count()).toBe(0);
 await page.getByText("5% discount",{exact:true}).first().click();
 expect(await page.getByLabel("Execution steps for run-0",{exact:true}).isVisible()).toBe(true);
 expect(await page.getByLabel("Execution steps for run-1",{exact:true}).count()).toBe(0);
 await page.getByRole("button",{name:"Close trace",exact:true}).click();
 expect(await page.getByRole("heading",{name:"Select an execution",exact:true}).isVisible()).toBe(true);
 await page.getByText("25% discount",{exact:true}).click();
 await page.getByLabel("Workflow history channel",{exact:true}).selectOption("email");expect(await page.locator("button.aws-execution").count()).toBe(0);
 await page.getByText("No requests match these filters. Try a different search or clear the filters.",{exact:true}).waitFor();
 await page.getByLabel("Workflow history channel",{exact:true}).selectOption("slack");expect(await page.locator("button.aws-execution").count()).toBe(3);
 expect(await page.locator("button.aws-execution[aria-pressed=true]").count()).toBe(0);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
},{guided:true,enrolled:true}),20000);


it("reload restores the saved agent only after server enrollment readback, without onboarding again",async()=>mounted(async(page,calls)=>{
 await openAgent(page, true);await page.getByText("Agent setup saved.",{exact:false}).waitFor();
 const before=calls.filter(c=>c.body?.operation==="enrollment").length;await page.reload();await page.getByText("Agent setup saved.",{exact:false}).waitFor();
 expect(calls.filter(c=>c.body?.operation==="enrollment").length).toBeGreaterThan(before);expect(calls.filter(c=>c.body?.operation==="onboard")).toHaveLength(0);
 expect(await page.locator("button.aws-execution").count()).toBe(3);expect(await page.getByText("History connected",{exact:true}).isVisible()).toBe(true);
},{guided:true,enrolled:true}),20000);

it("an inaccessible remembered connection cannot create a connected view or authorize onboarding",async()=>mounted(async(page,calls)=>{
 await page.evaluate(()=>localStorage.setItem("looplabs.aws.place.v1",JSON.stringify({connectionId:"foreign-account",resourceArn:"arn:aws:bedrock-agentcore:us-west-2:111111111111:runtime/foreign-agent",version:"1"})));
 const before=calls.length;await page.reload();await page.getByRole("button",{name:"Open account",exact:false}).waitFor();
 expect(calls.slice(before).some(c=>c.body?.connectionId==="foreign-account")).toBe(false);expect(await page.getByRole("heading",{name:"Agent workspace",exact:true}).count()).toBe(0);
},{guided:true,enrolled:true}),20000);

it("saved onboarding stays collapsed when history fails and approvals are checked independently",async()=>mounted(async(page,calls)=>{
 await openAgent(page, true);await page.getByRole("alert").filter({hasText:"AWS history identity"}).waitFor();
 await page.getByText("Approvals connected",{exact:true}).waitFor();expect(await page.getByText("Agent version 1 · onboarding saved",{exact:true}).isVisible()).toBe(true);
 expect(await page.getByLabel("CloudWatch workflow log group",{exact:true}).isVisible()).toBe(false);expect(calls.filter(c=>c.body?.operation==="onboard")).toHaveLength(0);
},{guided:true,enrolled:true,historyUnavailable:true}),20000);

it("a failed history refresh keeps prior rows and approval controls mounted with an explicit stale-read notice",async()=>mounted(async(page,calls)=>{
 await openAgent(page, true);await page.getByText("Agent setup saved.",{exact:false}).waitFor();await page.getByRole("button",{name:"Approvals",exact:true}).click();await page.getByRole("heading",{name:"Workflow approvals",exact:true}).waitFor();await page.getByRole("button",{name:"Activity",exact:true}).click();
 await page.getByRole("button",{name:"Refresh workflow history",exact:true}).click();await page.getByRole("alert").filter({hasText:"AWS history identity"}).waitFor();
 expect(await page.locator("button.aws-execution").count()).toBe(3);expect(await page.getByText("Showing the last successful history read",{exact:false}).isVisible()).toBe(true);
 expect(await page.getByRole("heading",{name:"Workflow approvals",exact:true,includeHidden:true}).count()).toBe(1);expect(calls.some(c=>c.body?.operation==="onboard")).toBe(false);
},{guided:true,enrolled:true,historyFailsAfterFirst:true}),20000);

it("guided approval verification stays read-only and explains the required administrator hook",async()=>mounted(async(page,calls)=>{
 await openAgent(page, true);await page.getByRole("button",{name:"Approvals",exact:true}).click();await page.getByRole("heading",{name:"Connect workflow approvals",exact:true}).waitFor();
 expect(await page.getByRole("link",{name:"Download approval connection guide",exact:true}).getAttribute("href")).toBe("/guides/aws-workflow-approvals.txt");
 await page.getByRole("button",{name:"Verify approval connection",exact:true}).click();expect(calls.filter(c=>c.path.endsWith("/approvals")).every(c=>c.body?.operation==="list")).toBe(true);
 expect(await page.getByText("Administrator-assisted setup is required in this release.",{exact:false}).isVisible()).toBe(true);expect(await page.getByText("Approvals connected",{exact:true}).count()).toBe(0);
},{guided:true,enrolled:true,approvalConnected:false}),20000);

it("related quote filter preserves one row per execution and the connected summary fits desktop and mobile",async()=>mounted(async(page)=>{
 await openAgent(page, true);await page.getByText("Agent setup saved.",{exact:false}).waitFor();await page.getByText("Approvals connected",{exact:true}).waitFor();
 await page.getByLabel("Reported quote",{exact:true}).selectOption("Q-shared");expect(await page.locator("button.aws-execution").count()).toBe(2);
 await page.getByText("25% discount",{exact:true}).click();expect(await page.locator("button.aws-execution[aria-pressed=true]").count()).toBe(1);
 await page.setViewportSize({width:1440,height:1100});await page.evaluate(()=>{window.scrollTo({top:0,left:0,behavior:"instant"});return document.fonts.ready;});await page.screenshot({path:".local/aws-readable-timeline-desktop.png",fullPage:true});await page.locator(".aws-execution-browser").screenshot({path:".local/aws-readable-timeline-trace.png"});
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:".local/aws-readable-timeline-mobile.png",fullPage:true});
},{guided:true,enrolled:true}),20000);

it("unknown enrollment after a failed read offers retry rather than a new onboarding form",async()=>mounted(async(page,calls)=>{
 await openAgent(page, true);await page.getByRole("alert").filter({hasText:"Saved enrollment lookup unavailable"}).waitFor();
 expect(await page.getByRole("button",{name:"Retry saved agent check",exact:true}).isVisible()).toBe(true);
 expect(await page.getByLabel("CloudWatch workflow log group",{exact:true}).count()).toBe(0);expect(calls.some(c=>c.body?.operation==="onboard")).toBe(false);
},{guided:true,enrolled:true,enrollmentFailsAfterFirst:true}),20000);

it("a saved earlier version never silently onboards a newer deployment or transfers its approval connection",async()=>mounted(async(page,calls)=>{
 await page.getByRole("button",{name:"Open account",exact:false}).click();await page.getByRole("button",{name:"Review agent",exact:false}).first().click();
 await page.getByText("You are viewing a saved deployment version",{exact:true}).waitFor();await page.getByRole("button",{name:"Review version 2",exact:true}).click();
 await page.getByRole("heading",{name:"Review recent activity",exact:true}).waitFor();expect(calls.filter(c=>c.body?.operation==="enrollment").at(-1)?.body?.version).toBe("2");expect(calls.some(c=>c.body?.operation==="onboard")).toBe(false);
},{guided:true,enrolled:true,enrolledVersion:"1",retainedVersion:true}),20000);

it("changing agents clears the selected trace and view switching never sends a decision",async()=>mounted(async(page,calls)=>{
 await openAgent(page,true);await page.getByText("Agent setup saved.",{exact:false}).waitFor();
 const row=page.getByRole("button",{name:"Review 25% discount · run-1",exact:true});await row.focus();await page.keyboard.press("Enter");
 expect(await page.getByLabel("Execution steps for run-1",{exact:true}).isVisible()).toBe(true);
 await page.getByRole("button",{name:"Approvals",exact:true}).click();await page.getByRole("heading",{name:"Workflow approvals",exact:true}).waitFor();
 expect(await page.getByLabel("Execution trace",{exact:true}).isVisible()).toBe(false);
 await page.getByRole("button",{name:"Activity",exact:true}).click();expect(await page.getByLabel("Execution steps for run-1",{exact:true}).isVisible()).toBe(true);
 await page.getByLabel("Selected AWS agent",{exact:true}).selectOption(`${secondArn}|1`);
 await page.getByText("Agent setup saved.",{exact:false}).waitFor();
 expect(await page.getByRole("heading",{name:"Select an execution",exact:true}).isVisible()).toBe(true);
 expect(await page.getByLabel("Execution steps for run-1",{exact:true}).count()).toBe(0);
 expect(calls.some(c=>c.body?.resourceArn===secondArn&&c.body.operation==="history")).toBe(true);
 expect(calls.some(c=>["onboard","decide","approve","execute","invoke"].includes(String(c.body?.operation)))).toBe(false);
},{guided:true,enrolled:true}),20000);

it("shows readable tool stages, honest missing business data and outcome/search filters",async()=>mounted(async(page,calls)=>{
 await openAgent(page,true);await page.getByText("Agent setup saved.",{exact:false}).waitFor();
 await page.setViewportSize({width:1440,height:1100});await page.getByRole("button",{name:"Review 5% discount · run-0",exact:true}).click();
 for(const title of ["Request received","Find the customer","Calculate pricing","Update the customer record","Send the quote"]){expect(await page.getByLabel("Execution trace",{exact:true}).getByText(title,{exact:true}).isVisible()).toBe(true);}
 expect(await page.getByLabel("Execution steps for run-0",{exact:true}).getByText("Anthropic",{exact:true}).count()).toBe(0);
 expect(await page.getByLabel("Execution steps for run-0",{exact:true}).getByText("Interpret the request",{exact:true}).count()).toBe(0);
 expect(await page.locator(".aws-trace-technical").getByText(/Action completion reported · classify/).count()).toBe(1);
 expect(await page.getByText("A 5% discount was requested.",{exact:true}).isVisible()).toBe(true);
 const policy=page.getByLabel("Policy checked",{exact:true});
 expect(await policy.getByText("5%",{exact:true}).isVisible()).toBe(true);
 expect(await policy.getByText("20%",{exact:true}).isVisible()).toBe(true);
 expect(await policy.getByText("70%",{exact:true}).isVisible()).toBe(true);
 expect(await policy.getByText("Automatically approved",{exact:true}).isVisible()).toBe(true);
 expect(await policy.getByText("Not reported",{exact:true}).count()).toBe(2);

 expect(await page.getByText("Original request text wasn’t shared by this workflow. Time shown is when processing started.",{exact:true}).isVisible()).toBe(true);
 expect(await page.getByText("Not shared by workflow",{exact:true}).isVisible()).toBe(true);
 expect(await page.locator(".aws-trace-technical[open]").count()).toBe(0);
 await page.evaluate(()=>document.fonts.ready);
 await page.locator(".aws-run-scorecard").screenshot({path:".local/aws-activity-summary-cards.png"});
 await page.locator(".aws-history-toolbar").screenshot({path:".local/aws-activity-filters.png"});
 await page.locator(".aws-workspace-views").screenshot({path:".local/aws-activity-approval-views.png"});
 await page.locator(".aws-execution-browser").screenshot({path:".local/aws-human-timeline-preview.png"});
 // Expanded only for this review image; the shipped desktop trace remains scrollable.
 const reviewStyle=await page.addStyleTag({content:".aws-run-trace { max-height:none !important; overflow:visible !important; position:static !important; }"});
 await page.getByLabel("Execution trace",{exact:true}).screenshot({path:".local/aws-human-timeline-all-steps.png"});
 await reviewStyle.evaluate(element=>element.parentNode?.removeChild(element));
 await page.getByLabel("Execution outcome",{exact:true}).selectOption("waiting");expect(await page.locator("button.aws-execution").count()).toBe(1);expect(await page.getByRole("button",{name:"Review 25% discount · run-1",exact:true}).isVisible()).toBe(true);
 await page.getByLabel("Find a request",{exact:true}).fill("run-0");expect(await page.locator("button.aws-execution").count()).toBe(0);
 await page.getByRole("button",{name:"Clear filters",exact:true}).click();expect(await page.locator("button.aws-execution").count()).toBe(3);
 await page.getByLabel("Find a request",{exact:true}).fill("run-0");expect(await page.locator("button.aws-execution").count()).toBe(1);
 await page.screenshot({path:".local/aws-human-activity-desktop.png",fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:".local/aws-human-activity-mobile.png",fullPage:true});
 expect(calls.some(c=>["onboard","decide","approve","execute","invoke"].includes(String(c.body?.operation)))).toBe(false);
},{guided:true,enrolled:true,toolSteps:true}),20000);

 it("separates historical version events from enrolled activity without adding approval authority",async()=>mounted(async(page,calls)=>{
 await openAgent(page,true);const region=page.getByRole("region",{name:"History version coverage",exact:true});await region.waitFor();expect(await region.innerText()).toContain("v2");expect(await region.innerText()).toContain("v3");expect(await region.innerText()).toContain("They do not verify activity for the enrolled deployment.");expect(await region.locator("dd").allTextContents()).toEqual(["v1","0","v2, v3"]);expect(calls.some(c=>["approve","execute","invoke","onboard"].includes(String(c.body?.operation)))).toBe(false);await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 },{guided:true,enrolled:true,historyVersions:["2","3"]}),20000);
 it("keeps current and other reported event counts distinct",async()=>mounted(async(page)=>{await openAgent(page,true);const region=page.getByRole("region",{name:"History version coverage",exact:true});await region.waitFor();expect(await region.locator("dd").allTextContents()).toEqual(["v1","5","v1, v2"]);},{guided:true,enrolled:true,historyVersions:["1","2"]}),20000);
 it("empty reads report no version evidence rather than current-deployment activity",async()=>mounted(async(page)=>{await openAgent(page,true);const region=page.getByRole("region",{name:"History version coverage",exact:true});await region.waitFor();expect(await region.locator("dd").allTextContents()).toEqual(["v1","0","None"]);expect(await page.getByText("No supported workflow events were found in this read. This does not establish that the agent was idle.",{exact:true}).isVisible()).toBe(true);},{guided:true,enrolled:true,emptyHistory:true}),20000);
