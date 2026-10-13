import {readQuoteWorkerExecution} from "../lib/quotes/worker-execution-generation";
import {quoteActivities} from "../runtime/temporal/quote-routing";
import {tickQuoteOutbox} from "../runtime/temporal/quote-outbox";
import {controlsForExistingQuote} from "../lib/quotes/worker-native-controls";
import {createWorkloadPool } from "../lib/durable/workload-pool";
import {recordActivities} from "../runtime/temporal/record-routing";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:http";
import { Client, Connection } from "@temporalio/client";
import { NativeConnection, Worker, Runtime, DefaultLogger } from "@temporalio/worker";
import { authenticate } from "../lib/durable/service";
import { ConnectorControl } from "../lib/connectors/service";
import { connectorProvider } from "../lib/connectors/hosted";
import { WorkflowControl } from "../lib/workflows/service";
import { activities } from "../runtime/temporal/activities";
import { versionedActivities } from "../runtime/temporal/version-contract";
import { TemporalOutbox } from "../runtime/temporal/outbox";
import { operationsConfig, OperationsHealth, verifyProfileArtifacts, diagnosticProviderWrite } from "../runtime/temporal/operations";
async function main() {
  const config = operationsConfig(process.env, process.argv[2]);
  const profile=process.argv[3]??"ack";if(!["ack","quote"].includes(profile))throw Error("Explicit supported workflow profile required");
  const prefix=profile==="quote"?"quote-temporal":"temporal";
  if (!process.env.LOOPLABS_DATABASE_URL || !process.env.LOOPLABS_TEMPORAL_WORKER_TOKEN) throw Error("Missing workload configuration");
  verifyProfileArtifacts(profile as "ack"|"quote",config.buildId, JSON.parse(await readFile(`.worker/${prefix}-manifest.json`, "utf8")), await readFile(`.worker/${prefix}-service.cjs`), await readFile(`.worker/${prefix}-workflow.cjs`), await readFile("pnpm-lock.yaml"));
  Runtime.install({ logger: new DefaultLogger("WARN") });
  const tls = config.insecureLoopback ? false : {
    ...(config.caPath ? { serverRootCACertificate:await readFile(config.caPath) } : {}),
    ...(config.certPath ? { clientCertPair:{ crt:await readFile(config.certPath), key:await readFile(config.keyPath!) } } : {}),
  };
  const connectionOptions = { address:config.address, tls, apiKey:config.apiKey };
  const db = await createWorkloadPool(process.env,config.role,config.activitySlots+2);
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
    if (actor.subject !== (profile==="quote"?"quote-temporal":"enquiry-temporal") || actor.role !== "worker") throw Error("Wrong workload identity");
    connection = await Connection.connect(connectionOptions);
    const client = new Client({ connection, namespace:config.namespace });
    const outbox = new TemporalOutbox(db);
    if (config.role === "worker") {
      if(profile==="quote"){const file=process.env.LOOPLABS_QUOTE_WORKER_EXECUTION_FILE;if(!file)throw Error("Quote execution-only publication required");await readQuoteWorkerExecution(file);}
      const provider=profile==="ack"?connectorProvider():undefined;
      if (provider && process.env.LOOPLABS_TEMPORAL_PROVIDER_DIAGNOSTICS === "isolated") {
        // Disposable proof opt-in only; no raw exception, request or credential.
        // Rethrow the original failure so containment/retry behavior is unchanged.
        provider.write=diagnosticProviderWrite(provider.write.bind(provider), value =>
          console.error("Provider boundary diagnostic",JSON.stringify(value)));
      }
      native=await NativeConnection.connect(connectionOptions);
      worker=await Worker.create({ connection:native, namespace:config.namespace, taskQueue:config.taskQueue,
        workflowBundle:{ codePath:resolve(`.worker/${prefix}-workflow.cjs`) },
        workerDeploymentOptions:{ version:{ deploymentName:profile==="quote"?"looplabs-quote":"looplabs-acknowledgement", buildId:config.buildId }, useWorkerVersioning:true, defaultVersioningBehavior:"PINNED" },
        maxConcurrentActivityTaskExecutions:config.activitySlots, maxConcurrentWorkflowTaskExecutions:config.workflowSlots,
        activities:profile==="quote"?quoteActivities(db,actor,config.buildId,async plan=>{
          const file=process.env.LOOPLABS_QUOTE_WORKER_EXECUTION_FILE;if(!file)throw Error("Quote execution-only publication required");
          // Installed production launchers never select a disposable execution context.
          return (await controlsForExistingQuote(db,actor,plan,file)).workflow;
        }):versionedActivities(db, actor, activities(new WorkflowControl(db, new ConnectorControl(db, provider!)), actor),recordActivities(db,actor)),
        shutdownGraceTime:"20 seconds" });
    }
    await new Promise<void>((ok, fail) => { server.once("error", fail); server.listen(config.healthPort, "127.0.0.1", ok); });
    const monitor = async () => {
      while (!health.stopping) {
        try {
          await connection!.withDeadline(Date.now()+5000, () => connection!.workflowService.describeNamespace({ namespace:config.namespace }));
          // Reauthenticate on every tick; revoked workloads cannot remain ready.
          await authenticate(db, process.env.LOOPLABS_TEMPORAL_WORKER_TOKEN!);
          const started=config.role === "scheduler" ? await connection!.withDeadline(Date.now()+10000, () => profile==="quote"?tickQuoteOutbox(db,actor,client,config.taskQueue):outbox.tick(actor, client, config.taskQueue)) : 0;
          const stats=(await db.query(profile==="quote"?"SELECT count(*)::integer AS pending,COALESCE(max(extract(epoch FROM now()-created_at)),0)::integer AS age FROM ll_quote_background_routes WHERE org_id=$1 AND state='pending'":"SELECT count(*)::integer AS pending,COALESCE(max(extract(epoch FROM now()-d.created_at)),0)::integer AS age FROM ll_temporal_dispatch t JOIN ll_enquiry_dispatch d ON d.org_id=t.org_id AND d.plan_id=t.plan_id WHERE t.org_id=$1 AND t.state='pending'", [actor.orgId])).rows[0];
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
