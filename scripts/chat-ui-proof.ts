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
import { enquiryRequest } from "../lib/enquiries/chat-contract";
const origin = "http://localhost:3107", delay = (ms: number) => new Promise(r => setTimeout(r, ms));
async function main() {
  if (!process.env.LOOPLABS_TEST_DATABASE_URL) throw Error("Dedicated test PostgreSQL required.");
  await mkdir(".local", { recursive: true, mode: 0o700 });
  const dir = await mkdtemp(resolve(".local/chat-ui-proof-"));
  const schema = `chat_ui_${randomBytes(8).toString("hex")}`, token = randomBytes(32).toString("base64url"), password = randomBytes(24).toString("base64url");
  const admin = new Pool({ connectionString: process.env.LOOPLABS_TEST_DATABASE_URL });
  const db = new Pool({ connectionString: process.env.LOOPLABS_TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  let app: ChildProcess | undefined, twin: ChildProcess | undefined, browser: Browser | undefined;
  const checks: { name: string; passed: boolean }[] = [], observed: object[] = [];
  const check = (name: string) => { checks.push({ name, passed: true }); console.log(`PASS ${name}`); };
  const url = new URL(process.env.LOOPLABS_TEST_DATABASE_URL); url.searchParams.set("options", `-c search_path=${schema}`);
  async function startApp() {
    app = spawn("pnpm", ["exec", "next", "start", "-p", "3107"], { detached: true, env: { ...process.env, LOOPLABS_DURABLE_ORIGIN: "", LOOPLABS_DATABASE_URL: url.toString(), LOOPLABS_FETCHSANDBOX_BINDING: "", LOOPLABS_CONNECTOR_TWIN_URL: "http://127.0.0.1:8018", LOOPLABS_CONNECTOR_TWIN_TOKEN: token, LOOPLABS_CHAT_MODEL: "us.amazon.nova-lite-v1:0" }, stdio: ["ignore", "pipe", "pipe"] });
    for (let i = 0; i < 100; i++) { try { if ((await fetch(origin + "/sign-in")).ok) return; } catch {} await delay(100); }
    throw Error("UI app unavailable");
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
    const signedIn = page.waitForResponse(r => r.url().endsWith("/api/workspace/session") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
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
    const result = page.waitForResponse(r => r.url().endsWith("/api/workspace/enquiries") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Send request", exact: true }).click();
    const response = await result; assert.equal(response.status(), 200); return response.json();
  }
  async function prepare(page: Page) {
    await page.goto(origin + "/control-plane/work");
    assert((await chat(page, enquiryRequest)).clarification);
    const { saved } = await chat(page, "Use customer@example.test for this rehearsal. Keep ask-first approval.");
    assert(saved?.id); assert.equal(saved.run_id, null);
    assert.equal((await db.query("SELECT count(*) FROM ll_workflow_runs WHERE id=$1", [saved.id])).rows[0].count, "0");
    await expect(page.getByRole("heading", { name: "2. Review this exact plan" })).toBeVisible();
    await page.getByLabel(/^CRM agent/).selectOption("crm-agent"); await page.getByLabel(/^Messaging agent/).selectOption("email-agent");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create this reviewed workflow" }).click();
    await expect(page.getByRole("heading", { name: /Customer handoff/ })).toBeVisible();
    return saved;
  }
  function step(page: Page, ordinal: number) { return page.locator("article").filter({ has: page.getByRole("heading", { name: ordinal === 1 ? /^1\. Set/ : /^2\. Send/ }) }); }
  async function clickAction(page: Page, ordinal: number, name: string) {
    const result = page.waitForResponse(r => r.url().endsWith("/api/durable/connectors") && r.request().method() === "POST");
    await step(page, ordinal).getByRole("button", { name, exact: true }).click(); return result;
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
    for (const file of ["lib/durable/schema.sql", "lib/workspace/schema.sql", "lib/connectors/schema.sql", "lib/workflows/schema.sql", "lib/enquiries/schema.sql"]) await db.query(await readFile(file, "utf8"));
    await db.query("INSERT INTO ll_orgs(id) VALUES('local-proof')");
    for (const [email, name] of [["requester@example.test", "Requester"], ["reviewer@example.test", "Reviewer"]]) await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES($1,'local-proof',$2,$3)", [email, name, passwordHash(password)]);
    await db.query("INSERT INTO ll_connector_policies(org_id,connector) VALUES('local-proof','crm'),('local-proof','email')");
    for (const [id, tool] of [["crm-agent", "twin.crm"], ["email-agent", "twin.email"]]) {
      await db.query("INSERT INTO ll_agents(org_id,id,tools,action_limit) VALUES('local-proof',$1,$2,100)", [id, [tool]]);
      await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'local-proof',$2,'agent')", [tokenHash(randomBytes(32).toString("base64url")), id]);
    }
    await writeFile(`${dir}/connector-twin-credentials.json`, JSON.stringify({ token }), { mode: 0o600 });
    const backend = process.env.FETCHSANDBOX_BACKEND_PATH || `${process.env.HOME}/sandbox/backend`;
    twin = spawn(`${backend}/.venv/bin/python`, ["scripts/connector-twin.py"], { env: { ...process.env, LOOPLABS_CONNECTOR_STATE_DIR: dir }, stdio: ["ignore", "pipe", "pipe"] });
    for (let i = 0; i < 100; i++) { try { if ((await fetch("http://127.0.0.1:8018/crm/crm/v3/objects/contacts/1001", { headers: { Authorization: `Bearer ${token}` } })).ok) break; } catch {} await delay(100); }
    await startApp(); browser = await chromium.launch({ headless: true });
    const requester = await browser.newContext(), reviewerContext = await browser.newContext();
    const page = await requester.newPage(), reviewer = await reviewerContext.newPage();
    await login(page, "requester@example.test"); await login(reviewer, "reviewer@example.test");
    check("Sign-in navigation generates no background route prefetch burst for either member");
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
    const fingerprints: Record<string, string> = {};
    for (const file of ["lib/enquiries/chat.ts", "lib/enquiries/chat-contract.ts", "lib/enquiries/service.ts", "app/api/workspace/enquiries/route.ts", "components/control-plane/enquiry-workspace.tsx", "components/control-plane/workflow-workspace.tsx", "lib/workflows/service.ts", "app/control-plane/control-plane.css", "components/marketing/chrome.tsx", "components/control-plane/access.tsx", "scripts/chat-ui-proof.ts"])
      fingerprints[file] = createHash("sha256").update(await readFile(file)).digest("hex");
    await writeFile("docs/evidence/chat-ui-proof.json", JSON.stringify({ at: new Date().toISOString(), scope: "Real browser, real Amazon Bedrock Nova Lite interpretation, isolated PostgreSQL and private FetchSandbox provider twins. No live CRM or real email delivery.", checks, typedRequest: enquiryRequest, observedRuns: observed, providerEffects: await effects(), sourceFingerprints: fingerprints, unsupported: ["Hosted CRM-to-email execution: atomic CRM contact-version enforcement remains unavailable; hosted proof must keep downstream held.", "General workflows, inbox listeners, schedules, arbitrary recipients, real email, durable conversation memory and live-provider readiness."] }, null, 2) + "\n");
  } finally {
    await browser?.close(); await stopApp(); if (twin?.pid) { twin.kill("SIGTERM"); await delay(400); }
    await db.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); await rm(dir, { recursive: true, force: true });
  }
}
main().catch(e => { console.error("Chat UI proof failed:", e.message); process.exitCode = 1; });
