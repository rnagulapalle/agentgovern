import { expect, it } from "vitest";
import { chromium, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const requireModule = createRequire(import.meta.url);
const scope = { tenantId: "fixture-workspace", connectionId: "aws-123456789012-us-west-2", accountId: "123456789012", region: "us-west-2" };
const arn = "arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/customer_assistant-1234567890";
const secondArn = "arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/service_assistant-0987654321";
const scanId = "00000000-0000-4000-8000-000000000001";
const inventory = () => ({ scope, status: "observed", scanId, observedAt: new Date().toISOString(), stale: false, completeness: "complete-api-traversal", failures: [], historyTruncated: false, records: [arn,secondArn].map((resourceArn) => ({ record: { scope, resourceArn, resourceId: resourceArn.split("/").at(-1), version: "1", observedAt: new Date().toISOString(), roleReference: null, workloadIdentityReference: null }, observedInCurrentScan: true, stale: false })) });
function guidedHistory() {
  const at=new Date(Date.now()-1000).toISOString(),events=[];
  for(const [index,outcome]of ["completed","awaiting_approval","declined"].entries()) {
    const base={runId:`run-${index}`,actionId:null,occurredAt:at,attempt:1,traceId:String(index+1).repeat(32),spanId:"b".repeat(16),triggerChannel:"slack",reportedDeploymentVersion:"1",actionName:null,provider:null,decision:null,reasonCode:null,reportedOutcome:null,ruleId:null,ruleVersion:null,requestedPercent:null,approvalThreshold:null,maximumDiscount:null,evidence:"source-reported",effectVerified:false,approvalIdentityVerified:false};
    events.push({...base,eventId:`event-${index}-1`,eventName:"workflow.started"},{...base,eventId:`event-${index}-2`,eventName:"policy.evaluated",requestedPercent:[5,25,80][index],decision:["auto_approve","needs_approval","decline"][index],approvalThreshold:20,maximumDiscount:70},{...base,eventId:`event-${index}-3`,eventName:outcome==="awaiting_approval"?"workflow.paused":"workflow.finished",reportedOutcome:outcome});
  }
  return {enrollment:{displayName:"Customer service agent",owner:"owner@example.test",logGroup:"/company/agent-events",enrolledAt:at},checkedAt:new Date().toISOString(),source:{runtimeArn:arn,enrolledRuntimeVersion:"1",logGroup:"/company/agent-events",startTime:Date.now()-86400000,endTime:Date.now()},events,completeness:"complete-api-traversal",unsupportedRecords:0,duplicateDeliveries:0,conflictingEventIds:[],failures:[],enforcement:"not-established"};
}
type Call = { path: string; method: string; body: Record<string,unknown> | null };
async function mounted(run: (page: Page, calls: Call[]) => Promise<void>, options: { access?: boolean; activityError?: boolean; delayed?: Promise<void>; stale?: boolean; retainedVersion?: boolean; guided?: boolean; enrolled?: boolean; historyUnavailable?: boolean } = {}) {
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
  const browser = await chromium.launch({ headless: true }), calls: Call[] = []; let configured = false, owner: string | null = null, onboarded = Boolean(options.enrolled);
  try {
    const page = await browser.newPage();
    await page.route("https://aws-journey-fixture.test/**", async route => {
      const path = new URL(route.request().url()).pathname, method = route.request().method(), body = route.request().postDataJSON() as Record<string,unknown> | null;
      if (path === "/") return route.fulfill({ contentType: "text/html", body: '<main class="cp-app"><div class="cp-durable cp-discovery" id="app"></div></main>' });
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
        if(body?.operation === "enrollment") result={enrollment:onboarded?guidedHistory().enrollment:null};
        else if(body?.operation === "authorization") result={url:"https://us-west-2.console.aws.amazon.com/cloudformation/home?region=us-west-2",roleArn:"arn:aws:iam::123456789012:role/LoopLabsObservation-fixture",expiresAt:new Date(Date.now()+900000).toISOString(),authorityGranted:false};
        else if(body?.operation === "verify") result={status:"identity-verified",inventory:snapshot(),authorityGranted:false};
        else if(body?.operation === "sources") result={groups:[{name:"/company/agent-events",retentionDays:30}],truncated:false};
        else if(body?.operation === "onboard") {onboarded=true;result={mode:"observation-only",enforcement:"not-established",supportedEventsObserved:9};}
        else if(body?.operation === "history" && options.historyUnavailable) {status=503;result={error:"AWS history identity could not be verified. No history was accepted."};}
        else if(body?.operation === "history" && onboarded) result=guidedHistory();
        else {status=409;result={error:"Onboard this agent for observation before opening its history."};}
      } else if (path === "/api/workspace/discovery/owners") {
        if (method === "POST") { owner = String(body?.owner); result = { authorityGranted: false }; }
        else if (new URL(route.request().url()).search) result = { ownership: owner ? "reviewed" : "unmapped", owner, authorityGranted: false, enforcement: "unverified" };
        else result = { owners: [{ email: "owner@example.test", name: "Fixture Owner" }], truncated: false };
      } else { status = 404; result = { error: "Unregistered fixture route" }; }
      await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(result) });
    });
    await page.goto("https://aws-journey-fixture.test/");
    await page.addStyleTag({ content: await readFile("app/control-plane/control-plane.css", "utf8") + await readFile("components/control-plane/discovery-workspace.css", "utf8") });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByLabel("AWS account ID").fill(scope.accountId); await page.getByLabel("AWS region").fill(scope.region);
    await page.getByRole("button", { name: "Save AWS account", exact: true }).click();
    await page.getByText("AWS account scope saved.", { exact: false }).waitFor();
    await run(page, calls);
  } finally { await browser.close(); }
}
async function openAgent(page: Page) {
  await page.getByRole("button", { name: "Open account", exact: false }).click();
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
    await page.getByLabel("Selected AWS agent", { exact: true }).selectOption(secondArn);
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
 expect(await page.getByText("Effects and approver identities have not been independently verified.",{exact:false}).isVisible()).toBe(true);
 expect(calls.find(c=>c.body?.operation==="onboard")?.body).toMatchObject({connectionId:scope.connectionId,resourceArn:arn,version:"1",owner:"owner@example.test",logGroup:"/company/agent-events"});
 expect(calls.some(c=>["approve","execute","invoke"].includes(String(c.body?.operation)))).toBe(false);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
},{guided:true}),20000);

