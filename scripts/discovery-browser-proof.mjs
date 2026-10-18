import {constructInstalledDiscoveryRegistry as discoveryInstalledConstruction,validateInstalledProofConstruction} from './current-proof-source-registry.mjs';
// Disposable loopback UI proof. CLI/HTTP fixtures are not native cloud/account
// evidence, and accepting this test certificate is not production TLS acceptance.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm, access, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { chromium, expect } from "@playwright/test";
import { canonicalProjectScan } from "../lib/workspace/cloud-project-evidence.ts";
import { passwordHash } from "../lib/workspace/auth.ts";
import { scopedPoolOptions } from "../lib/durable/pg-transport.ts";
import { installTenantRoles } from "../lib/workspace/tenant-installer.ts";
import { verifyTenantInventory } from "../lib/workspace/tenant-read-inventory.ts";
import { scopedMigrations } from "../runtime/temporal/staging-preflight.ts";
import { browserCertificates, browserTLSBridge } from "./staging-browser-tls.mjs";
const wait = ms => new Promise(r => setTimeout(r, ms));
const sourceConstruction = () => discoveryInstalledConstruction();
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
async function fingerprints() { return Object.fromEntries(await Promise.all(Object.keys(sourceConstruction().sourceFingerprints).map(async path => [path, hash(await readFile(path))]))); }
async function port() { const s = createServer(); await new Promise((r, j) => { s.once("error", j); s.listen(0, "127.0.0.1", r); }); const p = s.address().port; await new Promise(r => s.close(r)); return p; }
async function stop(child) { if (!child || child.exitCode !== null || child.signalCode !== null) return; child.kill("SIGTERM"); await Promise.race([new Promise(r => child.once("exit", r)), wait(2000)]); if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await Promise.race([new Promise(r => child.once("exit", r)), wait(2000)]); } assert(child.exitCode !== null || child.signalCode !== null, "Owned UI process did not stop"); }
export async function discoveryBrowserProof(outputDirectory) {
  assert(process.env.LOOPLABS_DISCOVERY_BROWSER_PROOF === "isolated", "Explicit disposable discovery browser opt-in required");
  assert(process.env.LOOPLABS_TEST_DATABASE_URL, "Dedicated test PostgreSQL required; never skip");
  const url = new URL(process.env.LOOPLABS_TEST_DATABASE_URL);
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Loopback test database required");
  assert(typeof outputDirectory === "string" && outputDirectory.startsWith("/") && !outputDirectory.split("/").includes(".."), "Explicit private absolute evidence directory required");
  validateInstalledProofConstruction();
  await access(".next/BUILD_ID"); await mkdir(outputDirectory, { mode: 0o700 });
  const construction = sourceConstruction(), constructionRegistrySha256 = hash(await readFile("scripts/current-installed-proof-sources.json")), before = await fingerprints(), dir = await realpath(await mkdtemp(join(tmpdir(), "ll-discovery-ui-"))), suffix = randomBytes(8).toString("hex"), schema = `discovery_ui_${suffix}`, epoch = randomUUID();
  const transport = JSON.parse(await readFile(process.env.LOOPLABS_PROOF_TRANSPORT_FILE));
  assert.equal(transport.mode, "verified-tls");
  const db = new Pool(await scopedPoolOptions({url:url.toString(),schema:"public",purpose:"installer",transport}));
  const roleIds=[];let generation,schemaOid,installation; let scoped, server, tls, browser, receipt, schemaCreated = false, phase = "prepare";
  const org = `discovery-${suffix}`, otherOrg = `other-${suffix}`, account = "123456789012", connection = "aws-123456789012-us-west-2";
  const owner = { email: "owner@example.test", password: randomBytes(32).toString("base64url") }, other = { email: "other@example.test", password: randomBytes(32).toString("base64url") };
  try {
    await db.query(`CREATE SCHEMA ${schema}`); schemaCreated = true;
    schemaOid=(await db.query("SELECT oid::text oid FROM pg_namespace WHERE nspname=$1",[schema])).rows[0].oid;
    scoped=new Pool(await scopedPoolOptions({url:url.toString(),schema,purpose:"installer",transport}));
    await scoped.query("CREATE TABLE ll_migrations(version integer PRIMARY KEY,digest text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())");
    for(const f of JSON.parse(await readFile("install-order.json")))await scoped.query(await readFile(f,"utf8"));
    await scoped.query(await readFile("lib/connectors/quote-action-schema.sql","utf8"));
    await scoped.query("INSERT INTO ll_orgs(id) VALUES($1),($2)", [org, otherOrg]);
    await scoped.query("INSERT INTO ll_workspace_recovery(org_id,epoch) VALUES($1,$3),($2,$3)", [org, otherOrg, epoch]);
    for (const [member, tenant] of [[owner, org], [other, otherOrg]]) await scoped.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES($1,$2,'Discovery evaluator',$3)", [member.email, tenant, passwordHash(member.password)]);
    const accountable = "accountable@example.test";
    await scoped.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES($1,$2,'Accountable Owner','fixture-no-sign-in')", [accountable,org]);
    await scoped.query((await readFile("lib/durable/tenant-boundary-prototype-schema.sql","utf8")).replaceAll("__SCHEMA__",schema));
    const ledger=await Promise.all([...scopedMigrations,...[[14,"lib/enquiries/worker-admission-schema.sql"],[15,"lib/enquiries/reset-intent-schema.sql"],[16,"lib/workspace/cloud-inventory-schema.sql"],[17,"lib/workspace/cloud-project-schema.sql"],[18,"lib/workspace/cloud-owner-review-schema.sql"]]].map(async([version,file])=>({version,digest:hash(await readFile(file))})));
    for(const m of ledger)await scoped.query("INSERT INTO ll_migrations(version,digest)VALUES($1,$2)",[m.version,m.digest]);
    const verify=async p=>verifyTenantInventory({tables:(await p.query("SELECT c.relname name,c.relrowsecurity rls,c.relforcerowsecurity force,ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum) columns FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','p')",[schema])).rows,migrations:(await p.query("SELECT version,digest FROM ll_migrations")).rows},ledger);
    generation=join(dir,"tenant-generation");
    const installed=await installTenantRoles(url.toString(),{transport,installation:"d"+suffix,schema,database:url.pathname.slice(1),ownerRole:(await scoped.query("SELECT current_user role")).rows[0].role,tenants:[{org,epoch},{org:otherOrg,epoch}],salesOrg:org},generation,verify);
    for(const name of Object.keys(installed.roles))roleIds.push({name,oid:(await db.query("SELECT oid::text oid FROM pg_roles WHERE rolname=$1",[name])).rows[0].oid});
    assert.equal(installed.activated,false);
    installation={contract:"installed-discovery-boundary-1",schema,schemaOid,epochs:[{org,epoch},{org:otherOrg,epoch}].sort((a,b)=>a.org.localeCompare(b.org)),roles:roleIds.map(x=>({...x})),normalProductionInstrumentation:true};
    const reviewed = [];
    const runtimeId = "operations_customer_support_runtime-1234567890";
    const scope = { tenantId: org, connectionId: connection, accountId: account, region: "us-west-2" }, runtime = { agentRuntimeId: runtimeId, agentRuntimeArn: `arn:aws:bedrock-agentcore:us-west-2:${account}:runtime/${runtimeId}`, agentRuntimeVersion: "1" };
    const cli = join(dir, "aws-fixture"), binding = join(dir, "binding.json"), activitySource = join(dir, "activity-source.json");
    await writeFile(activitySource, JSON.stringify({ scope, runtimeArn: runtime.agentRuntimeArn, version: "1", logGroup: `/aws/bedrock-agentcore/runtimes/${runtimeId}-DEFAULT` }), { mode: 0o600 });
    const invocation = { eventId: "fixture-event-one", timestamp: Date.now(), message: JSON.stringify({ resource_arn: runtime.agentRuntimeArn, account_id: account, operation: "InvokeAgentRuntime", request_id: "fixture-request-one", session_id: "fixture-session-one", request_payload: "PRIVATE_FIXTURE_DO_NOT_RETAIN" }) };
    await writeFile(cli, `#!/bin/sh\ncase "$2" in\nget-caller-identity) printf '%s' '${JSON.stringify({ Account: account })}' ;;\nlist-agent-runtimes) printf '%s' '${JSON.stringify({ agentRuntimes: [runtime], nextToken: null })}' ;;\nget-agent-runtime) printf '%s' '${JSON.stringify(runtime)}' ;;\nfilter-log-events) printf '%s' '${JSON.stringify({ events: [invocation] })}' ;;\n*) exit 1 ;;\nesac\n`, { mode: 0o700 });
    await writeFile(binding, JSON.stringify({ scope, executable: cli, session: { accessKeyId: `ASIA${"A".repeat(16)}`, secretAccessKey: "b".repeat(40), sessionToken: "c".repeat(40), expiresAt: new Date(Date.now() + 600000).toISOString() } }), { mode: 0o600 });
    const azureCli = join(dir, "az-fixture"), azureConfig = join(dir, "azure-config"), azureBinding = join(dir, "azure-binding.json");
    const azureScope = { provider: "azure-foundry", tenantId: org, connectionId: "operations-azure", directoryId: "12345678-1234-1234-1234-123456789012", endpoint: "https://company.services.ai.azure.com/api/projects/ops" };
    await mkdir(azureConfig, { mode: 0o700 });
    await writeFile(azureCli, `#!/bin/sh\nif [ "$1" = cloud ]; then printf '%s' '${JSON.stringify({ name: "AzureCloud", authority: "https://login.microsoftonline.com", management: "https://management.azure.com/" })}'; else printf '%s' '${JSON.stringify({ token: "DUMMY_AZURE_BROWSER_READ_TOKEN_123456", expires: Math.floor(Date.now() / 1000) + 600, tenant: azureScope.directoryId, type: "Bearer" })}'; fi\n`, { mode: 0o700 });
    const upstreamPort = await port(), tlsPort = await port(), origin = `https://looplabs-staging.example.test:${tlsPort}`;
    tls = browserTLSBridge(await browserCertificates(join(dir, "tls")), { port: tlsPort, upstreamPort }); await new Promise((r, j) => { tls.once("error", j); tls.listen(tlsPort, "127.0.0.1", r); });
    server = spawn(process.execPath, ["--import", "./scripts/discovery-azure-http-fixture.mjs", "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "-p", String(upstreamPort)], { stdio: "ignore", env: { PATH: process.env.PATH, HOME: dir, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", LOOPLABS_TENANT_WEB_CONFIG: join(generation,"web.json"), LOOPLABS_TEST_DATABASE_URL: "", LOOPLABS_DURABLE_ORIGIN: origin, LOOPLABS_TEMPORAL_WORKSPACE: "staging", LOOPLABS_WORKSPACE_ID: org, LOOPLABS_RECOVERY_EPOCH: epoch, LOOPLABS_CLOUD_DISCOVERY_BINDING_FILE: binding, LOOPLABS_CLOUD_ACTIVITY_SOURCE_FILE: activitySource, LOOPLABS_AZURE_DISCOVERY_BINDING_FILE: azureBinding, LOOPLABS_DISCOVERY_BROWSER_PROOF: "isolated", AWS_ACCESS_KEY_ID: "", AWS_SECRET_ACCESS_KEY: "", AWS_SESSION_TOKEN: "", LOOPLABS_CHAT_MODEL: "", LOOPLABS_TEMPORAL_ADDRESS: "" } });
    phase = "server-ready";
    let ready = false;
    for (let i = 0; i < 80; i++) { assert(server.exitCode === null, "Owned UI server exited"); try { if ((await fetch(`http://127.0.0.1:${upstreamPort}/sign-in`, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {} await wait(250); }
    assert(ready, "Owned UI server did not become ready");
    let executablePath = chromium.executablePath(); try { await access(executablePath); } catch { executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; await access(executablePath); }
    browser = await chromium.launch({ headless: true, executablePath, args: ["--no-proxy-server", "--host-resolver-rules=MAP looplabs-staging.example.test 127.0.0.1"] });
    async function context(viewport) {
      const c = await browser.newContext({ viewport, ignoreHTTPSErrors: true });
      await c.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort()); return c;
    }
    const desktop = await context({ width: 1440, height: 1000 }), mobile = await context({ width: 390, height: 844 }), outsider = await context({ width: 1280, height: 900 }), anonymous = await context({ width: 390, height: 844 });
    const api = (page, path, data) => page.evaluate(async ({ path, data }) => { const r = await fetch(path, { ...(data ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : {}) }); return { status: r.status, value: await r.json() }; }, { path, data });
    async function login(page, member) {
      await page.goto(`${origin}/sign-in?next=/control-plane/discovery`); await page.getByLabel("Email", { exact: true }).fill(member.email); await page.getByLabel("Password", { exact: true }).fill(member.password);
      const response = page.waitForResponse(r => r.url().endsWith("/api/workspace/session") && r.request().method() === "POST"); await page.getByRole("button", { name: "Sign in", exact: true }).click(); assert.equal((await response).status(), 200);
      await expect(page.getByRole("heading", { name: "Discover agents", exact: true })).toBeVisible();
      await expect(page.locator(".cp-topbar")).toContainText("Cloud inventory"); await expect(page.locator(".cp-topbar")).toContainText("Saved controls");
      const cookie = (await page.context().cookies()).find(c => c.name === "looplabs_workspace_session"); assert(cookie?.httpOnly && cookie.secure && cookie.sameSite === "Strict");
    }
    async function reviewOwner(page, provider) {
      phase=`${provider}-owner-open`;
      const statusResponse=page.waitForResponse(r=>r.url().includes("/api/workspace/discovery/owners?") && r.request().method()==="GET");
      await page.getByText("Review accountable owner", {exact:true}).click();
      const statusRead=await statusResponse; phase=`${provider}-owner-status-${statusRead.status()}`;
      const statusValue=await statusRead.json(); if(statusRead.status()!==200) console.error(JSON.stringify({ownerReviewStatus:statusRead.status(),safeApiError:statusValue.error}));
      assert.equal(statusRead.status(),200);
      const directory=await api(page,"/api/workspace/discovery/owners"); assert.equal(directory.status,200);
      phase=`${provider}-owner-load`;
      await expect(page.getByText("No accountable owner has been reviewed.", {exact:true})).toBeVisible();
      assert(directory.value.owners.some(p=>p.email===accountable),"Active invited accountable owner must be listed");
      phase=`${provider}-owner-choose`;
      await page.getByLabel("Invited owner", {exact:true}).selectOption(accountable);
      phase=`${provider}-owner-save`;
      const response=page.waitForResponse(r=>r.url().endsWith("/api/workspace/discovery/owners") && r.request().method()==="POST");
      await page.getByRole("button", {name:"Save owner review",exact:true}).click();
      const saved=await response; assert.equal(saved.status(),200);
      const decision=saved.request().postDataJSON(); assert.equal(decision.provider,provider); reviewed.push(decision);
      phase=`${provider}-owner-refresh`;
      await expect(page.getByText(`Owner reviewed: ${accountable}`,{exact:true})).toBeVisible();
      assert.equal((await api(page,"/api/workspace/discovery/owners",decision)).value.repeated,true);
      assert.equal((await api(page,"/api/workspace/discovery/owners",{...decision,owner:owner.email})).status,409);
      assert.equal((await api(page,"/api/workspace/discovery/owners",{...decision,authorityGranted:true})).status,400);
    }
    phase = "anonymous-gate"; const anon = await anonymous.newPage(); await anon.goto(`${origin}/control-plane/discovery`); await expect(anon.getByRole("heading", { name: "Discover agents", exact: true })).toHaveCount(0); assert.equal((await api(anon, "/api/workspace/discovery")).status, 401);
    phase = "desktop-configuration"; const page = await desktop.newPage(); await login(page, owner);
    await page.getByLabel("AWS account ID").fill(account); await page.getByLabel("AWS region").fill("us-west-2"); await page.getByRole("button", { name: "Save AWS account", exact: true }).click();
    await expect(page.getByText("AWS account scope saved.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Open account", exact: true }).click(); await expect(page.getByText("No discovery scan has been saved.", { exact: false })).toBeVisible();
    phase = "desktop-scan"; const scanned = page.waitForResponse(r => r.url().endsWith("/api/workspace/discovery") && r.request().method() === "POST"); await page.getByRole("button", { name: "Discover agents in AWS", exact: true }).click(); assert.equal((await scanned).status(), 200);
    const friendlyName = "operations customer support runtime";
    await expect(page.getByRole("heading", { name: friendlyName, exact: true })).toBeVisible(); await expect(page.getByText("Discovered · controls not enabled", { exact: true })).toBeVisible(); await expect(page.locator("pre")).toHaveCount(0);
    await page.getByRole("button", { name: "Review agent", exact: true }).click();
    await page.getByText("Agent identity and source", { exact: true }).click(); await expect(page.getByText(runtime.agentRuntimeArn, { exact: true })).toBeVisible(); await page.getByText("Agent identity and source", { exact: true }).click();
    phase = "aws-activity"; const activityRead = page.waitForResponse(r => r.url().endsWith("/api/workspace/discovery/activity") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Check last 15 minutes", exact: true }).click(); const activityResponse = await activityRead; assert.equal(activityResponse.status(), 200);
    const activityResult = await activityResponse.json(); assert.equal(activityResult.retention, "request-only"); assert.equal(activityResult.enforcement, "unverified"); assert.equal(activityResult.observations.length, 1); assert(!JSON.stringify(activityResult).includes("PRIVATE_FIXTURE"));
    await expect(page.getByText("Agent invocation reported", {exact:true})).toBeVisible();
    await page.getByRole("button", { name: "Continue to control setup", exact: true }).click(); await expect(page.getByRole("button", { name: "Enable controls · setup required", exact: true })).toBeDisabled();
    phase="aws-owner-review"; await reviewOwner(page,"aws-agentcore-runtime");
    await page.evaluate(() => window.scrollTo(0, 0)); await wait(100); await page.screenshot({ path: join(outputDirectory, "desktop.png"), fullPage: true });
    phase = "refresh-persistence"; await page.reload(); await page.getByRole("button", { name: "Open account", exact: true }).click(); await expect(page.getByRole("heading", { name: friendlyName, exact: true })).toBeVisible();
    phase = "expired-binding"; const currentBinding = JSON.parse(await readFile(binding, "utf8")); await writeFile(binding, JSON.stringify({ ...currentBinding, session: { ...currentBinding.session, expiresAt: new Date(0).toISOString() } }));
    const refused = page.waitForResponse(r => r.url().endsWith("/api/workspace/discovery") && r.request().method() === "POST"); await page.getByRole("button", { name: "Discover agents in AWS", exact: true }).click(); const refusalStatus = (await refused).status(); phase = `expired-binding-status-${refusalStatus}`; assert.equal(refusalStatus, 503); phase = "expired-binding-alert"; await wait(200); await page.screenshot({ path: join(outputDirectory, "expired-access.png"), fullPage: true }); await expect(page.locator(".cp-durable-message.is-error[role=alert]")).toContainText("Read-only cloud access is unavailable");
    phase = "expired-binding-preserved-evidence"; await page.getByRole("button", { name: "Refresh agent list", exact: true }).click(); await expect(page.getByRole("heading", { name: friendlyName, exact: true })).toBeVisible(); await writeFile(binding, JSON.stringify(currentBinding));
    phase = "mobile"; const phone = await mobile.newPage(); await login(phone, owner); await phone.getByRole("button", { name: "Open navigation", exact: true }).click(); await expect(phone.getByRole("link", { name: "Cloud inventory", exact: true })).toBeVisible(); await phone.getByRole("link", { name: "Cloud inventory", exact: true }).click(); await expect(phone.getByRole("button", { name: "Close navigation", exact: true })).toHaveCount(0);
    const geometry = await phone.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth, inputSize: getComputedStyle(document.querySelector('input[name="accountId"]')).fontSize })); assert(geometry.width <= geometry.viewport + 1, "Mobile page overflows viewport"); assert(parseFloat(geometry.inputSize) >= 16, "Mobile inputs risk small text/zoom");
    await phone.getByRole("button", { name: "Open account", exact: true }).click(); await expect(phone.getByRole("heading", { name: friendlyName, exact: true })).toBeVisible(); await phone.getByRole("button", { name: "Review agent", exact: true }).click(); await phone.getByRole("button", { name: "Continue to control setup", exact: true }).click();
    await phone.getByText("Review accountable owner",{exact:true}).click(); await expect(phone.getByText(`Owner reviewed: ${accountable}`,{exact:true})).toBeVisible();
    await phone.evaluate(() => window.scrollTo(0, 0)); await wait(100); await phone.screenshot({ path: join(outputDirectory, "mobile.png"), fullPage: true });
    // Azure uses actual UI/API/CLI with controlled HTTP; Google uses normalized DB evidence. Neither is a native cloud read.
    for (const provider of ["azure-foundry", "google-agent-engine"]) {
      phase = `project-${provider}`; await page.getByLabel("Cloud provider").selectOption(provider);
      const projectConnection = provider === "azure-foundry" ? "operations-azure" : "operations-google";
      await page.getByLabel("Connection name").fill(projectConnection);
      const scope = provider === "azure-foundry" ? { provider, tenantId: org, connectionId: projectConnection, directoryId: "12345678-1234-1234-1234-123456789012", endpoint: "https://company.services.ai.azure.com/api/projects/ops" }
        : { provider, tenantId: org, connectionId: projectConnection, projectId: "company-agents", projectNumber: "123456789012", location: "us-central1" };
      if (provider === "azure-foundry") { await page.getByLabel("Directory ID").fill(scope.directoryId); await page.getByLabel("Foundry project endpoint").fill(scope.endpoint); }
      else { await page.getByLabel("Project ID", { exact: true }).fill(scope.projectId); await page.getByLabel("Project number").fill(scope.projectNumber); await page.getByLabel("Location", { exact: true }).fill(scope.location); }
      await page.getByRole("button", { name: "Save project scope", exact: true }).click(); await expect(page.getByText("Project scope saved.", { exact: false })).toBeVisible();
      await page.getByRole("button", { name: "Review saved project evidence", exact: true }).click(); await expect(page.getByText("No project scan has been saved.", { exact: false })).toBeVisible(); await expect(page.getByRole("button", { name: "Scan cloud inventory", exact: true })).toHaveCount(0); await expect(page.getByRole("button", { name: "Scan project inventory", exact: true })).toHaveCount(0);
      const at = new Date().toISOString(), resource = provider === "azure-foundry" ? `${scope.endpoint}/agents/customer-ops/versions/1` : `projects/${scope.projectNumber}/locations/${scope.location}/reasoningEngines/1234`;
      if (provider === "azure-foundry") {
        await writeFile(azureBinding, JSON.stringify({ scope: azureScope, executable: azureCli, configDirectory: azureConfig }), { mode: 0o600 });
        await page.reload(); await page.getByLabel("Cloud provider").selectOption(provider); await expect(page.getByRole("button", { name: "Scan project inventory", exact: true })).toBeVisible();
        const response = page.waitForResponse(r => r.url().endsWith("/api/workspace/discovery") && r.request().method() === "POST");
        await page.getByRole("button", { name: "Scan project inventory", exact: true }).click(); assert.equal((await response).status(), 200);
        await expect(page.getByText("API traversal completed within the saved project scope.", { exact: false })).toBeVisible();
        const rows = (await scoped.query("SELECT * FROM ll_cloud_project_observations WHERE org_id=$1 AND connection_id=$2", [org, projectConnection])).rows;
        assert.equal(rows.length, 1); assert(!JSON.stringify(rows).includes("PRIVATE_FIXTURE")); assert(!JSON.stringify(rows).includes("DUMMY_AZURE"));
        const original = JSON.parse(await readFile(azureBinding, "utf8")); await writeFile(azureBinding, JSON.stringify({ ...original, scope: { ...azureScope, directoryId: "22222222-2222-4222-8222-222222222222" } }));
        const refused = page.waitForResponse(r => r.url().endsWith("/api/workspace/discovery") && r.request().method() === "POST");
        await page.getByRole("button", { name: "Scan project inventory", exact: true }).click(); assert.equal((await refused).status(), 503);
        await expect(page.locator(".cp-durable-message.is-error[role=alert]")).toContainText("Reviewed Azure discovery access is unavailable");
        await writeFile(azureBinding, JSON.stringify(original));
      } else {
      const value = canonicalProjectScan({ scope, observedAt: at, completeness: "partial", failures: ["detail-unavailable"], records: [{ scope, resource, version: provider === "azure-foundry" ? "1" : null, identityKind: "unknown", identityReference: null, observedAt: at, gaps: ["workload-principal-unresolved", ...(provider === "google-agent-engine" ? ["execution-version-unresolved"] : []), "effective-permissions-unknown", "declared-tools-unknown"], coverage: { ownership: "unmapped", activity: "unconnected", enforcement: "unverified" } }] });
      const scanId = randomUUID(); await scoped.query("INSERT INTO ll_cloud_project_scans(org_id,connection_id,id,observed_at,completeness,failures,canonical_sha256) VALUES($1,$2,$3,$4,$5,$6,$7)", [org, projectConnection, scanId, at, value.completeness, value.failures, hash(JSON.stringify(value))]);
      await scoped.query("INSERT INTO ll_cloud_project_observations(org_id,connection_id,scan_id,resource,provider_version,identity_kind) VALUES($1,$2,$3,$4,$5,'unknown')", [org, projectConnection, scanId, resource, provider === "azure-foundry" ? "1" : ""]);
      }
      await page.reload(); await page.getByLabel("Cloud provider").selectOption(provider); await page.getByRole("button", { name: "Review saved project evidence", exact: true }).click();
      await expect(page.getByText(provider === "azure-foundry" ? "API traversal completed within the saved project scope." : "Partial scan:", { exact: false })).toBeVisible(); await expect(page.getByText(provider === "azure-foundry" ? "Provider version 1" : "Execution version unresolved", { exact: false })).toBeVisible(); await expect(page.locator("pre")).toHaveCount(0);
      await page.getByText("Identity references", { exact: true }).click(); await expect(page.getByText(`Resource: ${resource}`, { exact: true })).toBeVisible(); await page.getByText("Identity references", { exact: true }).click();
      phase=`${provider}-owner-review`; await reviewOwner(page,provider);
      await page.evaluate(() => window.scrollTo(0, 0)); await wait(100); assert((await page.locator(".cp-skip").boundingBox()).y < 0, "Unfocused skip link should be outside the viewport");
      await page.screenshot({ path: join(outputDirectory, provider === "azure-foundry" ? "azure-desktop.png" : "project-desktop.png"), fullPage: true });
    }
    await phone.getByLabel("Cloud provider").selectOption("google-agent-engine"); await phone.getByRole("button", { name: "Review saved project evidence", exact: true }).click(); await expect(phone.getByText("Execution version unresolved", { exact: false })).toBeVisible();
    await phone.getByText("Review accountable owner",{exact:true}).click(); await expect(phone.getByText(`Owner reviewed: ${accountable}`,{exact:true})).toBeVisible();
    const projectGeometry = await phone.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth, inputSize: getComputedStyle(document.querySelector('input[name="projectId"]')).fontSize })); assert(projectGeometry.width <= projectGeometry.viewport + 1); assert(parseFloat(projectGeometry.inputSize) >= 16);
    await phone.evaluate(() => window.scrollTo(0, 0)); await wait(100); assert((await phone.locator(".cp-skip").boundingBox()).y < 0, "Unfocused mobile skip link should be outside the viewport");
    await phone.screenshot({ path: join(outputDirectory, "project-mobile.png"), fullPage: true });
    phase = "azure-mobile-saved-scan"; await phone.getByLabel("Cloud provider").selectOption("azure-foundry"); await phone.getByRole("button", { name: "Review saved project evidence", exact: true }).click();
    await expect(phone.getByText("API traversal completed within the saved project scope.", { exact: false })).toBeVisible(); await expect(phone.getByText("Provider version 1", { exact: false })).toBeVisible();
    await phone.getByText("Review accountable owner",{exact:true}).click(); await expect(phone.getByText(`Owner reviewed: ${accountable}`,{exact:true})).toBeVisible();
    const azureGeometry = await phone.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth, inputSize: getComputedStyle(document.querySelector('input[name="directoryId"]')).fontSize })); assert(azureGeometry.width <= azureGeometry.viewport + 1); assert(parseFloat(azureGeometry.inputSize) >= 16);
    await phone.evaluate(() => window.scrollTo(0, 0)); await wait(100); assert((await phone.locator(".cp-skip").boundingBox()).y < 0);
    await phone.screenshot({ path: join(outputDirectory, "azure-mobile.png"), fullPage: true });
    phase="owner-revoked"; await scoped.query("UPDATE ll_members SET active=false WHERE email=$1",[accountable]);
    await phone.getByText("Review accountable owner",{exact:true}).click(); await expect(phone.getByLabel("Invited owner",{exact:true})).toBeHidden(); await phone.getByText("Review accountable owner",{exact:true}).click();
    await expect(phone.getByText(`Owner review needs renewal: ${accountable}.`,{exact:true})).toBeVisible();
    assert.equal((await api(phone,"/api/workspace/discovery/owners",reviewed[2])).status,400);
    assert.equal((await scoped.query("SELECT count(*)::int n FROM ll_cloud_owner_reviews WHERE org_id=$1",[org])).rows[0].n,3);
    phase = "cross-company"; const otherPage = await outsider.newPage(); await login(otherPage, other); await expect(otherPage.getByText("No AWS accounts have been added.", { exact: false })).toBeVisible(); assert.equal((await api(otherPage, `/api/workspace/discovery?connectionId=${connection}`)).status, 404); assert.equal((await api(otherPage, "/api/workspace/discovery/activity", activityResult.reference)).status, 404);
    assert.equal((await api(otherPage, "/api/workspace/discovery?kind=project&connectionId=operations-google")).status, 404); assert.equal((await api(otherPage, "/api/workspace/discovery?kind=project&connectionId=operations-azure")).status, 404);
    assert.equal((await api(otherPage,"/api/workspace/discovery/owners",reviewed[0])).status,409);
    assert.deepEqual((await api(otherPage,"/api/workspace/discovery/owners")).value.owners.map(p=>p.email),[other.email]);
    phase = "revocation"; await scoped.query("UPDATE ll_members SET active=false WHERE email=$1", [owner.email]); assert.equal((await api(page, "/api/workspace/discovery/activity", activityResult.reference)).status, 401); assert.equal((await api(page, "/api/workspace/discovery", { operation: "scan", connectionId: connection })).status, 401); assert.equal((await api(page, "/api/workspace/discovery?kind=project")).status, 401); assert.equal((await api(page,"/api/workspace/discovery/owners")).status,401); await page.reload(); await expect(page.getByRole("heading", { name: "Discover agents", exact: true })).toHaveCount(0);
    assert.equal((await scoped.query("SELECT count(*)::int n FROM ll_cloud_scans")).rows[0].n, 1);
    assert.equal((await scoped.query("SELECT count(*)::int n FROM ll_cloud_project_connections")).rows[0].n, 2);
    assert.equal((await scoped.query("SELECT count(*)::int n FROM ll_cloud_project_scans")).rows[0].n, 2);
    for (const table of ["ll_agents", "ll_actions", "ll_tokens"]) assert.equal((await scoped.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n, 0);
    assert.deepEqual(sourceConstruction(), construction, "Proof dependency graph changed during browser run");
    assert.equal(hash(await readFile("scripts/current-installed-proof-sources.json")),constructionRegistrySha256,"Construction descriptor changed during browser run");
    assert.deepEqual(await fingerprints(), before, "Proof sources changed during browser run");
    const screenshots = Object.fromEntries(await Promise.all(["desktop.png", "mobile.png", "expired-access.png", "azure-desktop.png", "azure-mobile.png", "project-desktop.png", "project-mobile.png"].map(async name => [name, hash(await readFile(join(outputDirectory, name)))])));
    const currentEpochs=(await scoped.query("SELECT org_id org,epoch::text FROM ll_workspace_recovery ORDER BY org_id")).rows;
    assert.deepEqual(currentEpochs,installation.epochs,"Recovery epoch changed during proof");
    const webRoles=roleIds.filter(r=>r.name.includes("_web_"));
    const observedRoles=(await scoped.query("SELECT rolname name,oid::text oid,rolsuper super,rolbypassrls bypass,rolinherit inherit FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname",[webRoles.map(x=>x.name)])).rows;
    assert.equal(observedRoles.length,2);for(const role of observedRoles){assert.equal(role.super,false);assert.equal(role.bypass,false);assert.equal(role.inherit,false);}
    const observedTLS=(await scoped.query("SELECT a.usename name,count(*)::int connections,bool_and(s.ssl) verified_tls FROM pg_stat_activity a JOIN pg_stat_ssl s ON a.pid=s.pid WHERE a.usename=ANY($1::text[]) GROUP BY a.usename ORDER BY a.usename",[webRoles.map(x=>x.name)])).rows;
    assert.equal(observedTLS.length,2);for(const role of observedTLS){assert(role.connections>0);assert.equal(role.verified_tls,true);}
    installation={...installation,currentEpochs,webRoles:observedRoles,webTLS:observedTLS};
    receipt = { version: 3, construction, constructionRegistrySha256, installation, completedUtc: new Date().toISOString(), proof: "disposable-loopback-cloud-inventory-ui", browser: browser.version(), sourceFingerprints: before, compiledArtifacts: Object.fromEntries(await Promise.all([".next/server/app/control-plane/discovery/page.js", ".next/server/app/api/workspace/discovery/route.js", ".next/server/app/api/workspace/discovery/owners/route.js"].map(async path => [path, hash(await readFile(path))]))), assertions: { threeProviderOwnerReviewSavedThroughUi: true, ownerReviewReplayAndChangedDecisionRefused: true, ownerReviewSurvivesMobileReload: true, revokedOwnerRequiresRenewalWithoutAuthority: true, foreignOwnerDirectoryAndReviewDenied: true, azureMobile390SavedScanReadable: true, azureUiScanPersistsThroughCliHttpFixture: true, azureChangedBindingRefusedAndEvidencePreserved: true, azureProviderMetadataMinimized: true, projectScopesSavedThroughUi: true, projectFixtureEvidenceSurvivesReload: true, projectNativeScanNotClaimed: true, projectMobile390Readable: true, projectCrossCompanyAndRevocationDenied: true, anonymousDenied: true, namedSignIn: true, secureHttpOnlyCookie: true, configuredIsNotObserved: true, actualLocalCliFixtureScanPersisted: true, refreshPersistence: true, expiredBindingRefusedAndPriorEvidencePreserved: true, mobileMenuClosesOnCurrentPageSelection: true, mobile390NoOverflow: true, mobileInputsAtLeast16px: true, technicalReferencesExpandable: true, noRawJson: true, crossCompanyDenied: true, revokedMemberDenied: true, noExecutionAuthorityCreated: true }, screenshots, notProved: ["Azure and Google native reads", "AWS signing or real account discovery", "trusted TLS ingress", "live providers", "reviewed cloud enrollment", "mandatory action enforcement", "enterprise readiness"] };
  } catch(error) { await writeFile(join(outputDirectory,"failure.json"),JSON.stringify({phase,message:String(error.message).replace(/postgres(?:ql)?:\/\/[^\s]+/gi,"[redacted-db]").slice(0,1800),code:error.code??null,production:false})+"\n",{mode:0o600,flag:"wx"});throw new Error(`Discovery browser proof failed at ${phase}; no completion receipt written.`); }
  finally {
    const failures = [];
    for(const cleanup of [()=>browser?.close(),()=>stop(server),async()=>{if(tls){tls.closeAllConnections();await new Promise(r=>tls.close(r));}},()=>scoped?.end()])try{await cleanup();}catch{failures.push(true);}
    if(!failures.length&&schemaCreated)try{
      assert.equal((await db.query("SELECT oid::text oid FROM pg_namespace WHERE nspname=$1",[schema])).rows[0]?.oid,schemaOid);
      for(const r of roleIds)assert.equal((await db.query("SELECT oid::text oid FROM pg_roles WHERE rolname=$1",[r.name])).rows[0]?.oid,r.oid);
      await db.query(`DROP SCHEMA ${schema} CASCADE`);for(const r of roleIds){await db.query("DROP OWNED BY "+r.name);await db.query("DROP ROLE "+r.name);}
      assert.equal((await db.query("SELECT 1 FROM pg_namespace WHERE oid=$1",[schemaOid])).rowCount,0);
      assert.equal((await db.query("SELECT 1 FROM pg_roles WHERE oid=ANY($1::oid[])",[roleIds.map(x=>x.oid)])).rowCount,0);
    }catch{failures.push(true);}
    try{await db.end();}catch{failures.push(true);}if(!failures.length)await rm(dir,{recursive:true,force:true});
    await writeFile(join(outputDirectory,"cleanup.json"),JSON.stringify({passed:!failures.length,capturedSchema:{name:schema,oid:schemaOid},capturedRoles:roleIds,production:false})+"\n",{mode:0o600,flag:"wx"});
    assert(!failures.length, "Discovery browser cleanup incomplete; no completion receipt written");
  }
  receipt.assertions.ownedResourcesRemoved = true;
  await writeFile(join(outputDirectory, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600, flag: "wx" }); return receipt;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  discoveryBrowserProof(process.argv[2]).then(r => console.log(JSON.stringify({ proof: r.proof, assertions: r.assertions, notProved: r.notProved }))).catch(e => { console.error(e.message); process.exitCode = 1; });
}
