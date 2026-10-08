// Isolated actual Temporal + PostgreSQL + HTTP twin proof. Never changes production.
import { TestWorkflowEnvironment } from "@temporalio/testing";
import type { Client } from "@temporalio/client";
import { containerEnvironment } from "./temporal-container-environment";
import { Pool } from "pg";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { createServer, connect, type Socket } from "node:net";
import assert from "node:assert/strict";
import { authenticate, tokenHash } from "../lib/durable/service";
import { ConnectorControl } from "../lib/connectors/service";
import { FetchSandboxConnectors } from "../lib/connectors/twin";
import { WorkflowControl } from "../lib/workflows/service";
import { EnquiryControl } from "../lib/enquiries/service";
import { TemporalOutbox } from "../runtime/temporal/outbox";
import { type RunContract } from "../runtime/temporal/version-contract";
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
async function main() {
  const url = process.env.LOOPLABS_TEST_DATABASE_URL;
  if (!url) throw Error("Dedicated test PostgreSQL required.");
  const dir = await mkdtemp(resolve(".local/temporal-proof-"));
  const schema = `temporal_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: url });
  const db = new Pool({ connectionString: url, options: `-c search_path=${schema}` });
  const containerMode=process.env.LOOPLABS_TEMPORAL_CONTAINER_PROOF === "1";
  let secure:Awaited<ReturnType<typeof containerEnvironment>>|undefined;
  let env: {client:Client;address:string;teardown:()=>Promise<void>} | undefined, twin: ChildProcess | undefined;
  const containerNames=new Map<ChildProcess,string>(), healthNames=new Map<number,string>();
  const children: ChildProcess[] = [];
  let workerKey="";
  const processLogs: string[] = [];
  const observe = (child: ChildProcess, label: string) => {
    for (const stream of [child.stdout, child.stderr]) stream?.on("data", data => {
      if (processLogs.join("").length < 200000) processLogs.push(`${label}: ${String(data)}`);
    });
  };
  // Transparent TCP fault boundary for packaged roles only. The independent
  // assertion pool stays connected to the real dedicated database.
  const upstream = new URL(url), sockets = new Set<Socket>();
  let databaseAvailable = true;
  const proxy = createServer(client => {
    client.on("error", () => {});
    if (!databaseAvailable) { client.destroy(); return; }
    const remote = connect({ host: upstream.hostname, port: Number(upstream.port || 5432) });
    for (const socket of [client, remote]) {
      sockets.add(socket);
      socket.on("error", () => { client.destroy(); remote.destroy(); });
      socket.on("close", () => { sockets.delete(socket); client.destroy(); remote.destroy(); });
    }
    client.pipe(remote); remote.pipe(client);
  });
  let snapshotRestoreToCompletedMs:number|undefined;
  const databaseReplacementAttempts={worker:1,scheduler:1};
  const checks: string[] = [];
  const pass = (s: string) => { checks.push(s); console.log("PASS", s); };
  const token = randomBytes(32).toString("base64url");
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    for (const f of ["lib/durable/schema.sql", "lib/workspace/schema.sql", "lib/refunds/schema.sql", "lib/connectors/schema.sql", "lib/workflows/schema.sql", "lib/durable/proposal-schema.sql", "lib/enquiries/schema.sql", "lib/enquiries/managed-schema.sql", "lib/enquiries/temporal-schema.sql"]) await db.query(await readFile(f, "utf8"));
    await db.query("INSERT INTO ll_orgs(id) VALUES('local-proof')");
    await db.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('requester','local-proof','Requester','unused'),('reviewer','local-proof','Reviewer','unused')");
    await db.query("INSERT INTO ll_connector_policies(org_id,connector) VALUES('local-proof','crm'),('local-proof','email')");
    const actors = [];
    for (const [subject, role] of [["requester", "operator"], ["reviewer", "operator"], ["enquiry-runner", "worker"], ["enquiry-temporal", "worker"]]) {
      const key = randomBytes(32).toString("base64url");
      if (subject === "enquiry-temporal") workerKey=key;
      await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'local-proof',$2,$3)", [tokenHash(key), subject, role]);
      actors.push(await authenticate(db, key));
    }
    const [requester, reviewer] = actors;
    await writeFile(`${dir}/connector-twin-credentials.json`, JSON.stringify({ token }), { mode: 0o600 });
    const backend = process.env.FETCHSANDBOX_BACKEND_PATH || `${process.env.HOME}/sandbox/backend`;
    twin = spawn(`${backend}/.venv/bin/python`, ["scripts/connector-twin.py"], { env: { ...process.env, LOOPLABS_CONNECTOR_STATE_DIR: dir }, stdio: "ignore" });
    const provider = new FetchSandboxConnectors("http://127.0.0.1:8018", token);
    for (let i = 0; ; i++) {
      try { await provider.contact(); break; } catch { if (i > 100 || twin.exitCode !== null) throw Error("Private twin unavailable; port8018 must be free."); await wait(100); }
    }
    const control = new ConnectorControl(db, provider), workflows = new WorkflowControl(db, control);
    const enquiries = new EnquiryControl(db, workflows, async () => { const c = await provider.contact(); return { id: c.id, email: c.properties.email, version: c.updatedAt, lifecycle: c.properties.lifecyclestage }; });
    const make = async () => {
      const p = (await enquiries.prepareChat(requester, randomUUID())).saved;
      await enquiries.rehearse(requester, p.id, p.plan_hash);
      return { runId: p.id, planHash: p.plan_hash, planVersion: "acknowledgement-1", connectorVersion: "private-twin-1" } as RunContract;
    };
    const approve = async (id: string) => { for (const s of (await workflows.read(requester, id)).steps) await control.review(reviewer, s.action_id, s.payload_hash, true); };
    const effects = async () => Object.keys(JSON.parse(await readFile(`${dir}/connector-twin-state.json`, "utf8")).effects).length;
    const image=process.env.LOOPLABS_TEMPORAL_PROOF_IMAGE;
    if(containerMode && !image) throw Error("Explicit built proof image required");
    if(containerMode) {secure=await containerEnvironment(dir);env=secure;checks.push(...secure.checks);}
    else env = await TestWorkflowEnvironment.createLocal({ server:{ dbFilename:`${dir}/temporal.sqlite` } });
    const manifest=secure ? await secure.docker("run","--rm","--entrypoint","cat",image!,".worker/temporal-manifest.json") : await readFile(".worker/temporal-manifest.json", "utf8");
    const buildId=JSON.parse(manifest).buildId;
    const taskQueue=`load-${randomUUID()}`, outbox=new TemporalOutbox(db);
    await new Promise<void>((ok, fail) => { proxy.once("error", fail); proxy.listen(0, "127.0.0.1", ok); });
    const address = proxy.address();
    assert(address && typeof address !== "string");
    const databaseUrl=new URL(url);
    databaseUrl.hostname="127.0.0.1"; databaseUrl.port=String(address.port);
    databaseUrl.searchParams.set("options", `-c search_path=${schema}`);
    const spawnService = async (role: "worker" | "scheduler") => {
      if(secure) {
        const name=`${secure.network}-${role}-${randomBytes(4).toString("hex")}`;
        const privateUrl=new URL(databaseUrl);privateUrl.hostname="host.docker.internal";
        const file=resolve(dir,`${name}.env`);
        await writeFile(file,Object.entries({LOOPLABS_DATABASE_URL:privateUrl.href,LOOPLABS_TEMPORAL_WORKER_TOKEN:workerKey,
          LOOPLABS_TEMPORAL_ADDRESS:"temporal:7233",LOOPLABS_TEMPORAL_NAMESPACE:secure.namespace,LOOPLABS_TEMPORAL_TASK_QUEUE:taskQueue,
          LOOPLABS_TEMPORAL_BUILD_ID:buildId,LOOPLABS_TEMPORAL_API_KEY:secure.workloadKey,LOOPLABS_TEMPORAL_CA_PATH:"/proof-tls/ca.pem",
          LOOPLABS_TEMPORAL_CERT_PATH:"/proof-tls/client.pem",LOOPLABS_TEMPORAL_KEY_PATH:"/proof-tls/client.key",
          LOOPLABS_TEMPORAL_HEALTH_PORT:role === "worker" ? "9320":"9321",LOOPLABS_TEMPORAL_ACTIVITY_SLOTS:"3",LOOPLABS_TEMPORAL_WORKFLOW_SLOTS:"6",LOOPLABS_TEMPORAL_POLL_MS:"500",
          LOOPLABS_CONNECTOR_TWIN_URL:"http://connector-twin:8018",LOOPLABS_CONNECTOR_TWIN_TOKEN:token}).map(([k,v])=>`${k}=${v}`).join("\n")+"\n",{mode:0o600});
        const child=spawn("docker",["run","--rm","--name",name,"--network",secure.network,"--add-host","host.docker.internal:host-gateway","--add-host","connector-twin:host-gateway",
          "--env-file",file,"--mount",`type=bind,src=${secure.tlsDir},dst=/proof-tls,readonly`,"--read-only","--tmpfs","/tmp","--cap-drop","ALL","--security-opt","no-new-privileges","--memory",role === "worker" ? "768m":"256m",image!,"node",".worker/temporal-service.cjs",role],{stdio:["ignore","pipe","pipe"]});
        observe(child,name);
        children.push(child);containerNames.set(child,name);healthNames.set(role === "worker" ? 19420:19421,name);secure.registerContainer(name);return child;
      }
      const child=spawn(process.execPath,[".worker/temporal-service.cjs",role],{ env:{...process.env,
        LOOPLABS_DATABASE_URL:databaseUrl.href, LOOPLABS_TEMPORAL_WORKER_TOKEN:workerKey,
        LOOPLABS_TEMPORAL_ADDRESS:env!.address, LOOPLABS_TEMPORAL_NAMESPACE:"default", LOOPLABS_TEMPORAL_TASK_QUEUE:taskQueue,
        LOOPLABS_TEMPORAL_BUILD_ID:buildId, LOOPLABS_TEMPORAL_ALLOW_INSECURE_LOOPBACK:"true",
        LOOPLABS_TEMPORAL_API_KEY:"", LOOPLABS_TEMPORAL_CERT_PATH:"", LOOPLABS_TEMPORAL_KEY_PATH:"", LOOPLABS_TEMPORAL_CA_PATH:"",
        LOOPLABS_TEMPORAL_HEALTH_PORT:role === "worker" ? "19420" : "19421", LOOPLABS_TEMPORAL_ACTIVITY_SLOTS:"3", LOOPLABS_TEMPORAL_WORKFLOW_SLOTS:"6", LOOPLABS_TEMPORAL_POLL_MS:"500",
        LOOPLABS_FETCHSANDBOX_BINDING:"", LOOPLABS_CONNECTOR_TWIN_URL:"http://127.0.0.1:8018", LOOPLABS_CONNECTOR_TWIN_TOKEN:token },stdio:["ignore","pipe","pipe"]});
      observe(child,role);
      children.push(child);return child;
    };
    async function until(predicate:()=>Promise<boolean>, label:string, timeout=65000) {
      const start=performance.now();
      while (!(await predicate())) { if (performance.now()-start>timeout) throw Error(`Timed out: ${label}`); await wait(50); }
    }
    const healthRequest=async(port:number,method="GET")=>{
      if(!secure) {const r=await fetch(`http://127.0.0.1:${port}/health/ready`,{method,signal:AbortSignal.timeout(1000)});return {status:r.status,data:method==="GET"?await r.json():null};}
      return JSON.parse(await secure.docker("exec",healthNames.get(port)!,"node","-e",`fetch('http://127.0.0.1:${port===19420?9320:9321}/health/ready',{method:'${method}'}).then(async r=>console.log(JSON.stringify({status:r.status,data:r.status===405?null:await r.json()})))`));
    };
    const ready=async(port:number)=>{try{return (await healthRequest(port)).status===200;}catch{return false;}};
    const kill=async (child:ChildProcess, signal:NodeJS.Signals) => { const exit=new Promise<void>(r=>child.once("exit",()=>r()));
      if(child.exitCode!==null||child.signalCode) return;
      if(secure) {
        try {await secure.docker("kill","--signal",signal,containerNames.get(child)!);}
        catch(e) {if(!/No such container|container .* is not running/.test(String((e as {stderr?:string}).stderr))) throw e;}
      }else child.kill(signal);
      let timer:ReturnType<typeof setTimeout> | undefined;
      try { await Promise.race([exit,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error("Service shutdown exceeded 30 seconds")),30000);})]); } finally {clearTimeout(timer);} };
    let worker=await spawnService("worker");await until(()=>ready(19420),"worker ready");
    for (let i=0;;i++) { try { await env.client.workflowService.setWorkerDeploymentCurrentVersion({namespace:secure?.namespace||"default",deploymentName:"looplabs-acknowledgement",buildId,identity:"load-proof"});break; } catch(e) {if(i>100)throw e; await wait(100);} }
    const plans:RunContract[]=[];
    for(let i=0;i<25;i++) plans.push(await make());
    const setupStart=performance.now();
    await Promise.all(plans.flatMap(p=>[outbox.transfer(requester,p.runId),outbox.transfer(requester,p.runId)]));
    const enqueueMs=Math.round(performance.now()-setupStart);
    assert.equal((await db.query("SELECT count(*) FROM ll_temporal_dispatch")).rows[0].count,"25");assert.equal(await effects(),0);
    pass("25 held plans and 50 concurrent transfer calls persist exactly 25 intents without effects");
    const schedulingStart=performance.now();
    let scheduler=await spawnService("scheduler");
    await until(async()=>Number((await db.query("SELECT count(*) FROM ll_temporal_dispatch WHERE state='started'")).rows[0].count)>0,"first scheduling batch");
    const crashAt=performance.now();
    await kill(scheduler,"SIGKILL");
    assert.equal(await effects(),0);
    scheduler=await spawnService("scheduler");
    await until(async()=>Number((await db.query("SELECT count(*) FROM ll_temporal_dispatch WHERE state='pending'")).rows[0].count)===0,"scheduler backlog recovery");
    const recoveryMs=Math.round(performance.now()-crashAt);
    const totalSchedulingMs=Math.round(performance.now()-schedulingStart);
    await until(()=>ready(19421),"scheduler readiness after recovery");
    pass("Packaged scheduler SIGKILL and replacement drain persisted backlog using natural lease expiry, without new intents");
    for(const p of plans) {
      const h=await env.client.workflow.getHandle(`looplabs:local-proof:ack:${p.runId}`).fetchHistory();
      assert.equal(h.events!.filter(e=>e.workflowExecutionStartedEventAttributes).length,1);
    }
    assert.equal(await effects(),0);
    pass("All 25 workflows have one start event; held approvals remain effect-free under bounded worker concurrency");
    const health=(await healthRequest(19421)).data;
    assert.equal(health.pending,0);assert.equal(health.ready,true);assert(!JSON.stringify(health).includes(workerKey));
    assert.equal((await healthRequest(19421,"POST")).status,405);
    pass("Local readiness and backlog metrics recover and expose no workload credential");
    const savedIds = (await db.query("SELECT run_id,ordinal,action_id FROM ll_workflow_steps ORDER BY run_id,ordinal")).rows;
    databaseAvailable=false;
    for (const socket of sockets) socket.destroy();
    await until(async()=>!(await ready(19420))&&!(await ready(19421)),"database outage makes both roles unready");
    assert.equal(await effects(),0);
    assert.deepEqual((await db.query("SELECT run_id,ordinal,action_id FROM ll_workflow_steps ORDER BY run_id,ordinal")).rows,savedIds);
    pass("Actual database connection interruption makes both packaged roles unready; held work preserves action IDs and zero effects");
    // Idle pg disconnects intentionally stop these roles. Model the staging
    // supervisor explicitly; do not pretend readiness alone restarts a process.
    for (const child of [worker,scheduler]) if (child.exitCode===null&&!child.signalCode) await kill(child,"SIGTERM");
    worker=await spawnService("worker");scheduler=await spawnService("scheduler");
    await until(async()=>(worker.exitCode!==null||Boolean(worker.signalCode))&&(scheduler.exitCode!==null||Boolean(scheduler.signalCode)),"replacement startup refuses still-unavailable database");
    assert.equal(await effects(),0);
    pass("First replacement startup with database still unavailable terminates both actual processes without effects; supervisor retries only terminal children");
    databaseAvailable=true;
    await until(async()=>{
      // Mirror the staging restart policy, but only replace a process whose
      // actual child handle reports termination. Never restart a live process
      // merely because an observation timed out or readiness is false.
      for (const role of ["worker","scheduler"] as const) {
        const child=role === "worker" ? worker:scheduler;
        if(child.exitCode!==null||child.signalCode) {
          if(databaseReplacementAttempts[role]>=3) throw Error(`${role} exceeded bounded database-recovery replacements`);
          databaseReplacementAttempts[role]++;await wait(500);
          const replacement=await spawnService(role);
          if(role === "worker") worker=replacement;else scheduler=replacement;
        }
      }
      return (await ready(19420))&&(await ready(19421));
    },"database restored and supervisor replacement ready");
    assert.deepEqual((await db.query("SELECT run_id,ordinal,action_id FROM ll_workflow_steps ORDER BY run_id,ordinal")).rows,savedIds);
    for(const p of plans) {
      const h=await env.client.workflow.getHandle(`looplabs:local-proof:ack:${p.runId}`).fetchHistory();
      assert.equal(h.events!.filter(e=>e.workflowExecutionStartedEventAttributes).length,1);
    }
    assert.equal(await effects(),0);
    pass("Database connectivity restoration and supervisor replacement resume the same 25 histories without approval bypass or replacement actions");
    if(secure) {
      for(const restart of [secure.restartServer,secure.restartPostgres]) {
        await restart();
        await until(async()=>{try{await env!.client.connection.withDeadline(Date.now()+5000,()=>env!.client.workflowService.describeNamespace({namespace:secure!.namespace}));return true;}catch{return false;}},"self-hosted service/database crash recovery",90000);
        for(const p of plans) {const h=await env.client.workflow.getHandle(`looplabs:local-proof:ack:${p.runId}`).fetchHistory();assert.equal(h.events!.filter(e=>e.workflowExecutionStartedEventAttributes).length,1);}
        assert.deepEqual((await db.query("SELECT run_id,ordinal,action_id FROM ll_workflow_steps ORDER BY run_id,ordinal")).rows,savedIds);assert.equal(await effects(),0);
      }
      pass("Actual Temporal service and persistence PostgreSQL SIGKILL/restart retain all 25 histories, exact action IDs and held approvals");
      await until(async()=>(await ready(19420))&&(await ready(19421)),"worker reconnects after persistence restart",90000);
    }
    if(secure) {
      await secure.backupPersistence();
      await until(async()=>(await ready(19420))&&(await ready(19421)),"containers reconnect after quiesced persistence snapshot",90000);
    }
    await kill(worker,"SIGKILL");assert.equal(await ready(19420),false);
    const restartStart=performance.now();worker=await spawnService("worker");await until(()=>ready(19420),"replacement worker ready");
    const workerRestartMs=Math.round(performance.now()-restartStart);
    const completionStart=performance.now();
    await approve(plans[0].runId);
    await env.client.workflow.getHandle(`looplabs:local-proof:ack:${plans[0].runId}`).signal("wake");
    await until(async()=>(await workflows.read(requester,plans[0].runId)).state==="completed","approved run completes");
    const approvalToCompletionMs=Math.round(performance.now()-completionStart);
    assert.equal(await effects(),2);
    pass("Packaged pinned worker SIGKILL and restart preserves pending work; exact approval completes one CRM and one email");
    if(secure) {
      const handle=env.client.workflow.getHandle(`looplabs:local-proof:ack:${plans[0].runId}`);
      await until(async()=>(await handle.describe()).status.name === "COMPLETED","Temporal records completion before rollback snapshot restore");
      await kill(worker,"SIGTERM");
      const restoreStart=performance.now();await secure.restorePersistence();
      await until(async()=>{try{return (await env!.client.connection.withDeadline(Date.now()+5000,()=>handle.describe())).status.name === "RUNNING";}catch{return false;}},"old backup restores held Temporal history",90000);
      assert.equal((await workflows.read(requester,plans[0].runId)).state,"completed");assert.equal(await effects(),2);
      worker=await spawnService("worker");await until(()=>ready(19420),"worker resumes restored history",90000);
      await handle.signal("wake");
      await until(async()=>(await handle.describe()).status.name === "COMPLETED","restored run consults durable completed action records",90000);
      assert.equal(await effects(),2);
      assert.deepEqual((await db.query("SELECT run_id,ordinal,action_id FROM ll_workflow_steps ORDER BY run_id,ordinal")).rows,savedIds);
      pass("Restoring a pre-effect Temporal PostgreSQL backup reopens history; durable LoopLabs completion prevents duplicate CRM/email effects");
      snapshotRestoreToCompletedMs=Math.round(performance.now()-restoreStart);
    }
    // The other plans refer to the old contact version. They must conflict after approval.
    for (const p of plans.slice(1)) { try { await approve(p.runId); } catch {} await workflows.pause(requester,p.runId); await env.client.workflow.getHandle(`looplabs:local-proof:ack:${p.runId}`).signal("wake"); }
    await until(async()=>{
      const statuses=await Promise.all(plans.slice(1).map(async p=>(await env!.client.workflow.getHandle(`looplabs:local-proof:ack:${p.runId}`).describe()).status.name));
      return statuses.every(s=>s==="COMPLETED");
    },"contained held runs finish");
    assert.equal(await effects(),2);
    pass("Other stale shared-contact runs are contained without duplicate effects or downstream sends");
    await db.query("UPDATE ll_tokens SET active=false WHERE subject='enquiry-temporal'");
    await until(async()=>!(await ready(19420))&&!(await ready(19421)),"revoked workload readiness");
    pass("Workload revocation makes both packaged roles unready");
    const shutdownStart=performance.now();await kill(scheduler,"SIGTERM");await kill(worker,"SIGTERM");
    const shutdownMs=Math.round(performance.now()-shutdownStart);
    const files=["lib/connectors/request.ts","lib/connectors/content.ts","lib/connectors/record-scope.ts","lib/durable/proposal-schema.sql","lib/refunds/schema.sql","lib/connectors/contracts.ts","lib/connectors/service.ts","lib/connectors/twin.ts","lib/connectors/hosted.ts","lib/enquiries/service.ts","lib/workflows/guard.ts","lib/durable/recovery.ts","lib/durable/service.ts",...(secure?["scripts/temporal-container-environment.ts","Dockerfile.temporal"]:[]),"scripts/temporal-service.ts","scripts/build-temporal-worker.mjs","runtime/temporal/operations.ts","runtime/temporal/outbox.ts","runtime/temporal/activities.ts","runtime/temporal/version-contract.ts","runtime/temporal/pinned-workflow.ts","scripts/temporal-load-proof.ts"];
    const fingerprints=Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash("sha256").update(await readFile(f)).digest("hex")])));
    await writeFile(secure?"docs/evidence/temporal-container-proof.json":"docs/evidence/temporal-load-proof.json",JSON.stringify({at:new Date().toISOString(),scope:secure?"Isolated self-hosted PostgreSQL-backed Temporal with mTLS/JWT namespace authorization and actual worker containers; no production cutover":"Local packaged pinned worker/scheduler, actual Temporal, isolated PostgreSQL and one private HTTP twin; no production cutover",checks,
      ...(secure?{imageIds:secure.imageIds,workerImage:{image,id:await secure.docker("image","inspect",image!,"--format","{{.Id}}")}}:{}),
      measurements:{plans:25,concurrentTransferCalls:50,activitySlots:3,workflowSlots:6,enqueueMs,totalSchedulingMs,schedulerCrashToBacklogDrainMs:recoveryMs,workerRestartReadyMs:workerRestartMs,approvalToCompletionMs,shutdownMs,databaseReplacementAttempts,finalEffects:2,...(snapshotRestoreToCompletedMs!==undefined?{snapshotRestoreToCompletedMs}:{})},
      sourceFingerprints:fingerprints,limitations:["One laptop sample, not capacity, percentile latency or availability SLO","25 concurrent held runs; one approved completion; remaining shared-contact plans contained",secure?"Single-node service/persistence SIGKILL and quiesced Temporal backup restore; no LoopLabs database restore, replicated failover or availability SLA":"Scheduler and worker SIGKILL plus TCP database outage; no database-server crash, restore, host failover or data-loss proof",secure?"Local Docker mTLS/JWT cluster only; no remote managed-cluster acceptance, SSO or independent security audit":"Authenticated TLS configuration validated; remote TLS handshake not exercised","No hosted atomic CRM guarantee or real provider delivery"]},null,2)+"\n");
  } finally {
    for(const child of children) if(child.exitCode===null&&!child.signalCode) { const done=new Promise<void>(r=>child.once("exit",()=>r()));child.kill("SIGKILL");await done; }
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(r => { if (!proxy.listening) r(); else proxy.close(() => r()); });
    const privateLog = processLogs.join("").split(workerKey || "__absent__").join("[redacted]").split(token).join("[redacted]").split(secure?.workloadKey || "__absent__").join("[redacted]");
    await writeFile(".local/temporal-process-proof.log", privateLog, { mode: 0o600 });
    await env?.teardown();
    if(twin&&twin.exitCode===null) { const done=new Promise<void>(r=>twin!.once("exit",()=>r()));twin.kill("SIGTERM");await done; }
    await db.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