it("returning to an enrolled AWS agent restores its saved source and history without repeating onboarding",async()=>mounted(async(page,calls)=>{
 await openAgent(page);
 await page.getByText("Observation onboarding saved.",{exact:false}).waitFor();
 expect(await page.getByRole("heading",{name:"Workflow run · slack · 25% discount",exact:true}).count()).toBe(1);
 await page.getByText("Observation onboarding",{exact:true}).click();
 expect(await page.getByLabel("CloudWatch workflow log group",{exact:true}).inputValue()).toBe("/company/agent-events");
 expect(await page.getByLabel("Accountable owner",{exact:true}).inputValue()).toBe("owner@example.test");
 expect(calls.filter(c=>c.body?.operation==="onboard")).toHaveLength(0);
},{guided:true,enrolled:true}),20000);

it("failed saved history read is explicit and never invents enrolled status",async()=>mounted(async(page,calls)=>{
 await openAgent(page);
 await page.getByRole("alert").filter({hasText:"AWS history identity could not be verified"}).waitFor();
 expect(await page.getByText("Observation onboarding saved.",{exact:false}).count()).toBe(0);
 expect(calls.some(c=>c.body?.operation==="onboard")).toBe(false);
},{guided:true,enrolled:true,historyUnavailable:true}),20000);

it("stale discovery still opens an existing enrollment without granting new onboarding",async()=>mounted(async(page,calls)=>{
 await openAgent(page);await page.getByText("Observation onboarding saved.",{exact:false}).waitFor();
 expect(calls.filter(c=>c.body?.operation==="onboard")).toHaveLength(0);
},{guided:true,enrolled:true,stale:true}),20000);
it("stale discovery requires refresh for an unenrolled agent",async()=>mounted(async page=>{
 await openAgent(page);await page.getByRole("alert").filter({hasText:"Refresh the agent list before setting up observation"}).waitFor();
 expect(await page.getByRole("button",{name:"Onboard for observation",exact:true}).count()).toBe(0);
},{guided:true,stale:true}),20000);
