import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:http";
import { Pool } from "pg";
import { Client, Connection } from "@temporalio/client";
import { NativeConnection, Worker, Runtime, DefaultLogger } from "@temporalio/worker";
import { authenticate } from "../lib/durable/service";
import { ConnectorControl } from "../lib/connectors/service";
import { connectorProvider } from "../lib/connectors/hosted";
import { WorkflowControl } from "../lib/workflows/service";
import { activities } from "../runtime/temporal/activities";
import { versionedActivities } from "../runtime/temporal/version-contract";
import { TemporalOutbox } from "../runtime/temporal/outbox";
import { operationsConfig, OperationsHealth, verifyArtifacts } from "../runtime/temporal/operations";
async function main() {
  const config = operationsConfig(process.env, process.argv[2]);
  if (!process.env.LOOPLABS_DATABASE_URL || !process.env.LOOPLABS_TEMPORAL_WORKER_TOKEN) throw Error("Missing workload configuration");
  verifyArtifacts(config.buildId, JSON.parse(await readFile(".worker/temporal-manifest.json", "utf8")), await readFile(".worker/temporal-service.cjs"), await readFile(".worker/temporal-workflow.cjs"), await readFile("pnpm-lock.yaml"));
  Runtime.install({ logger: new DefaultLogger("WARN") });
  const tls = config.insecureLoopback ? false : config.certPath ? { clientCertPair: { crt: await readFile(config.certPath), key: await readFile(config.keyPath!) } } : true;
  const connectionOptions = { address:config.address, tls, apiKey:config.apiKey };
  const db = new Pool({ connectionString:process.env.LOOPLABS_DATABASE_URL, max:config.activitySlots+2, connectionTimeoutMillis:5000, query_timeout:10000, statement_timeout:10000 });
  let connection: Connection | undefined, native: NativeConnection | undefined, worker: Worker | undefined;
  const health = new OperationsHealth(config.role, Math.max(config.pollMs*3, 15000));
  const server = createServer((req, res) => {
    const status=health.snapshot(Date.now(), config.role === "scheduler" || worker?.getState() === "RUNNING");
    if (req.method !== "GET") { res.writeHead(405); res.end(); return; }
    if (!["/health/live", "/health/ready"].includes(req.url || "")) { res.writeHead(404); res.end(); return; }
    res.writeHead(req.url === "/health/ready" && !status.ready ? 503 : 200, { "Content-Type":"application/json", "Cache-Control":"no-store" });
    res.end(JSON.stringify(status));
  });
  const stop = () => { health.stopping=true; if (worker?.getState() === "RUNNING") worker.shutdown(); };
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);
  db.on("error", stop);
  try {
    const actor = await authenticate(db, process.env.LOOPLABS_TEMPORAL_WORKER_TOKEN);
    if (actor.subject !== "enquiry-temporal" || actor.role !== "worker") throw Error("Wrong workload identity");
    connection = await Connection.connect(connectionOptions);
    const client = new Client({ connection, namespace:config.namespace });
    const outbox = new TemporalOutbox(db);
    if (config.role === "worker") {
      native=await NativeConnection.connect(connectionOptions);
      worker=await Worker.create({ connection:native, namespace:config.namespace, taskQueue:config.taskQueue,
        workflowBundle:{ codePath:resolve(".worker/temporal-workflow.cjs") },
        workerDeploymentOptions:{ version:{ deploymentName:"looplabs-acknowledgement", buildId:config.buildId }, useWorkerVersioning:true, defaultVersioningBehavior:"PINNED" },
        maxConcurrentActivityTaskExecutions:config.activitySlots, maxConcurrentWorkflowTaskExecutions:config.workflowSlots,
        activities:versionedActivities(db, actor, activities(new WorkflowControl(db, new ConnectorControl(db, connectorProvider())), actor)),
        shutdownGraceTime:"20 seconds" });
    }
    await new Promise<void>((ok, fail) => { server.once("error", fail); server.listen(config.healthPort, "127.0.0.1", ok); });
    const monitor = async () => {
      while (!health.stopping) {
        try {
          await connection!.withDeadline(Date.now()+5000, () => connection!.workflowService.describeNamespace({ namespace:config.namespace }));
          // Reauthenticate on every tick; revoked workloads cannot remain ready.
          await authenticate(db, process.env.LOOPLABS_TEMPORAL_WORKER_TOKEN!);
          const started=config.role === "scheduler" ? await connection!.withDeadline(Date.now()+10000, () => outbox.tick(actor, client, config.taskQueue)) : 0;
          const stats=(await db.query("SELECT count(*)::integer AS pending,COALESCE(max(extract(epoch FROM now()-d.created_at)),0)::integer AS age FROM ll_temporal_dispatch t JOIN ll_enquiry_dispatch d ON d.org_id=t.org_id AND d.plan_id=t.plan_id WHERE t.org_id=$1 AND t.state='pending'", [actor.orgId])).rows[0];
          health.success(Date.now(), started, stats.pending, Math.max(stats.age,0));
        } catch {
          health.failure(Date.now());
          console.error(JSON.stringify({ event:"temporal_dependency_check_failed", role:config.role, consecutiveFailures:health.failures }));
        }
        await new Promise(r => setTimeout(r, config.pollMs));
      }
    };
    if (worker) {
      const running=worker.run();
      try { await Promise.race([running, monitor()]); }
      finally { stop(); await running; }
    } else await monitor();
  } finally {
    stop(); await new Promise<void>(r => { if (!server.listening) r(); else server.close(() => r()); });
    await native?.close(); await connection?.close(); await db.end();
  }
}
main().catch(() => { console.error("Temporal service stopped; inspect sanitized health signals and saved run state."); process.exitCode=1; });
