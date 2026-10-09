// Actual browser -> Next app -> model API -> PostgreSQL -> isolated FetchSandbox twins.
import { chromium, expect, type Page, type Browser } from "@playwright/test";
import { Pool } from "pg";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { readFile, writeFile, mkdtemp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { passwordHash } from "../lib/workspace/auth";
import { tokenHash } from "../lib/durable/service";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { authenticate } from "../lib/durable/service";
import { ConnectorControl } from "../lib/connectors/service";
import { FetchSandboxConnectors } from "../lib/connectors/twin";
import { WorkflowControl } from "../lib/workflows/service";
import { activities } from "../runtime/temporal/activities";
import { versionedActivities } from "../runtime/temporal/version-contract";
import { TemporalOutbox } from "../runtime/temporal/outbox";
import { enquiryRequest } from "../lib/enquiries/chat-contract";
const origin = "http://localhost:3107", delay = (ms: number) => new Promise(r => setTimeout(r, ms));
async function main() {
  if (!process.env.LOOPLABS_TEST_DATABASE_URL) throw Error("Dedicated test PostgreSQL required.");
  await mkdir(".local", { recursive: true, mode: 0o700 });
  const dir = await mkdtemp(resolve(".local/chat-ui-proof-"));
  const recoveryEpoch=randomUUID();
  const schema = `chat_ui_${randomBytes(8).toString("hex")}`, token = randomBytes(32).toString("base64url"), password = randomBytes(24).toString("base64url");
  const admin = new Pool({ connectionString: process.env.LOOPLABS_TEST_DATABASE_URL });
  const db = new Pool({ connectionString: process.env.LOOPLABS_TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  let temporal: TestWorkflowEnvironment | undefined;
  const packaged:ChildProcess[]=[];let recordBuildId="";
  let worker: ChildProcess | undefined;
  const workerToken = randomBytes(32).toString("base64url");
  let app: ChildProcess | undefined, twin: ChildProcess | undefined, browser: Browser | undefined;
  const checks: { name: string; passed: boolean }[] = [], observed: object[] = [];
  const check = (name: string) => { checks.push({ name, passed: true }); console.log(`PASS ${name}`); };
  const url = new URL(process.env.LOOPLABS_TEST_DATABASE_URL); url.searchParams.set("options", `-c search_path=${schema}`);
  async function startApp() {
    app = spawn("pnpm", ["exec", "next", "start", "-p", "3107"], { detached: true, env: { ...process.env, LOOPLABS_RECOVERY_EPOCH:recoveryEpoch, LOOPLABS_TEMPORAL_WORKSPACE: "staging", LOOPLABS_TEMPORAL_RECORD_BUILD_ID:recordBuildId, LOOPLABS_DURABLE_ORIGIN: "", LOOPLABS_DATABASE_URL: url.toString(), LOOPLABS_FETCHSANDBOX_BINDING: "", LOOPLABS_CONNECTOR_TWIN_URL: "http://127.0.0.1:8018", LOOPLABS_CONNECTOR_TWIN_TOKEN: token, LOOPLABS_RECORD_CATALOG: JSON.stringify({records:[{version:"record-scope-1",workspaceId:"local-proof",contactId:"2001",recipient:"alice@example.test"},{version:"record-scope-1",workspaceId:"local-proof",contactId:"2002",recipient:"bob@example.test"}]}), LOOPLABS_CHAT_MODEL: "us.amazon.nova-lite-v1:0" }, stdio: ["ignore", "pipe", "pipe"] });
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/sign-in")).ok) return; } catch {} await delay(100); }
    throw Error("UI app unavailable");
  }
  async function startWorker() {
    worker = spawn("pnpm", ["exec", "tsx", "scripts/enquiry-worker.ts"], { detached: true, env: { ...process.env, LOOPLABS_RECOVERY_EPOCH:recoveryEpoch, LOOPLABS_DATABASE_URL: url.toString(), LOOPLABS_ENQUIRY_WORKER_TOKEN: workerToken, LOOPLABS_FETCHSANDBOX_BINDING: "", LOOPLABS_CONNECTOR_TWIN_URL: "http://127.0.0.1:8018", LOOPLABS_CONNECTOR_TWIN_TOKEN: token }, stdio: ["ignore", "pipe", "pipe"] });
    for (let i = 0; i < 100; i++) { if ((await db.query("SELECT 1 FROM ll_enquiry_worker_status WHERE last_tick>now()-interval '10 seconds'")).rows[0]) return; await delay(100); }
    throw Error("Background worker unavailable");
  }
  async function stopWorker() { if (worker?.pid) { try { process.kill(-worker.pid, "SIGKILL"); } catch {} await delay(300); } }
  async function managed(page: Page) {
    await page.goto(origin + "/control-plane/work");
    const result = await chat(page, enquiryRequest + " Use customer@example.test.");
    assert(result.saved?.id);
    await page.getByRole("checkbox").check();
    const [submitted] = await Promise.all([page.waitForResponse(r => r.url().endsWith("/api/workspace/enquiries") && r.request().method() === "POST"), page.getByRole("button", { name: "Rehearse this plan", exact: true }).click()]);
    assert.equal((await submitted).status(), 200);
    await expect(page.getByRole("region", { name: "Rehearsal progress" })).toBeVisible();
    return result.saved.id as string;
  }
  async function approveManaged(page: Page, id: string) {
    await page.goto(origin + "/control-plane/work");
    await page.getByRole("button", { name: new RegExp(id.slice(0, 8)) }).click();
    for (const name of ["Approve CRM update", "Approve acknowledgement"]) await page.getByRole("button", { name, exact: true }).click();
  }
  async function completed(id: string) {
    for (let i = 0; i < 150; i++) { if ((await db.query("SELECT state FROM ll_workflow_runs WHERE id=$1", [id])).rows[0]?.state === "completed") return; await delay(100); }
    throw Error("Background run did not verify completion");
  }
  async function stopApp() { if (app?.pid) { try { process.kill(-app.pid, "SIGKILL"); } catch {} await delay(400); } }
  async function login(page: Page, email: string) {
    const prefetched: string[] = [];
    const observe = (r: import("@playwright/test").Request) => { if (r.headers()["next-router-prefetch"] === "1" || r.headers()["purpose"] === "prefetch") prefetched.push(r.url()); };
    page.on("request", observe);
    await page.goto(origin + "/sign-in?next=/control-plane/work");
    await page.waitForTimeout(700);
    page.off("request", observe);
    assert.equal(prefetched.length, 0, "Sign-in must not fan out background route prefetches");
    await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password").fill(password);
    const [signedIn] = await Promise.all([page.waitForResponse(r => r.url().endsWith("/api/workspace/session") && r.request().method() === "POST"), page.getByRole("button", { name: "Sign in", exact: true }).click()]);
    const result = await signedIn; assert.equal(result.status(), 200, `UI sign-in: ${JSON.stringify(await result.json())}`);
    await expect(page.getByRole("heading", { name: "Describe the work. Rehearse it first." })).toBeVisible();
  }
  async function open(page: Page, id: string) {
    await page.goto(origin + "/control-plane/work");
    await page.getByRole("button", { name: new RegExp(id.slice(0, 8)) }).click();
    await expect(page.getByRole("heading", { name: /Customer handoff/ })).toBeVisible();
  }
  async function chat(page: Page, text: string) {
    await page.getByLabel("Your request or clarification").fill(text);
    const [result] = await Promise.all([page.waitForResponse(r => r.url().endsWith("/api/workspace/enquiries") && r.request().method() === "POST"), page.getByRole("button", { name: "Send request", exact: true }).click()]);
    const response = await result; assert.equal(response.status(), 200); return response.json();
  }
  async function prepare(page: Page) {
    await page.goto(origin + "/control-plane/work");
    assert((await chat(page, enquiryRequest)).clarification);
    const { saved } = await chat(page, "Use customer@example.test for this rehearsal. Keep ask-first approval.");
    assert(saved?.id); assert.equal(saved.run_id, null);
    assert.equal((await db.query("SELECT count(*) FROM ll_workflow_runs WHERE id=$1", [saved.id])).rows[0].count, "0");
    await expect(page.getByRole("heading", { name: "2. Review this exact plan" })).toBeVisible();
    await page.getByText("Advanced: use registered agents", { exact: true }).click();
    await page.getByLabel(/^CRM agent/).selectOption("crm-agent"); await page.getByLabel(/^Messaging agent/).selectOption("email-agent");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create this reviewed workflow" }).click();
    await expect(page.getByRole("heading", { name: /Customer handoff/ })).toBeVisible();
    return saved;
  }
  function step(page: Page, ordinal: number) { return page.locator("article").filter({ has: page.getByRole("heading", { name: ordinal === 1 ? /^1\. Set/ : /^2\. Send/ }) }); }
  async function clickAction(page: Page, ordinal: number, name: string) {
    const [result] = await Promise.all([page.waitForResponse(r => r.url().endsWith("/api/durable/connectors") && r.request().method() === "POST"), step(page, ordinal).getByRole("button", { name, exact: true }).click()]); return result;
  }
  async function proposeAndApprove(page: Page, reviewer: Page, id: string) {
    for (const ordinal of [1, 2]) assert.equal((await clickAction(page, ordinal, "Submit prepared action")).status(), 200);
    // The initiating member cannot approve its own request, even through the UI.
    assert.equal((await clickAction(page, 1, "Approve exact action")).status(), 403);
    await open(reviewer, id);
    for (const ordinal of [1, 2]) assert.equal((await clickAction(reviewer, ordinal, "Approve exact action")).status(), 200);
    await open(page, id);
  }
  async function effects() { return JSON.parse(await readFile(`${dir}/connector-twin-state.json`, "utf8")).effects; }
  async function run(page: Page, id: string) { return (await page.request.get(origin + "/api/durable/workflows?run=" + id)).json(); }
  async function complete(page: Page) {
    await page.getByRole("button", { name: "Verify and complete", exact: true }).click();
    await expect(page.getByRole("region", { name: "Verification receipt" })).toBeVisible();
  }
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    for (const file of ["lib/durable/schema.sql", "lib/workspace/schema.sql", "lib/refunds/schema.sql", "lib/connectors/schema.sql", "lib/workflows/schema.sql", "lib/durable/proposal-schema.sql", "lib/enquiries/schema.sql", "lib/enquiries/managed-schema.sql", "lib/enquiries/temporal-schema.sql", "lib/durable/recovery-schema.sql", "lib/connectors/scope-schema.sql", "lib/enquiries/record-routing-schema.sql"]) await db.query(await readFile(file, "utf8"));
    await db.query("INSERT INTO ll_orgs(id) VALUES('local-proof')");
    await db.query("INSERT INTO ll_workspace_recovery(org_id,epoch) VALUES('local-proof',$1)",[recoveryEpoch]);
    for (const [email, name] of [["requester@example.test", "Requester"], ["reviewer@example.test", "Reviewer"]]) await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES($1,'local-proof',$2,$3)", [email, name, passwordHash(password)]);
    await db.query("INSERT INTO ll_connector_policies(org_id,connector) VALUES('local-proof','crm'),('local-proof','email')");
    for (const [id, tool] of [["crm-agent", "twin.crm"], ["email-agent", "twin.email"]]) {
      await db.query("INSERT INTO ll_agents(org_id,id,tools,action_limit) VALUES('local-proof',$1,$2,100)", [id, [tool]]);
      await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'local-proof',$2,'agent')", [tokenHash(randomBytes(32).toString("base64url")), id]);
    }
    await db.query("INSERT INTO ll_agent_profiles(org_id,agent_id,name,owner,role,connector) VALUES('local-proof','crm-agent','CRM agent','requester@example.test','crm_agent','crm_twin'),('local-proof','email-agent','Email agent','requester@example.test','email_agent','email_twin')");
    await writeFile(`${dir}/connector-twin-records.json`,JSON.stringify({records:[{version:"record-scope-1",workspaceId:"local-proof",contactId:"2001",recipient:"alice@example.test"},{version:"record-scope-1",workspaceId:"local-proof",contactId:"2002",recipient:"bob@example.test"}]}),{mode:0o600});
    await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'local-proof','enquiry-runner','worker')", [tokenHash(workerToken)]);
    await writeFile(`${dir}/connector-twin-faults.json`,JSON.stringify({loseResponseRecords:["2002"]}),{mode:0o600});
    await writeFile(`${dir}/connector-twin-credentials.json`, JSON.stringify({ token }), { mode: 0o600 });
    const backend = process.env.FETCHSANDBOX_BACKEND_PATH || `${process.env.HOME}/sandbox/backend`;
    twin = spawn(`${backend}/.venv/bin/python`, ["scripts/connector-twin.py"], { env: { ...process.env, LOOPLABS_CONNECTOR_STATE_DIR: dir }, stdio: ["ignore", "pipe", "pipe"] });
    for (let i = 0; i < 100; i++) { try { if ((await fetch("http://127.0.0.1:8018/crm/crm/v3/objects/contacts/1001", { headers: { Authorization: `Bearer ${token}` } })).ok) break; } catch {} await delay(100); }
    recordBuildId=JSON.parse(await readFile(".worker/temporal-manifest.json","utf8")).buildId;
    await startApp(); browser = await chromium.launch({ headless: true });
    const requester = await browser.newContext(), reviewerContext = await browser.newContext();
    const page = await requester.newPage(), reviewer = await reviewerContext.newPage();
    await login(page, "requester@example.test"); await login(reviewer, "reviewer@example.test");
    check("Sign-in navigation generates no background route prefetch burst for either member");
    await page.goto(origin + "/control-plane/records");
    await expect(page.getByRole("heading", {name:"Records and access",exact:true})).toBeVisible();
    const [enrollmentResponse] = await Promise.all([page.waitForResponse(r=>r.url().endsWith("/api/workspace/records") && r.request().method()==="POST"), page.locator("div.cp-durable-card").filter({has:page.getByRole("heading",{name:"alice@example.test",exact:true})}).getByRole("button",{name:"Add customer record",exact:true}).click()]);
    const enrolled=await enrollmentResponse;assert.equal(enrolled.status(),200);const record=await enrolled.json();
    await page.getByLabel("Agent to grant access").selectOption("crm-agent");
    await page.getByRole("button",{name:"Grant record access",exact:true}).click();
    await expect(page.getByRole("button",{name:"Revoke agent access",exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Revoke agent access",exact:true}).click();
    await expect(page.getByRole("button",{name:"Restore agent access",exact:true})).toBeVisible();
    const staleAccess=await page.request.post(origin+"/api/workspace/records",{headers:{Origin:origin},data:{operation:"setGrantActive",scopeId:record.id,agentId:"crm-agent",active:true,expectedVersion:1}});assert.equal(staleAccess.status(),409);
    await page.getByRole("button",{name:"Restore agent access",exact:true}).click();
    await expect(page.getByRole("button",{name:"Revoke agent access",exact:true})).toBeVisible();
    await page.reload();await expect(page.getByText("Accountable owner: requester@example.test",{exact:true})).toBeVisible();
    assert.equal((await db.query("SELECT count(*) FROM ll_connector_actions")).rows[0].count,"0");
    assert.equal((await db.query("SELECT count(*) FROM ll_workflow_runs")).rows[0].count,"0");
    await page.screenshot({path:"docs/evidence/record-onboarding-desktop.png",fullPage:true});
    await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:"docs/evidence/record-onboarding-mobile.png",fullPage:true});await page.setViewportSize({width:1280,height:900});
    check("Invited browser enrolls configured record, explicitly grants/revokes/restores agent access, denies stale restoration and reloads saved owner; no actions or workflow created; 390px layout has no overflow");
    const normal = await prepare(page);
    await page.screenshot({ path: "docs/evidence/chat-ui-plan.png", fullPage: true });
    check("Typed natural-language request calls the real model, asks for the missing customer and saves an exact plan without effects");
    const duplicate = await page.request.post(origin + "/api/workspace/enquiries", { headers: { Origin: origin }, data: { operation: "chat", id: normal.id, turns: [{ role: "user", text: enquiryRequest }, { role: "user", text: "Use customer@example.test. Keep ask-first." }] } });
    assert.equal(duplicate.status(), 200); assert.equal((await duplicate.json()).saved.id, normal.id);
    const replay = await page.request.post(origin + "/api/workspace/enquiries", { headers: { Origin: origin }, data: { operation: "start", id: normal.id, planHash: normal.plan_hash, crmAgent: "crm-agent", emailAgent: "email-agent" } }); assert.equal(replay.status(), 200);
    assert.equal((await db.query("SELECT count(*) FROM ll_workflow_runs")).rows[0].count, "1"); assert.equal(Object.keys(await effects()).length, 0);
    check("Repeated typed intent and reviewed-plan creation reuse the same saved plan and run without authorizing execution");
    await proposeAndApprove(page, reviewer, normal.id);
    for (const ordinal of [1, 2]) assert.equal((await clickAction(page, ordinal, "Execute")).status(), 200);
    await complete(page); await page.screenshot({ path: "docs/evidence/chat-ui-completed.png", fullPage: true });
    assert.equal(Object.keys(await effects()).length, 2); observed.push(await run(page, normal.id));
    check("Two independent named approvals, actual CRM/email HTTP effects and UI verification receipt complete the normal rehearsal");
    const lost = await prepare(page); await proposeAndApprove(page, reviewer, lost.id);
    assert.equal((await clickAction(page, 1, "Execute · lose response")).status(), 200);
    await expect(step(page, 1).getByText("crm-agent · uncertain", { exact: true })).toBeVisible();
    assert.equal((await clickAction(page, 2, "Execute")).status(), 409);
    const before = await effects(); assert.equal(Object.keys(before).length, 3);
    await stopApp(); await startApp(); await open(page, lost.id);
    assert.equal((await clickAction(page, 1, "Verify outcome")).status(), 200);
    assert.deepEqual(await effects(), before);
    assert.equal((await clickAction(page, 2, "Execute")).status(), 200); await complete(page); observed.push(await run(page, lost.id));
    check("Lost CRM response holds email; killing/restarting the real app preserves the run and read-back recovers without a second CRM write");
    const stale = await prepare(page); await proposeAndApprove(page, reviewer, stale.id);
    const contact = await (await fetch("http://127.0.0.1:8018/crm/crm/v3/objects/contacts/1001", { headers: { Authorization: `Bearer ${token}` } })).json();
    const changed = await fetch("http://127.0.0.1:8018/crm/crm/v3/objects/contacts/1001", { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "If-Match": contact.updatedAt, "Idempotency-Key": `looplabs-${randomUUID()}` }, body: JSON.stringify({ properties: { lifecyclestage: "customer" } }) }); assert.equal(changed.status, 200);
    const staleBefore = await effects(); await clickAction(page, 1, "Execute"); assert.equal((await clickAction(page, 2, "Execute")).status(), 409); assert.deepEqual(await effects(), staleBefore);
    observed.push(await run(page, stale.id)); await page.screenshot({ path: "docs/evidence/chat-ui-stale.png", fullPage: true });
    check("Customer data changed after approval: the atomic version check rejects the stale write and no downstream message executes");
    await page.goto(origin + "/control-plane/work"); assert((await chat(page, "Rehearse the acknowledgement and also give a discount and send immediately")).clarification);
    assert.equal((await db.query("SELECT count(*) FROM ll_enquiry_plans")).rows[0].count, "3");
    check("Unsupported extra actions stop in chat without creating a plan or workflow");
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(origin + "/control-plane/work");
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll(".cp-durable-card button")].every(b => b.getBoundingClientRect().right <= innerWidth)));
    await page.screenshot({ path: "docs/evidence/chat-ui-mobile.png", fullPage: true }); check("390px mobile conversation has no horizontal overflow");
    const legacyEffects = await effects();
    await startWorker();
    const automatic = await managed(page);
    const beforeManaged = await effects();
    const savedManaged = await run(page, automatic);
    assert(savedManaged.steps.every((s: { agent_id: string; state: string }) => s.agent_id.startsWith("ack-") && s.state === "held"));
    const self = await page.request.post(origin + "/api/durable/connectors", { headers: { Origin: origin }, data: { operation: "approve", actionId: savedManaged.steps[0].action_id, payloadHash: savedManaged.steps[0].payload_hash } }); assert.equal(self.status(), 403);
    const managedReplay = await page.request.post(origin + "/api/workspace/enquiries", { headers: { Origin: origin }, data: { operation: "rehearse", id: automatic, planHash: (await db.query("SELECT plan_hash FROM ll_enquiry_plans WHERE id=$1", [automatic])).rows[0].plan_hash } }); assert.equal(managedReplay.status(), 200);
    assert.deepEqual(await effects(), beforeManaged);
    await page.goto(origin + "/about"); // Initiator leaves the workspace; no browser executes work.
    await approveManaged(reviewer, automatic); await reviewer.goto(origin + "/about");
    await completed(automatic);
    const afterManaged = await effects(); assert.equal(Object.keys(afterManaged).length, Object.keys(beforeManaged).length + 2);
    check("Typed request automatically assigns single-action assistants; plan replay has no effects and separate-person approval completes in a real background worker with both browsers away");
    await stopWorker();
    const recovery = await managed(page); await approveManaged(reviewer, recovery);
    const recoveryRun = await run(page, recovery);
    const lose = await page.request.post(origin + "/api/durable/connectors", { headers: { Origin: origin }, data: { operation: "execute", actionId: recoveryRun.steps[0].action_id, lostResponse: true } }); assert.equal(lose.status(), 200);
    const lostEffects = await effects();
    await stopApp(); await startApp(); await startWorker(); await completed(recovery);
    const recoveredEffects = await effects(); assert.equal(Object.keys(recoveredEffects).length, Object.keys(lostEffects).length + 1);
    for (const id of Object.keys(lostEffects)) assert.deepEqual(recoveredEffects[id], lostEffects[id]);
    check("Real app and worker restart automatically read back a lost CRM response, dispatch only the held email, and save a full verification receipt without another CRM write");
    await page.goto(origin + "/control-plane/work"); await page.getByRole("button", { name: new RegExp(recovery.slice(0,8)) }).click();
    await expect(page.getByRole("region", { name: "Verification receipt" })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: "docs/evidence/enquiry-managed-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: "docs/evidence/enquiry-managed-mobile.png", fullPage: true });
    check("Managed approval cards, connection setup and saved verification receipt remain readable at 390px without overflow");
    const managedRuns = [await run(page, automatic), await run(page, recovery)];
    await page.setViewportSize({ width: 1280, height: 900 });
    const durable = await managed(page);
    const ownership = page.getByRole("region", { name: "Saved execution ownership" });
    await expect(ownership).toBeVisible();
    await ownership.getByRole("checkbox").check();
    await ownership.getByRole("button", { name: "Use durable execution", exact: true }).click();
    await expect(ownership.getByText("Durable execution selected", { exact: true })).toBeVisible();
    assert.deepEqual((await db.query("SELECT a.state FROM ll_workflow_steps s JOIN ll_connector_actions a ON a.org_id=s.org_id AND a.id=s.action_id WHERE s.run_id=$1 ORDER BY s.ordinal", [durable])).rows.map(r => r.state), ["held", "held"]);
    const effectsBeforeDurable = await effects();
    temporal = await TestWorkflowEnvironment.createLocal();
    const temporalToken = randomBytes(32).toString("base64url");
    await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'local-proof','enquiry-temporal','worker')", [tokenHash(temporalToken)]);
    const actor = await authenticate(db, temporalToken);
    const queue = `ui-${randomUUID()}`;
    const workflows = new WorkflowControl(db, new ConnectorControl(db, new FetchSandboxConnectors("http://127.0.0.1:8018", token)));
    const outbox = new TemporalOutbox(db);
    assert.equal(await outbox.tick(actor, temporal.client, queue), 1);
    const intent = (await db.query("SELECT workflow_id FROM ll_temporal_dispatch WHERE plan_id=$1", [durable])).rows[0];
    const executor = await Worker.create({ connection: temporal.nativeConnection, taskQueue: queue, workflowsPath: resolve("runtime/temporal/pinned-workflow.ts"), activities: versionedActivities(db, actor, activities(workflows, actor)), shutdownGraceTime: "1 second" });
    await executor.runUntil(async () => {
      await approveManaged(reviewer, durable);
      assert.equal(await temporal!.client.workflow.getHandle(intent.workflow_id).result(), "completed");
    });
    assert.equal(Object.keys(await effects()).length, Object.keys(effectsBeforeDurable).length + 2);
    await page.reload();
    await page.getByRole("button", { name: new RegExp(durable.slice(0, 8)) }).click();
    await expect(page.getByRole("heading", { name: "Acknowledgement verified", exact: true })).toBeVisible();
    await expect(page.getByText("Durable execution selected", { exact: true })).toBeVisible();
    await page.screenshot({ path: "docs/evidence/enquiry-temporal-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: "docs/evidence/enquiry-temporal-mobile.png", fullPage: true });
    check("Typed chat and invited UI transfer one saved run to Temporal without granting approval; second-member approvals complete exactly two effects and reload preserves ownership");
    const until=async(test:()=>Promise<boolean>,label:string,timeout=90000)=>{const start=Date.now();while(!(await test())){if(Date.now()-start>timeout)throw Error(`Timed out: ${label}`);await delay(100);}};
    const packagedService=(role:"worker"|"scheduler")=>{const child=spawn(process.execPath,[".worker/temporal-service.cjs",role],{env:{...process.env,LOOPLABS_RECOVERY_EPOCH:recoveryEpoch,LOOPLABS_DATABASE_URL:url.toString(),LOOPLABS_TEMPORAL_WORKER_TOKEN:temporalToken,LOOPLABS_TEMPORAL_ADDRESS:temporal!.address,LOOPLABS_TEMPORAL_NAMESPACE:"default",LOOPLABS_TEMPORAL_TASK_QUEUE:"scoped-ui-"+schema,LOOPLABS_TEMPORAL_BUILD_ID:recordBuildId,LOOPLABS_TEMPORAL_RECORD_BUILD_ID:recordBuildId,LOOPLABS_TEMPORAL_ALLOW_INSECURE_LOOPBACK:"true",LOOPLABS_TEMPORAL_API_KEY:"",LOOPLABS_TEMPORAL_CERT_PATH:"",LOOPLABS_TEMPORAL_KEY_PATH:"",LOOPLABS_TEMPORAL_CA_PATH:"",LOOPLABS_TEMPORAL_POLL_MS:"250",LOOPLABS_TEMPORAL_HEALTH_PORT:role==="worker"?"19340":"19341",LOOPLABS_CONNECTOR_TWIN_URL:"http://127.0.0.1:8018",LOOPLABS_CONNECTOR_TWIN_TOKEN:token,LOOPLABS_FETCHSANDBOX_BINDING:""},stdio:"ignore"});packaged.push(child);return child;};
    const ready=async(port:number)=>{try{return (await fetch(`http://127.0.0.1:${port}/health/ready`,{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}};
    let scopedWorker=packagedService("worker");packagedService("scheduler");await until(async()=>await ready(19340)&&await ready(19341),"scoped packaged readiness");
    await page.goto(origin+"/control-plane/records");
    const aliceCard=page.locator("section").filter({has:page.getByRole("heading",{name:"alice@example.test",exact:true})});
    await aliceCard.getByLabel("Agent to grant access").selectOption("email-agent");await aliceCard.getByRole("button",{name:"Grant record access",exact:true}).click();
    const [added] = await Promise.all([page.waitForResponse(r=>r.url().endsWith("/api/workspace/records")&&r.request().method()==="POST"), page.getByRole("button",{name:"Add customer record",exact:true}).click()]);assert.equal((await added).status(),200);
    const bobCard=page.locator("section").filter({has:page.getByRole("heading",{name:"bob@example.test",exact:true})});
    for(const agent of ["crm-agent","email-agent"]){await bobCard.getByLabel("Agent to grant access").selectOption(agent);await bobCard.getByRole("button",{name:"Grant record access",exact:true}).click();await expect(bobCard.getByRole("button",{name:"Revoke agent access",exact:true})).toHaveCount(agent==="crm-agent"?1:2);}
    const records=(await (await page.request.get(origin+"/api/workspace/records")).json()).records;
    const scopedPlans: {id:string;plan_hash:string;plan:{contact:{email:string};recordEnrollment:{id:string}}}[]=[];
    const beforeScoped=await effects();
    for(const recipient of ["alice@example.test","bob@example.test"]){
      const record=records.find((r:{recipient:string})=>r.recipient===recipient);
      await page.goto(origin+"/control-plane/work");await page.getByLabel("Customer record for this conversation").selectOption(record.id);
      await page.getByLabel("Your request or clarification").fill(`Check the CRM record for ${recipient}, prepare an acknowledgement, and ask me before sending. Rehearse it with FetchSandbox first.`);
      const [interpreted] = await Promise.all([page.waitForResponse(r=>r.url().includes("/api/workspace/enquiries?scope=")&&r.request().method()==="POST"), page.getByRole("button",{name:"Send request",exact:true}).click()]);const answer=await interpreted;assert.equal(answer.status(),200);const value=await answer.json();assert(value.saved);assert.equal(value.saved.plan.contact.email,recipient);scopedPlans.push(value.saved);
      await expect(page.getByText("Prepared reply to "+recipient,{exact:true})).toBeVisible();
      await page.getByLabel(/^CRM agent/).selectOption("crm-agent");await page.getByLabel(/^Messaging agent/).selectOption("email-agent");await page.getByRole("checkbox").check();
      const [submitted] = await Promise.all([page.waitForResponse(r=>r.url().includes("/api/workspace/enquiries?scope=")&&r.request().method()==="POST"), page.getByRole("button",{name:"Submit for independent approval",exact:true}).click()]);assert.equal((await submitted).status(),200);
      await expect(page.getByRole("region",{name:"Rehearsal progress"})).toBeVisible();await expect(page.getByText("To: "+recipient,{exact:true})).toBeVisible();
      const duplicate=await page.request.post(origin+"/api/workspace/enquiries?scope="+record.id,{headers:{Origin:origin},data:{operation:"submit",id:value.saved.id,planHash:value.saved.plan_hash,crmAgent:"crm-agent",emailAgent:"email-agent"}});assert.equal(duplicate.status(),200);
      assert.equal((await db.query("SELECT count(*) FROM ll_connector_actions a JOIN ll_workflow_steps s ON s.org_id=a.org_id AND s.action_id=a.id WHERE s.run_id=$1 AND a.state='held'",[value.saved.id])).rows[0].count,"2");
    }
    assert.deepEqual(await effects(),beforeScoped);
    const wrong=await page.request.post(origin+"/api/workspace/enquiries?scope="+scopedPlans[1].plan.recordEnrollment.id,{headers:{Origin:origin},data:{operation:"submit",id:scopedPlans[0].id,planHash:scopedPlans[0].plan_hash,crmAgent:"crm-agent",emailAgent:"email-agent"}});assert.equal(wrong.status(),409);
    const scopedSelf=(await run(page,scopedPlans[0].id)).steps[0];assert.equal((await page.request.post(origin+"/api/durable/connectors",{headers:{Origin:origin},data:{operation:"approve",actionId:scopedSelf.action_id,payloadHash:scopedSelf.payload_hash}})).status(),403);
    await until(async()=> (await db.query("SELECT count(*)::int n FROM ll_temporal_dispatch WHERE plan_id=ANY($1::uuid[]) AND state='started'",[scopedPlans.map(p=>p.id)])).rows[0].n===2,"two saved scoped starts");
    check("Typed real-model chat selects two enrolled records, uses explicitly granted agents, saves held exact actions idempotently and refuses recipient retargeting/self-approval; no effects before independent approval");
    scopedWorker.kill("SIGKILL");await until(async()=>scopedWorker.signalCode==="SIGKILL","confirmed scoped worker SIGKILL",10000);await stopApp();await startApp();
    await page.goto(origin+"/control-plane/work");await page.getByRole("button",{name:new RegExp(scopedPlans[0].id.slice(0,8))}).click();await expect(page.getByText("To: alice@example.test",{exact:true})).toBeVisible();
    for(const plan of scopedPlans)await approveManaged(reviewer,plan.id);
    scopedWorker=packagedService("worker");await until(()=>ready(19340),"replacement scoped worker readiness");
    for(const plan of scopedPlans)await until(async()=> (await run(page,plan.id)).state==="completed","scoped browser completion");
    const scopedRuns=[];
    for(const plan of scopedPlans){const r=await run(page,plan.id);scopedRuns.push(r);const observed=await effects();for(const step of r.steps){assert.equal(observed[step.action_id].recordId,plan.plan.contact.email==="alice@example.test"?"2001":"2002");if(step.connector==="email")assert.deepEqual(observed[step.action_id].body.to,[plan.plan.contact.email]);}const saved=(await db.query("SELECT workflow_id FROM ll_temporal_dispatch WHERE plan_id=$1",[plan.id])).rows[0];const history=await temporal.client.workflow.getHandle(saved.workflow_id).fetchHistory();await Worker.runReplayHistory({workflowsPath:resolve("runtime/temporal/pinned-workflow.ts")},history);assert(!JSON.stringify(history).includes(token));}
    const afterScoped=await effects();assert.equal(Object.keys(afterScoped).length,Object.keys(beforeScoped).length+4);
    assert((await db.query("SELECT 1 FROM ll_connector_events e JOIN ll_workflow_steps s ON s.action_id=e.action_id AND s.org_id=e.org_id WHERE s.run_id=$1 AND e.kind='uncertain'",[scopedPlans[1].id])).rows[0]);
    await page.reload();await page.getByRole("button",{name:new RegExp(scopedPlans[1].id.slice(0,8))}).click();await expect(page.getByRole("heading",{name:"Acknowledgement verified",exact:true})).toBeVisible();await expect(page.getByText("To: bob@example.test",{exact:true})).toBeVisible();
    await expect(page.getByText("Independent action approvals are still required.",{exact:false})).toHaveCount(0);
    await expect(page.getByText("Execution is subject to independent approval and effect verification.",{exact:false})).toBeVisible();
    await page.screenshot({path:"docs/evidence/scoped-chat-desktop.png",fullPage:true});await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.getByRole("region",{name:"Rehearsal progress"}).scrollIntoViewIfNeeded();
    assert(await page.locator(".cp-enquiry-progress p").evaluateAll(nodes=>nodes.every(n=>parseFloat(getComputedStyle(n).fontSize)>=16)));
    await page.screenshot({path:"docs/evidence/scoped-chat-mobile.png",fullPage:false});
    assert.deepEqual(await effects(),afterScoped);
    check("Confirmed packaged worker SIGKILL and real app restart preserve both scoped UI runs; independent approvals yield exactly four intended effects, actual lost CRM response reconciles without resend, histories replay and reload/mobile preserve exact recipients");
    // Actual exhausted allowance refusal must remain a human-readable saved draft.
    assert((await db.query("SELECT reserved FROM ll_agents WHERE id=ANY($1::text[])",[["crm-agent","email-agent"]])).rows.every(r=>r.reserved>0));
    await db.query("UPDATE ll_agents SET action_limit=reserved WHERE id=ANY($1::text[])",[["crm-agent","email-agent"]]);
    await page.setViewportSize({width:1280,height:900});await page.getByRole("button",{name:"Start a new conversation",exact:true}).click();
    await page.getByLabel("Your request or clarification").fill(enquiryRequest+" Use bob@example.test.");
    const [blockedChatResponse] = await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==="/api/workspace/enquiries"&&r.request().method()==="POST"), page.getByRole("button",{name:"Send request",exact:true}).click()]);
    const blockedPlan=(await (await blockedChatResponse).json()).saved;assert(blockedPlan?.id);
    await page.getByLabel(/^CRM agent/).selectOption("crm-agent");await page.getByLabel(/^Messaging agent/).selectOption("email-agent");await page.getByRole("checkbox").check();
    const [blockedSubmit] = await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==="/api/workspace/enquiries"&&r.request().method()==="POST"), page.getByRole("button",{name:"Submit for independent approval",exact:true}).click()]);assert.equal((await blockedSubmit).status(),403);
    await expect(page.getByRole("heading",{name:"Submission incomplete",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Confirm saved submission",exact:true})).toBeVisible();await expect(page.getByRole("region",{name:"Verification receipt"})).toHaveCount(0);
    await expect(page.getByText("Action not submitted",{exact:true})).toHaveCount(2);await expect(page.getByText("Submission incomplete · reopen and retry rehearsal",{exact:true})).toHaveCount(0);
    const blockedRun=await run(page,blockedPlan.id);assert(blockedRun.steps.every((s:{state:string|null})=>s.state===null));assert.equal((await db.query("SELECT count(*)::int n FROM ll_temporal_dispatch WHERE plan_id=$1",[blockedPlan.id])).rows[0].n,0);assert.deepEqual(await effects(),afterScoped);
    await page.reload();await page.getByRole("button",{name:new RegExp(blockedPlan.id.slice(0,8))}).click();await expect(page.getByRole("heading",{name:"Submission incomplete",exact:true})).toBeVisible();await page.setViewportSize({width:390,height:844});await page.getByRole("region",{name:"Rehearsal progress"}).scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:"docs/evidence/chat-ui-submission-blocked.png",fullPage:false});assert.deepEqual(await effects(),afterScoped);
    check("Real typed scoped chat with exhausted registered-agent allowance retains a guided Submission incomplete view after refusal/reload; no submitted actions, Temporal ownership, verification receipt or new effects; 390px layout stays readable");
    const fingerprints: Record<string, string> = {};
    for (const file of ["docker-compose.yml","deploy.sh","lib/connectors/routing.ts","lib/enquiries/submission.ts","lib/enquiries/presentation.ts","app/api/durable/connectors/route.ts","app/api/durable/workflows/route.ts","lib/connectors/catalog.ts","app/api/workspace/records/route.ts","components/control-plane/records-workspace.tsx","app/control-plane/records/page.tsx","components/control-plane/shell.tsx","lib/connectors/request.ts","lib/connectors/content.ts","lib/connectors/record-scope.ts","lib/connectors/scopes.ts","lib/connectors/scope-schema.sql","lib/enquiries/record-routing-schema.sql","runtime/temporal/record-routing.ts","runtime/temporal/outbox.ts","runtime/temporal/version-contract.ts","lib/enquiries/runner.ts","lib/durable/proposal-schema.sql","lib/refunds/schema.sql","next.config.mjs", "lib/connectors/contracts.ts", "lib/connectors/twin.ts", "lib/connectors/hosted.ts", "lib/workflows/guard.ts", "lib/durable/recovery.ts", "lib/durable/recovery-schema.sql", "lib/durable/service.ts","lib/workspace/identity.ts", "lib/enquiries/chat.ts", "lib/enquiries/chat-contract.ts", "lib/enquiries/service.ts", "app/api/workspace/enquiries/route.ts", "components/control-plane/enquiry-workspace.tsx", "components/control-plane/workflow-workspace.tsx", "lib/workflows/service.ts", "app/control-plane/control-plane.css", "components/marketing/chrome.tsx", "components/control-plane/access.tsx", "scripts/chat-ui-proof.ts", "lib/enquiries/dispatch.ts", "lib/enquiries/runner.ts", "lib/enquiries/managed-schema.sql", "components/control-plane/enquiry-progress.tsx", "components/control-plane/enquiry-execution.tsx", "app/api/workspace/enquiries/execution/route.ts", "scripts/enquiry-worker.ts", "lib/workspace/agents.ts", "lib/connectors/service.ts"])
      fingerprints[file] = createHash("sha256").update(await readFile(file)).digest("hex");
    await writeFile("docs/evidence/chat-ui-proof.json", JSON.stringify({ at: new Date().toISOString(), scope: "Real browser, real Amazon Bedrock Nova Lite interpretation, isolated PostgreSQL and private FetchSandbox provider twins. No live CRM or real email delivery.", checks, typedRequest: enquiryRequest, observedRuns: observed, providerEffects: legacyEffects, scopedRuns,blockedRun,scopedEffects:Object.fromEntries(Object.entries(afterScoped).filter(([id])=>!beforeScoped[id])),managedRuns, managedProviderEffects: await effects(), sourceFingerprints: fingerprints, unsupported: ["Hosted CRM-to-email execution: atomic CRM contact-version enforcement remains unavailable; hosted proof must keep downstream held.", "General workflows, inbox listeners, schedules, arbitrary recipients, real email, durable conversation memory and live-provider readiness."] }, null, 2) + "\n");
  } finally {
    for(const child of packaged)if(child.exitCode===null&&!child.signalCode){child.kill("SIGTERM");for(let i=0;i<250 && child.exitCode===null&&!child.signalCode;i++)await delay(100);if(child.exitCode===null&&!child.signalCode)throw Error("Packaged child failed to shut down");}
    await temporal?.teardown(); await browser?.close(); await stopWorker(); await stopApp(); if (twin?.pid) { twin.kill("SIGTERM"); await delay(400); }
    await db.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); await rm(dir, { recursive: true, force: true });
  }
}
main().catch(e => { console.error("Chat UI proof failed:", e.message); process.exitCode = 1; });
