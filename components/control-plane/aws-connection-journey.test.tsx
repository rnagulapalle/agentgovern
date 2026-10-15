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
type Call = { path: string; method: string; body: Record<string,unknown> | null };
async function mounted(run: (page: Page, calls: Call[]) => Promise<void>, options: { access?: boolean; activityError?: boolean; delayed?: Promise<void>; stale?: boolean; retainedVersion?: boolean } = {}) {
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
  const browser = await chromium.launch({ headless: true }), calls: Call[] = []; let configured = false, owner: string | null = null;
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
      } else if (path === "/api/workspace/discovery") result = { connections: configured ? [{ scope, status: "configured", scanReady: options.access !== false }] : [], scanningAvailable: configured && options.access !== false };
      else if (path === "/api/workspace/discovery/activity") {
        if (options.delayed) await options.delayed;
        if (options.activityError) { status = 503; result = { error: "Activity access is not configured for this agent version." }; }
        else result = { reference: { ...body }, checkedAt: new Date().toISOString(), retention: "request-only", completeness: "complete-api-traversal", failures: [], unsupportedRecords: 0, observations: [{ sourceEventId: "event-one", timestamp: Date.now(), observation: { operation: "InvokeAgentRuntime", requestId: "request-one", sessionId: "session-one", effectVerified: false } }], toolActivity: "unknown", enforcement: "unverified" };
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
