import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Pool } from "pg";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { digest, WORKSPACE_COOKIE } from "@/lib/workspace/identity";
import { CloudInventoryStore } from "@/lib/workspace/cloud-inventory";
const binding = vi.hoisted(() => ({ db: null as Pool | null }));
vi.mock("@/lib/durable/database", async original => ({ ...await original<object>(), database: () => { if (!binding.db) throw new Error("Test database unavailable"); return binding.db; } }));
import { GET, POST } from "./route";
it("real session authentication and PostgreSQL persist only tenant-owned observations, refuse stale sessions and never enroll an execution agent", async () => {
  if (!process.env.LOOPLABS_TEST_DATABASE_URL) throw new Error("Dedicated PostgreSQL required; never skip.");
  const admin = new Pool({ connectionString: process.env.LOOPLABS_TEST_DATABASE_URL }), schema = `discovery_http_${randomBytes(8).toString("hex")}`, epoch = randomUUID();
  const token = randomBytes(32).toString("base64url"), otherToken = randomBytes(32).toString("base64url"); let db: Pool | undefined;
  const privateDir = await mkdtemp(join(tmpdir(), "ll-discovery-http-"));
  const request = (session: string, payload?: object, query = "") => new NextRequest(`https://looplabs.run/api/workspace/discovery${query}`, { method: payload ? "POST" : "GET", headers: { origin: "https://looplabs.run", cookie: `${WORKSPACE_COOKIE}=${session}`, "Content-Type": "application/json" }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`); db = new Pool({ connectionString: process.env.LOOPLABS_TEST_DATABASE_URL, options: `-c search_path=${schema}` }); binding.db = db;
    for (const file of ["lib/durable/schema.sql", "lib/workspace/schema.sql", "lib/durable/recovery-schema.sql", "lib/workspace/cloud-inventory-schema.sql", "lib/workspace/cloud-project-schema.sql"]) await db.query(await readFile(file, "utf8"));
    await db.query("INSERT INTO ll_orgs(id) VALUES('company-a'),('company-b')");
    await db.query("INSERT INTO ll_workspace_recovery(org_id,epoch) VALUES('company-a',$1),('company-b',$1)", [epoch]); vi.stubEnv("LOOPLABS_RECOVERY_EPOCH", epoch);
    await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('owner@example.test','company-a','Owner','test'),('other@example.test','company-b','Other','test')");
    await db.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES($1,'owner@example.test',now()+interval '1 hour'),($2,'other@example.test',now()+interval '1 hour')", [digest(token), digest(otherToken)]);
    const input = { operation: "configure", connectionId: "aws-a", accountId: "123456789012", region: "us-west-2" };
    expect((await POST(request(token, input))).status).toBe(200); expect((await POST(request(token, input))).status).toBe(200);
    expect((await db.query("SELECT count(*)::int n FROM ll_cloud_connections")).rows[0].n).toBe(1);
    const listing = await GET(request(token)); expect(listing.headers.get("Cache-Control")).toBe("no-store");
    expect(await listing.json()).toMatchObject({ connections: [{ scope: { tenantId: "company-a", connectionId: "aws-a" } }], scanningAvailable: false });
    expect(await (await GET(request(otherToken))).json()).toMatchObject({ connections: [] });
    expect((await GET(request(otherToken, undefined, "?connectionId=aws-a"))).status).toBe(404);
    const scope = { tenantId: "company-a", connectionId: "aws-a", accountId: "123456789012", region: "us-west-2" };
    await new CloudInventoryStore(db).recordScan({ orgId: "company-a", subject: "owner@example.test", tokenHash: digest(token), role: "operator" }, randomUUID(), { scope, observedAt: new Date().toISOString(), completeness: "partial", records: [], failures: ["list-unavailable"] });
    expect(await (await GET(request(token, undefined, "?connectionId=aws-a"))).json()).toMatchObject({ status: "observed", completeness: "partial", failures: ["list-unavailable"], enforcement: "unverified" });
    expect((await POST(request(token, { operation: "scan", connectionId: "aws-a" }))).status).toBe(503);
    const executable = join(privateDir, "aws-fixture"), path = join(privateDir, "binding.json");
    const runtime = { agentRuntimeId: "service-1234567890", agentRuntimeArn: "arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/service-1234567890", agentRuntimeVersion: "1" };
    // A real child-process fixture, not an AWS CLI or live account proof.
    await writeFile(executable, `#!/bin/sh\ncase "$2" in\nget-caller-identity) printf '%s' '${JSON.stringify({ Account: scope.accountId })}' ;;\nlist-agent-runtimes) printf '%s' '${JSON.stringify({ agentRuntimes: [runtime], nextToken: null })}' ;;\nget-agent-runtime) printf '%s' '${JSON.stringify(runtime)}' ;;\n*) exit 1 ;;\nesac\n`, { mode: 0o700 });
    await writeFile(path, JSON.stringify({ scope, executable, session: { accessKeyId: `ASIA${"A".repeat(16)}`, secretAccessKey: "b".repeat(40), sessionToken: "c".repeat(40), expiresAt: new Date(Date.now() + 600000).toISOString() } }), { mode: 0o600 });
    vi.stubEnv("LOOPLABS_CLOUD_DISCOVERY_BINDING_FILE", path);
    expect(await (await GET(request(token))).json()).toMatchObject({ connections: [{ scanReady: true }], scanningAvailable: true });
    const scanned = await POST(request(token, { operation: "scan", connectionId: "aws-a" })); expect(scanned.status).toBe(200);
    expect(await scanned.json()).toMatchObject({ completeness: "complete-api-traversal", records: [{ record: { resourceId: runtime.agentRuntimeId, version: "1", roleReference: null, coverage: { enforcement: "unverified" } } }], enforcement: "unverified" });
    expect((await POST(request(token, { ...input, tenantId: "company-b" }))).status).toBe(400);
    expect((await POST(request(token, { ...input, accountId: "999999999999" }))).status).toBe(409);
    const project = { operation: "configure-project", provider: "google-agent-engine", connectionId: "google-a", projectId: "company-agents", projectNumber: "123456789012", location: "us-central1" };
    expect((await POST(request(token, project))).status).toBe(200); expect((await POST(request(token, project))).status).toBe(200);
    expect(await (await GET(request(token, undefined, "?kind=project"))).json()).toMatchObject({ connections: [{ scope: { provider: "google-agent-engine", tenantId: "company-a" } }], scanningAvailable: false });
    expect((await GET(request(otherToken, undefined, "?kind=project&connectionId=google-a"))).status).toBe(404);
    expect(await (await GET(request(otherToken, undefined, "?kind=project"))).json()).toMatchObject({ connections: [] });
    const projectScope = { provider: "google-agent-engine" as const, tenantId: "company-a", connectionId: "google-a", projectId: "company-agents", projectNumber: "123456789012", location: "us-central1" };
    await new CloudInventoryStore(db).recordProjectScan({ orgId: "company-a", subject: "owner@example.test", tokenHash: digest(token), role: "operator" }, randomUUID(), { scope: projectScope, observedAt: new Date().toISOString(), completeness: "partial", records: [], failures: ["list-unavailable"] });
    expect(await (await GET(request(token, undefined, "?kind=project&connectionId=google-a"))).json()).toMatchObject({ status: "observed", completeness: "partial", enforcement: "unverified" });
    expect((await POST(request(token, { ...project, projectNumber: "999999999999" }))).status).toBe(409);
    expect((await POST(request(token, { ...project, token: "SECRET" }))).status).toBe(400);
    expect((await POST(request(token, { operation: "scan", connectionId: "google-a", kind: "project" }))).status).toBe(400);
    // Actual invited route + private file + fixed native HTTP transport + PG.
    // HTTP responses are controlled fixtures, not live Google account evidence.
    expect((await POST(request(token, { operation: "scan-project", connectionId: "google-a" }))).status).toBe(503);
    const googlePath = join(privateDir, "google-binding.json"), resource = `projects/${projectScope.projectNumber}/locations/${projectScope.location}/reasoningEngines/1234`;
    await writeFile(googlePath, JSON.stringify({ scope: projectScope, session: { token: "DUMMY_GOOGLE_READ_TOKEN_123456789", expiresAt: new Date(Date.now() + 600000).toISOString() } }), { mode: 0o600 });
    vi.stubEnv("LOOPLABS_GOOGLE_DISCOVERY_BINDING_FILE", googlePath);
    let revokeDuringRead = false;
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const target = String(url);
      if (target === `https://cloudresourcemanager.googleapis.com/v3/projects/${projectScope.projectNumber}`) return Response.json({ name: `projects/${projectScope.projectNumber}`, projectId: projectScope.projectId, state: "ACTIVE" });
      if (target === `https://${projectScope.location}-aiplatform.googleapis.com/v1/${resource}`) {
        if (revokeDuringRead) await db!.query("UPDATE ll_members SET active=false WHERE email='owner@example.test'");
        return Response.json({ name: resource, spec: { serviceAccount: `agent-reader@${projectScope.projectId}.iam.gserviceaccount.com` }, description: "PRIVATE_PROMPT" });
      }
      if (target === `https://${projectScope.location}-aiplatform.googleapis.com/v1/projects/${projectScope.projectNumber}/locations/${projectScope.location}/reasoningEngines?pageSize=100`) return Response.json({ reasoningEngines: [{ name: resource }] });
      throw Error("Unexpected fixture HTTP destination");
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await (await GET(request(token, undefined, "?kind=project"))).json()).toMatchObject({ connections: [{ scanReady: true }], scanningAvailable: true }); expect(fetcher).not.toHaveBeenCalled();
    const projectScan = await POST(request(token, { operation: "scan-project", connectionId: "google-a" })); expect(projectScan.status).toBe(200);
    expect(await projectScan.json()).toMatchObject({ completeness: "complete-api-traversal", records: [{ record: { resource, version: null, coverage: { enforcement: "unverified" } } }] });
    expect((await POST(request(otherToken, { operation: "scan-project", connectionId: "google-a" }))).status).toBe(404);
    revokeDuringRead = true;
    expect((await POST(request(token, { operation: "scan-project", connectionId: "google-a" }))).status).toBe(403);
    expect((await db.query("SELECT count(*)::int n FROM ll_cloud_project_scans")).rows[0].n).toBe(2);
    expect(JSON.stringify((await db.query("SELECT * FROM ll_cloud_project_observations")).rows)).not.toContain("PRIVATE_PROMPT");
    await db.query("UPDATE ll_members SET active=true WHERE email='owner@example.test'");
    vi.unstubAllGlobals();
    expect((await db.query("SELECT count(*)::int n FROM ll_cloud_project_connections")).rows[0].n).toBe(1);
    for (const table of ["ll_agents", "ll_actions", "ll_tokens"]) expect((await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0);
    await db.query("UPDATE ll_members SET active=false WHERE email='owner@example.test'");
    expect((await GET(request(token))).status).toBe(401); expect((await POST(request(token, input))).status).toBe(401);
    expect((await GET(request(token, undefined, "?kind=project"))).status).toBe(401); expect((await POST(request(token, project))).status).toBe(401);
    await db.query("UPDATE ll_members SET active=true WHERE email='owner@example.test'"); await db.query("UPDATE ll_sessions SET expires_at=now()-interval '1 second' WHERE hash=$1", [digest(token)]);
    expect((await GET(request(token))).status).toBe(401);
    expect((await db.query("SELECT count(*)::int n FROM ll_cloud_scans")).rows[0].n).toBe(2);
  } finally { binding.db = null; vi.unstubAllGlobals(); vi.unstubAllEnvs(); await db?.end(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end(); await rm(privateDir, { recursive: true, force: true }); }
});
