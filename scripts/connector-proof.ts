import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { authenticate, tokenHash } from "../lib/durable/service";
import { ConnectorControl } from "../lib/connectors/service";
import { FetchSandboxConnectors } from "../lib/connectors/twin";
import type { Connector, ConnectorAction } from "../lib/connectors/contracts";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const url = process.env.LOOPLABS_TEST_DATABASE_URL;
  if (!url)
    throw new Error(
      "A dedicated test database is required; no live workspace will be modified.",
    );
  const schema = `proof_connectors_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: url });
  let db: Pool | undefined, child: ChildProcess | undefined;
  await mkdir(".local", { recursive: true, mode: 0o700 });
  const dir = await mkdtemp(resolve(".local/connector-proof-"));
  const token = randomBytes(32).toString("base64url");
  await writeFile(
    `${dir}/connector-twin-credentials.json`,
    JSON.stringify({ token }),
    { mode: 0o600 },
  );
  async function start() {
    const backend =
      process.env.FETCHSANDBOX_BACKEND_PATH ||
      `${process.env.HOME}/sandbox/backend`;
    let output = "";
    child = spawn(
      `${backend}/.venv/bin/python`,
      ["scripts/connector-twin.py"],
      {
        env: { ...process.env, LOOPLABS_CONNECTOR_STATE_DIR: dir },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stderr?.on("data", (b) => {
      output += String(b);
    });
    child.stdout?.on("data", (b) => {
      output += String(b);
    });
    for (let i = 0; i < 80; i++) {
      if (child.exitCode !== null)
        throw new Error(`Private twin could not start: ${output.slice(-600)}`);
      try {
        const r = await fetch("http://127.0.0.1:8018/proof/effects/unknown", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (r.status === 404) return;
      } catch {}
      await delay(100);
    }
    throw new Error(
      "Private twin startup timed out; ensure port 8018 is free.",
    );
  }
  async function stop() {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise<void>((r) => child!.once("exit", () => r()));
    }
  }
  const checks: { name: string; passed: boolean; detail: string }[] = [];
  async function check(name: string, fn: () => Promise<void>, detail: string) {
    await fn();
    checks.push({ name, passed: true, detail });
    console.log(`PASS ${name}`);
  }
  try {
    await start();
    await admin.query(`CREATE SCHEMA ${schema}`);
    db = new Pool({
      connectionString: url,
      options: `-c search_path=${schema}`,
    });
    for (const f of [
      "lib/durable/schema.sql",
      "lib/workspace/schema.sql",
      "lib/connectors/schema.sql",
      "lib/workflows/schema.sql",
    ])
      await db.query(await readFile(f, "utf8"));
    await db.query("INSERT INTO ll_orgs(id) VALUES('local-proof')");
    await db.query(
      "INSERT INTO ll_connector_policies(org_id,connector) VALUES('local-proof','crm'),('local-proof','email')",
    );
    await db.query(
      "INSERT INTO ll_agents(org_id,id,tools,action_limit) VALUES('local-proof','crm-agent',ARRAY['twin.crm'],100),('local-proof','email-agent',ARRAY['twin.email'],100)",
    );
    const actors = [];
    let workerToken = "";
    const actorKeys: Record<string, string> = {};
    for (const [role, subject] of [
      ["agent", "crm-agent"],
      ["agent", "email-agent"],
      ["operator", "reviewer"],
      ["worker", "executor"],
    ]) {
      const key = randomBytes(32).toString("base64url");
      if (role === "worker") workerToken = key;
      actorKeys[subject] = key;
      await db.query(
        "INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'local-proof',$2,$3)",
        [tokenHash(key), subject, role],
      );
      actors.push(await authenticate(db, key));
    }
    const [crm, email, operator, worker] = actors;
    const provider = new FetchSandboxConnectors("http://127.0.0.1:8018", token);
    const control = new ConnectorControl(db, provider);
    async function ready(connector: Connector) {
      const agent = connector === "crm" ? crm : email;
      const a = await control.propose(agent, {
        actionId: randomUUID(),
        agentId: agent.subject,
        connector,
        payload:
          connector === "crm"
            ? { lifecycle: "customer" }
            : { template: "case_received" },
      });
      await assert.rejects(() => control.execute(agent, a.id));
      return control.review(operator, a.id, a.payload_hash, true);
    }
    for (const connector of ["crm", "email"] as const) {
      let normal: ConnectorAction;
      await check(
        `${connector}: exact approval, execute and authoritative read-back`,
        async () => {
          normal = await ready(connector);
          const a = await control.execute(worker, normal.id);
          assert.equal(a.state, "succeeded");
        },
        "Real LoopLabs service -> HTTP -> existing FetchSandbox engine -> persisted provider state.",
      );
      await check(
        `${connector}: replay sends no second effect`,
        async () => {
          const before = JSON.parse(
            await readFile(`${dir}/connector-twin-state.json`, "utf8"),
          );
          await control.execute(worker, normal!.id);
          const after = JSON.parse(
            await readFile(`${dir}/connector-twin-state.json`, "utf8"),
          );
          assert.deepEqual(after.effects, before.effects);
        },
        "Compare provider effect journal before and after action replay.",
      );
      let lost: ConnectorAction;
      await check(
        `${connector}: response lost after effect, reconcile without resend`,
        async () => {
          lost = await ready(connector);
          assert.equal(
            (await control.execute(worker, lost.id, true)).state,
            "uncertain",
          );
          assert.equal(
            (await control.reconcile(operator, lost.id)).state,
            "succeeded",
          );
        },
        "Twin writes and persists then delays response; 1.5s adapter timeout.",
      );
      await check(
        `${connector}: restart preserves effect and prevents duplicate replay`,
        async () => {
          await stop();
          await start();
          assert.equal(
            (await control.reconcile(operator, lost!.id)).state,
            "succeeded",
          );
          const before = JSON.parse(
            await readFile(`${dir}/connector-twin-state.json`, "utf8"),
          );
          await provider.write(lost!, false);
          const after = JSON.parse(
            await readFile(`${dir}/connector-twin-state.json`, "utf8"),
          );
          assert.equal(
            Object.keys(after.effects).length,
            Object.keys(before.effects).length,
          );
        },
        "Restart the actual twin process; replay returns existing effect.",
      );
      if (connector === "crm")
        await check(
          "crm: later write produces conflict",
          async () => {
            const newer = await ready("crm");
            await control.execute(worker, newer.id);
            assert.equal(
              (await control.reconcile(operator, lost!.id)).state,
              "conflict",
            );
          },
          "Distinct fixture record versions reveal intervening writes; live HubSpot CAS not claimed.",
        );
    }
    await check(
      "provider rejects unauthorized requests",
      async () => {
        const r = await fetch(
          "http://127.0.0.1:8018/crm/crm/v3/objects/contacts/1001",
        );
        assert.equal(r.status, 401);
      },
      "No provider credential is given to agents.",
    );
    await check(
      "provider rejects recipient and template escape",
      async () => {
        const a = await ready("email");
        await assert.rejects(() =>
          provider.request("/email/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": `looplabs-${a.id}`,
            },
            body: JSON.stringify({
              ...provider.body(a),
              to: ["other@example.test"],
            }),
          }),
        );
      },
      "Only the prepared sample recipient and exact message are allowed.",
    );
    for (const status of ["401", "429", "500"])
      await check(
        `provider ${status}: retain uncertainty, never blind retry`,
        async () => {
          class Fault extends FetchSandboxConnectors {
            override async request(path: string, init: RequestInit = {}) {
              return super.request(path, {
                ...init,
                headers: {
                  ...init.headers,
                  ...(init.method === "POST" || init.method === "PATCH"
                    ? { "X-LoopLabs-Proof-Fault": status }
                    : {}),
                },
              });
            }
          }
          const fault = new ConnectorControl(
            db!,
            new Fault("http://127.0.0.1:8018", token),
          );
          const a = await ready("email");
          assert.equal((await fault.execute(worker, a.id)).state, "uncertain");
          assert.equal(
            (await fault.reconcile(operator, a.id)).state,
            "uncertain",
          );
        },
        "Actual HTTP rejection; absence is not proof that an arbitrary real provider cannot complete.",
      );
    await check(
      "crm: stale approved source cannot overwrite a later update",
      async () => {
        const old = await ready("crm"),
          newer = await ready("crm");
        await control.execute(worker, newer.id);
        const before = JSON.parse(
          await readFile(`${dir}/connector-twin-state.json`, "utf8"),
        );
        assert.equal(
          (await control.execute(worker, old.id)).state,
          "uncertain",
        );
        const after = JSON.parse(
          await readFile(`${dir}/connector-twin-state.json`, "utf8"),
        );
        assert.deepEqual(after.effects, before.effects);
      },
      "The fixture enforces an exact source version at write time. This CAS extension is not a live HubSpot feature claim.",
    );
    for (const stage of ["before", "after"])
      await check(
        `worker SIGKILL ${stage} effect`,
        async () => {
          const a = await ready("email");
          let output = "";
          const crash = spawn(
            process.execPath,
            ["--import", "tsx", "scripts/connector-proof-worker.ts"],
            {
              env: {
                ...process.env,
                LOOPLABS_PROOF_SCHEMA: schema,
                LOOPLABS_PROOF_ACTION: a.id,
                LOOPLABS_PROOF_CRASH: stage,
                LOOPLABS_PROOF_WORKER_TOKEN: workerToken,
                LOOPLABS_CONNECTOR_TWIN_TOKEN: token,
              },
              stdio: ["ignore", "pipe", "pipe"],
            },
          );
          crash.stdout?.on("data", (b) => {
            output += String(b);
          });
          crash.stderr?.on("data", (b) => {
            output += String(b);
          });
          try {
            let reached = false;
            for (let i = 0; i < 150; i++) {
              if (crash.exitCode !== null)
                throw new Error(
                  "Isolated worker exited before crash checkpoint.",
                );
              const state = JSON.parse(
                await readFile(`${dir}/connector-twin-state.json`, "utf8"),
              );
              if (
                stage === "before"
                  ? output.includes("dispatch-claimed")
                  : Boolean(state.effects[a.id])
              ) {
                reached = true;
                break;
              }
              await delay(20);
            }
            assert.equal(reached, true);
            const exited = new Promise<void>((r) =>
              crash.once("exit", () => r()),
            );
            crash.kill("SIGKILL");
            await exited;
            assert.equal(
              (await control.read(operator, a.id)).state,
              "executing",
            );
            await db!.query(
              "UPDATE ll_connector_actions SET lease_until=now()-interval '1 second' WHERE id=$1",
              [a.id],
            );
            assert.equal(
              (await control.execute(worker, a.id)).state,
              "uncertain",
            );
            assert.equal(
              (await control.reconcile(operator, a.id)).state,
              stage === "before" ? "uncertain" : "succeeded",
            );
          } finally {
            if (crash.exitCode === null && crash.signalCode === null)
              crash.kill("SIGKILL");
          }
        },
        "Terminate a real worker process; lease expiry injected in isolated test schema. Before-effect absence remains uncertain, never automatically retried.",
      );
    let api: ChildProcess | undefined;
    let origin = "";
    const isolatedUrl = new URL(url);
    isolatedUrl.searchParams.set("options", `-c search_path=${schema}`);
    async function startApi() {
      api = spawn(
        process.execPath,
        ["--import", "tsx", "scripts/workflow-http-proof-server.ts"],
        {
          env: {
            ...process.env,
            LOOPLABS_DATABASE_URL: isolatedUrl.toString(),
            LOOPLABS_CONNECTOR_TWIN_URL: "http://127.0.0.1:8018",
            LOOPLABS_CONNECTOR_TWIN_TOKEN: token,
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let output = "";
      api.stdout!.on("data", (b) => {
        output += String(b);
      });
      for (let i = 0; i < 100; i++) {
        if (api.exitCode !== null)
          throw new Error("Workflow HTTP harness exited before readiness.");
        const match = output.match(/\{"port":(\d+)\}/);
        if (match) {
          origin = `http://127.0.0.1:${match[1]}`;
          return;
        }
        await delay(50);
      }
      throw new Error("Workflow HTTP harness did not start.");
    }
    async function stopApi() {
      if (api && api.exitCode === null && api.signalCode === null) {
        const done = new Promise<void>((r) => api!.once("exit", () => r()));
        api.kill("SIGKILL");
        await done;
      }
    }
    async function http(path: string, key: string, value?: object) {
      const response = await fetch(origin + path, {
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        ...(value ? { method: "POST", body: JSON.stringify(value) } : {}),
      });
      return { status: response.status, data: await response.json() };
    }
    try {
      await startApi();
      const enrolled = await http(
        "/api/durable/workflows",
        actorKeys.reviewer,
        {
          operation: "create",
          crmAgent: "crm-agent",
          emailAgent: "email-agent",
          runId: randomUUID(),
        },
      );
      assert.equal(enrolled.status, 200);
      const runId = enrolled.data.id;
      async function externalAgent(key: string) {
        await execFileAsync(process.execPath, ["scripts/workflow-agent.mjs"], {
          env: {
            ...process.env,
            LOOPLABS_AGENT_ORIGIN: origin,
            LOOPLABS_RUN_ID: runId,
            LOOPLABS_AGENT_KEY: key,
          },
        });
      }
      await check(
        "workflow: external agents submit scoped steps through actual HTTP handlers",
        async () => {
          await externalAgent(actorKeys["crm-agent"]);
          await externalAgent(actorKeys["email-agent"]);
          const privatePlan = await http(
            `/api/durable/workflows?run=${runId}`,
            actorKeys["crm-agent"],
          );
          assert.equal(privatePlan.data.steps.length, 1);
          assert.equal(
            (
              await http("/api/durable/workflows", actorKeys["crm-agent"], {
                operation: "create",
                crmAgent: "crm-agent",
                emailAgent: "email-agent",
                runId: randomUUID(),
              })
            ).status,
            403,
          );
        },
        "Separate Node agent processes use only scoped keys. Provider credentials stay in the server harness.",
      );
      let plan = (
        await http(`/api/durable/workflows?run=${runId}`, actorKeys.reviewer)
      ).data;
      const [first, next] = plan.steps;
      for (const step of plan.steps)
        assert.equal(
          (
            await http("/api/durable/connectors", actorKeys.reviewer, {
              operation: "approve",
              actionId: step.action_id,
              payloadHash: step.payload_hash,
            })
          ).status,
          200,
        );
      await check(
        "workflow: fresh action IDs cannot escape enrolled agent boundaries",
        async () => {
          const escaped = await http(
            "/api/durable/connectors",
            actorKeys["email-agent"],
            {
              operation: "propose",
              actionId: randomUUID(),
              agentId: "email-agent",
              connector: "email",
              payload: { template: "case_received" },
            },
          );
          assert.equal(escaped.status, 403);
        },
        "Enrollment restricts these agent identities to immutable workflow step IDs, not merely the dashboard path.",
      );
      await check(
        "workflow: downstream API cannot bypass a missing predecessor",
        async () => {
          assert.equal(
            (
              await http("/api/durable/connectors", workerToken, {
                operation: "execute",
                actionId: next.action_id,
              })
            ).status,
            409,
          );
        },
        "The dependency guard is enforced in the shared action execution service, not only in the dashboard.",
      );
      await check(
        "workflow: lost upstream response holds downstream execution",
        async () => {
          const executed = await http("/api/durable/connectors", workerToken, {
            operation: "execute",
            actionId: first.action_id,
            lostResponse: true,
          });
          assert.equal(executed.data.state, "uncertain");
          assert.equal(
            (
              await http("/api/durable/connectors", workerToken, {
                operation: "execute",
                actionId: next.action_id,
              })
            ).status,
            409,
          );
        },
        "Actual twin write completes before its response is delayed; the message stays undispatched.",
      );
      await check(
        "workflow: API process termination preserves run and proposals",
        async () => {
          await stopApi();
          await startApi();
          await externalAgent(actorKeys["crm-agent"]);
          plan = (
            await http(
              `/api/durable/workflows?run=${runId}`,
              actorKeys.reviewer,
            )
          ).data;
          assert.equal(plan.steps[0].state, "uncertain");
          assert.equal(
            (
              await db!.query(
                "SELECT count(*)::integer AS n FROM ll_connector_actions WHERE id=$1",
                [first.action_id],
              )
            ).rows[0].n,
            1,
          );
        },
        "Terminate the actual HTTP handler process with SIGKILL, restart it and replay the external agent submission.",
      );
      await check(
        "workflow: reconciliation unlocks the downstream step without resending upstream",
        async () => {
          assert.equal(
            (
              await http("/api/durable/connectors", actorKeys.reviewer, {
                operation: "reconcile",
                actionId: first.action_id,
              })
            ).data.state,
            "succeeded",
          );
          assert.equal(
            (
              await http("/api/durable/connectors", workerToken, {
                operation: "execute",
                actionId: next.action_id,
              })
            ).data.state,
            "succeeded",
          );
          assert.equal(
            (
              await http("/api/durable/workflows", actorKeys.reviewer, {
                operation: "verify",
                runId,
              })
            ).status,
            200,
          );
          assert.equal(
            (
              await http(
                `/api/durable/workflows?run=${runId}`,
                actorKeys.reviewer,
              )
            ).data.state,
            "completed",
          );
        },
        "Third step reads both twin outcomes; there are two intended effects and no automatic upstream resend.",
      );
      await check(
        "workflow: stale CRM approval cannot release the downstream message",
        async () => {
          const staleRun = (
            await http("/api/durable/workflows", actorKeys.reviewer, {
              operation: "create",
              crmAgent: "crm-agent",
              emailAgent: "email-agent",
              runId: randomUUID(),
            })
          ).data.id;
          await execFileAsync(
            process.execPath,
            ["scripts/workflow-agent.mjs"],
            {
              env: {
                ...process.env,
                LOOPLABS_AGENT_ORIGIN: origin,
                LOOPLABS_RUN_ID: staleRun,
                LOOPLABS_AGENT_KEY: actorKeys["crm-agent"],
              },
            },
          );
          await execFileAsync(
            process.execPath,
            ["scripts/workflow-agent.mjs"],
            {
              env: {
                ...process.env,
                LOOPLABS_AGENT_ORIGIN: origin,
                LOOPLABS_RUN_ID: staleRun,
                LOOPLABS_AGENT_KEY: actorKeys["email-agent"],
              },
            },
          );
          const steps = (
            await http(
              `/api/durable/workflows?run=${staleRun}`,
              actorKeys.reviewer,
            )
          ).data.steps;
          for (const step of steps)
            await http("/api/durable/connectors", actorKeys.reviewer, {
              operation: "approve",
              actionId: step.action_id,
              payloadHash: step.payload_hash,
            });
          // A different authorized run writes the same contact after the first approval.
          const newerRun = (
            await http("/api/durable/workflows", actorKeys.reviewer, {
              operation: "create",
              crmAgent: "crm-agent",
              emailAgent: "email-agent",
              runId: randomUUID(),
            })
          ).data.id;
          await execFileAsync(
            process.execPath,
            ["scripts/workflow-agent.mjs"],
            {
              env: {
                ...process.env,
                LOOPLABS_AGENT_ORIGIN: origin,
                LOOPLABS_RUN_ID: newerRun,
                LOOPLABS_AGENT_KEY: actorKeys["crm-agent"],
              },
            },
          );
          const newer = (
            await http(
              `/api/durable/workflows?run=${newerRun}`,
              actorKeys.reviewer,
            )
          ).data.steps[0];
          await http("/api/durable/connectors", actorKeys.reviewer, {
            operation: "approve",
            actionId: newer.action_id,
            payloadHash: newer.payload_hash,
          });
          assert.equal(
            (
              await http("/api/durable/connectors", workerToken, {
                operation: "execute",
                actionId: newer.action_id,
              })
            ).data.state,
            "succeeded",
          );
          assert.equal(
            (
              await http("/api/durable/connectors", workerToken, {
                operation: "execute",
                actionId: steps[0].action_id,
              })
            ).data.state,
            "uncertain",
          );
          assert.equal(
            (
              await http("/api/durable/connectors", workerToken, {
                operation: "execute",
                actionId: steps[1].action_id,
              })
            ).status,
            409,
          );
        },
        "The actual twin rejects a stale approved CRM source version and the dependent message remains undispatched.",
      );
      await check(
        "workflow: provider bypass without its private credential is rejected",
        async () => {
          const r = await fetch("http://127.0.0.1:8018/email/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${actorKeys["email-agent"]}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
          });
          assert.equal(r.status, 401);
        },
        "A LoopLabs agent key is not a provider credential. This is fixture enforcement, not a customer network audit.",
      );
    } finally {
      await stopApi();
    }
    let restoreMilliseconds = 0;
    await check(
      "isolated database backup and restore preserves actions and evidence",
      async () => {
        const connection = new URL(url);
        const env = {
          ...process.env,
          PGHOST: connection.hostname,
          PGPORT: connection.port || "5432",
          PGUSER: decodeURIComponent(connection.username),
          PGPASSWORD: decodeURIComponent(connection.password),
          PGDATABASE: connection.pathname.slice(1),
        };
        const expected = (
          await db!.query(
            "SELECT id,state,payload_hash FROM ll_connector_actions ORDER BY id",
          )
        ).rows;
        const backup = `${dir}/database.dump`;
        await execFileAsync(
          "pg_dump",
          [
            "--format=custom",
            "--no-owner",
            "--no-privileges",
            `--schema=${schema}`,
            `--file=${backup}`,
          ],
          { env },
        );
        await db!.query("TRUNCATE ll_connector_actions CASCADE");
        const started = Date.now();
        await execFileAsync(
          "pg_restore",
          [
            "--clean",
            "--if-exists",
            "--no-owner",
            "--no-privileges",
            `--dbname=${connection.pathname.slice(1)}`,
            backup,
          ],
          { env },
        );
        restoreMilliseconds = Date.now() - started;
        assert.deepEqual(
          (
            await db!.query(
              "SELECT id,state,payload_hash FROM ll_connector_actions ORDER BY id",
            )
          ).rows,
          expected,
        );
      },
      "Actual pg_dump/pg_restore in a dedicated test schema. This is a local drill, not production PITR, host failover or an availability SLA.",
    );
    const fingerprintFiles = [
      "lib/workflows/guard.ts",
      "lib/workflows/service.ts",
      "app/api/durable/workflows/route.ts",
      "scripts/workflow-agent.mjs",
      "scripts/workflow-http-proof-server.ts",
      "lib/connectors/contracts.ts",
      "lib/connectors/service.ts",
      "lib/connectors/twin.ts",
      "lib/connectors/schema.sql",
      "lib/workflows/schema.sql",
      "app/api/durable/connectors/route.ts",
      "scripts/connector-twin.py",
    ];
    const sourceFingerprints: Record<string, string> = {};
    for (const f of fingerprintFiles)
      sourceFingerprints[f] = createHash("sha256")
        .update(await readFile(f))
        .digest("hex");
    const evidence = {
      at: new Date().toISOString(),
      scope:
        "Isolated PostgreSQL schema and private FetchSandbox HubSpot Contacts / Resend single-send fixtures. No live CRM, real email, model or money.",
      checks,
      sourceFingerprints,
      localRestoreMilliseconds: restoreMilliseconds,
      limits: [
        "Fixture action journal and contact version are LoopLabs extensions, not live provider parity.",
        "No SSO, failover, production load or real delivery proof.",
        "Only one sample contact and one fixed message template/recipient.",
      ],
      providerEffects: Object.keys(
        JSON.parse(await readFile(`${dir}/connector-twin-state.json`, "utf8"))
          .effects,
      ).length,
    };
    await writeFile(
      ".local/connector-proof.json",
      JSON.stringify(evidence, null, 2),
      { mode: 0o600 },
    );
    await mkdir("docs/evidence", { recursive: true });
    await writeFile(
      "docs/evidence/connector-proof.json",
      JSON.stringify(evidence, null, 2) + "\n",
    );
    console.log(
      `Verified ${checks.length} checks; sanitized evidence saved privately and recorded for review.`,
    );
  } finally {
    await stop();
    await db?.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
    await rm(dir, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Connector proof failed.");
  process.exitCode = 1;
});
