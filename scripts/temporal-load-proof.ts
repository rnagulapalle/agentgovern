import {validateInstalledProofConstruction} from './current-proof-source-registry.mjs';
import {sanitizedProofFailure} from "./temporal-proof-failure";
import {verifyProofSource} from "./temporal-proof-source";
import {publishTemporalProofRecord} from "./temporal-proof-record";
import {ScopeControl} from "../lib/connectors/scopes";
import {registerAgent} from "../lib/workspace/agents";
import {TemporalAdmission} from "../runtime/temporal/admission";
import {quiesceOwnedProof,stopOwnedProcess} from "./temporal-owned-process-cleanup";
import {scopedPoolOptions,parseTransport} from "../lib/durable/pg-transport";
import {bootstrapTenantContext} from "../lib/workspace/tenant-bootstrap";
import {readOwnedPrivateFile} from "../lib/workspace/owned-private-file";
import {installTemporalProofRoles} from "./temporal-installed-fixture";
import {publishTemporalProofRole} from "./temporal-runtime-publication";
import {startupCategories,workloadPublicationPresence} from "./temporal-startup-diagnostics";
// Isolated actual Temporal + PostgreSQL + HTTP twin proof. Never changes production.
import { TestWorkflowEnvironment } from "@temporalio/testing";
import type { Client } from "@temporalio/client";
import { containerEnvironment } from "./temporal-container-environment";
import { Pool } from "pg";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFile, writeFile, mkdtemp, rm, mkdir, realpath } from "node:fs/promises";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { createServer, connect, type Socket } from "node:net";
import { networkInterfaces } from "node:os";
import { containerHostAddress, fixtureRelay } from "./container-host-transport";
import assert from "node:assert/strict";
import { authenticate, tokenHash } from "../lib/durable/service";
import {digest} from "../lib/workspace/identity";
import { ConnectorControl } from "../lib/connectors/service";
import { FetchSandboxConnectors } from "../lib/connectors/twin";
import { WorkflowControl } from "../lib/workflows/service";
import { EnquiryControl } from "../lib/enquiries/service";
import { TemporalOutbox } from "../runtime/temporal/outbox";
import { type RunContract } from "../runtime/temporal/version-contract";
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
let phase="inputs";let capturedFailure:ReturnType<typeof sanitizedProofFailure>|undefined;let cleanupFailure:ReturnType<typeof sanitizedProofFailure>|undefined;
async function main() {
 validateInstalledProofConstruction();
  const url = process.env.LOOPLABS_TEST_DATABASE_URL;
  if (!url) throw Error("Dedicated test PostgreSQL required.");
  await mkdir(".local",{recursive:true,mode:0o700});
  const dir = await realpath(await mkdtemp(resolve(".local/temporal-proof-")));
  const schema = `temporal_${randomBytes(8).toString("hex")}`;
  assert(process.env.LOOPLABS_TEMPORAL_PROOF_DATABASE_TRANSPORT,"Explicit owned verified TLS PostgreSQL proof required");
  const transportInput=await readOwnedPrivateFile(process.env.LOOPLABS_TEMPORAL_PROOF_DATABASE_TRANSPORT,16384);
  const transport=parseTransport(JSON.parse(transportInput.bytes.toString()));assert(transport.mode==="verified-tls"&&transport.trust==="owned-ca");await transportInput.assertStable();
  const admin = new Pool(await scopedPoolOptions({url,schema:"public",purpose:"installer",transport}));
  const db = new Pool(await scopedPoolOptions({url,schema,purpose:"installer",transport}));
  let installed:Awaited<ReturnType<typeof installTemporalProofRoles>>|undefined,web:Awaited<ReturnType<typeof bootstrapTenantContext>>|undefined;
  const containerMode=process.env.LOOPLABS_TEMPORAL_CONTAINER_PROOF === "1";
  let secure:Awaited<ReturnType<typeof containerEnvironment>>|undefined;
  let env: {client:Client;address:string;teardown:()=>Promise<void>} | undefined, twin: ChildProcess | undefined;
  const containerOwner=randomBytes(24).toString("hex");let expectedImageId="";let schemaOid:string|undefined;
  const containerNames=new Map<ChildProcess,string>(), healthNames=new Map<number,string>();
  const children: ChildProcess[] = [];
  let workerKey="";
  let stopFixtureRelay: Awaited<ReturnType<typeof fixtureRelay>> | undefined;
  const processLogs: string[] = [];
  let publicationDiagnostic=workloadPublicationPresence({});
  const observe = (child: ChildProcess, label: string) => {
    child.on("error",()=>processLogs.push("owned_child_spawn_failed"));
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
  let pendingReceipt:unknown,artifactEvidence:unknown;let containersConfirmed=false;
  const receiptPath=process.env.LOOPLABS_TEMPORAL_PROOF_RECEIPT;assert(receiptPath,"Explicit exclusive new receipt path required; old receipts remain unchanged");
  const sourceFile=process.env.LOOPLABS_TEMPORAL_PROOF_SOURCE_MANIFEST,sourceSha=process.env.LOOPLABS_TEMPORAL_PROOF_SOURCE_SHA;assert(sourceFile&&sourceSha&&/^[a-f0-9]{64}$/.test(sourceSha));
  const sourceBytes=await readFile(sourceFile);assert.equal(createHash("sha256").update(sourceBytes).digest("hex"),sourceSha);const sourceHashes=JSON.parse(sourceBytes.toString()).sourceHashes as Record<string,string>;assert(sourceHashes&&Object.keys(sourceHashes).length>=956);
  const verifySources=async()=>{for(const [file,sha]of Object.entries(sourceHashes))await verifyProofSource(file,sha,process.cwd());};phase="frozen-source-preflight";await verifySources();
  let snapshotRestoreToCompletedMs:number|undefined;
  const databaseReplacementAttempts={worker:1,scheduler:1};
  const checks: string[] = [];
  const pass = (s: string) => { checks.push(s); console.log("PASS", s); };
  const token = randomBytes(32).toString("base64url");
  try {
    phase="owned-schema-install";await admin.query(`CREATE SCHEMA ${schema}`);schemaOid=(await admin.query("SELECT oid::text oid FROM pg_namespace WHERE nspname=$1",[schema])).rows[0].oid;
    installed=await installTemporalProofRoles({url,transport,schema,generation:resolve(dir,"role-generation"),epoch:randomUUID(),installation:"p"+randomBytes(8).toString("hex"),seed:async owner=>{
      await owner.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('requester','local-proof','Requester','unused'),('reviewer','local-proof','Reviewer','unused')");
      await owner.query("INSERT INTO ll_connector_policies(org_id,connector) VALUES('local-proof','crm'),('local-proof','email')");
    }});
    phase="scoped-web-bootstrap";web=await bootstrapTenantContext(installed.webFile);
    await writeFile(process.env.LOOPLABS_TEMPORAL_PROOF_RECEIPT+".resources.json",JSON.stringify({schema,schemaOid,roles:installed.roles})+"\n",{mode:0o600,flag:"wx"});
    const actors = [];
    for (const [subject, role] of [["requester", "operator"], ["reviewer", "operator"], ["enquiry-runner", "worker"], ["enquiry-temporal", "worker"]]) {
      const key = randomBytes(32).toString("base64url");
      if (subject === "enquiry-temporal") workerKey=key;
      phase="legacy-fixture-token-seed";await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'local-proof',$2,$3)", [tokenHash(key), subject, role]);
      phase="legacy-fixture-token-auth";actors.push(await authenticate(db, key));
    }
    const [legacyRequester, legacyReviewer] = actors;
    assert((await db.query("SELECT to_regprocedure('ll_membership_authority23()') AS installed")).rows[0].installed);
    const members = [];
    let productDb:Pool|undefined;
    for (const email of ["requester", "reviewer"]) {
      const session = randomBytes(32).toString("base64url");
      phase="named-fixture-session-seed";await db.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES($1,$2,now()+interval '1 hour')", [digest(session), email]);
      phase="named-scoped-session-auth";const context=await web.context.member(session);assert(context.actor);productDb=context.db;members.push(context.actor);
    }
    const [requester, reviewer] = members;
    await writeFile(`${dir}/connector-twin-credentials.json`, JSON.stringify({ token }), { mode: 0o600 });
    const backend = process.env.FETCHSANDBOX_BACKEND_PATH || `${process.env.HOME}/sandbox/backend`;
    const proofRecord=await publishTemporalProofRecord(dir);
    phase="owned-provider-start";twin = spawn(`${backend}/.venv/bin/python`, ["scripts/connector-twin.py"], { env: { NODE_ENV:"test",PATH:process.env.PATH,HOME:process.env.HOME,LC_ALL:"C",LANG:"C", FETCHSANDBOX_BACKEND_PATH:backend, LOOPLABS_CONNECTOR_STATE_DIR: dir }, stdio: "ignore" });
    twin.on("error",()=>processLogs.push("owned_provider_spawn_failed"));
    const provider = new FetchSandboxConnectors("http://127.0.0.1:8018", token,1500,proofRecord);
    for (let i = 0; ; i++) {
      try { await provider.contact(); break; } catch { if (i > 100 || twin.exitCode !== null) throw Error("Private twin unavailable; port8018 must be free."); await wait(100); }
    }
    assert(productDb);const control = new ConnectorControl(productDb, provider), workflows = new WorkflowControl(productDb, control);

    const make = async () => {
      const p = (await enquiries.prepareChat(requester, randomUUID())).saved;
      assert.deepEqual((await db.query("SELECT membership_owner FROM ll_enquiry_plans WHERE id=$1", [p.id])).rows[0].membership_owner, {kind:"member",subject:"requester",generation:"1"});
      for(const [agentId,role,connector]of [[`ack-crm-${p.id}`,"crm_agent","crm_twin"],[`ack-email-${p.id}`,"email_agent","email_twin"]] as const){await registerAgent(productDb!,requester,{id:agentId,name:"Installed load proof scoped assistant",owner:requester.subject,role,connector,actionLimit:1});await scopes.grant(requester,enrollment.id,agentId);}
      await enquiries.rehearse(requester, p.id, p.plan_hash);
      const proposals = (await db.query("SELECT membership_proposal FROM ll_connector_actions WHERE id IN (SELECT action_id FROM ll_workflow_steps WHERE run_id=$1)", [p.id])).rows;
      assert.equal(proposals.length, 2);
      assert(proposals.every(row => row.membership_proposal?.planOwner?.subject === "requester" && row.membership_proposal.planOwner.generation === "1"));
      return { runId: p.id, planHash: p.plan_hash, planVersion: "acknowledgement-1", connectorVersion: "private-record-twin-2" } as RunContract;
    };
    const approve = async (id: string) => { for (const s of (await workflows.read(requester, id)).steps) {
      await control.review(reviewer, s.action_id, s.payload_hash, true);
      const approval = (await db.query("SELECT membership_approval FROM ll_connector_actions WHERE id=$1", [s.action_id])).rows[0].membership_approval;
      assert.deepEqual(approval.approver, {kind:"member",subject:"reviewer",generation:"1"});
      assert.equal(approval.payloadHash, s.payload_hash);
    } };
    const effects = async () => Object.keys(JSON.parse(await readFile(`${dir}/connector-twin-state.json`, "utf8")).effects).length;
    phase="actual-worker-artifact-admission";const image=process.env.LOOPLABS_TEMPORAL_PROOF_IMAGE;
    if(containerMode && !image) throw Error("Explicit built proof image required");
    if(containerMode) {secure=await containerEnvironment(dir);env=secure;checks.push(...secure.checks);}
    else env = await TestWorkflowEnvironment.createLocal({ server:{ dbFilename:`${dir}/temporal.sqlite` } });
    const manifest=secure ? await secure.docker("run","--rm","--entrypoint","cat",image!,".worker/temporal-manifest.json") : await readFile(".worker/temporal-manifest.json", "utf8");
    assert(manifest.trim(),"Built worker manifest is empty; rebuild and verify storage before running proof");
    const built=JSON.parse(manifest);
    assert.equal(built.version,1);assert.match(built.artifactHash,/^[a-f0-9]{64}$/);assert.equal(built.buildId,`ack-${built.artifactHash}`);
    const measured=secure ? await secure.docker("run","--rm","--entrypoint","node",image!,"-e",'const fs=require("fs"),h=require("crypto").createHash("sha256");for(const f of [".worker/temporal-service.cjs",".worker/temporal-workflow.cjs","pnpm-lock.yaml"]){const b=fs.readFileSync(f);if(!b.length)throw Error("Empty packaged artifact: "+f);h.update(b);}console.log(h.digest("hex"));') : createHash("sha256").update(await readFile(".worker/temporal-service.cjs")).update(await readFile(".worker/temporal-workflow.cjs")).update(await readFile("pnpm-lock.yaml")).digest("hex");
    assert.equal(measured.trim(),built.artifactHash,"Packaged worker bytes must match their content-bound manifest");
    if(secure){
      const {enrollInspectedWorker}=await import("./worker-artifact-enrollment.mjs");
      const imageId=(await secure.docker("image","inspect",image!,"--format","{{.Id}}")).trim();expectedImageId=imageId;
      const enrolled=await enrollInspectedWorker(db,imageId,(...args:string[])=>execFileSync("docker",args,{encoding:"utf8",timeout:60000,maxBuffer:16*1024*1024}),"ack");
      assert.equal(enrolled.buildId,built.buildId,"Selected immutable image must be genuinely admitted before transfer");artifactEvidence=enrolled;
    }else {
      const directory=process.env.LOOPLABS_TEMPORAL_PROOF_ARTIFACT_DIRECTORY,imageId=process.env.LOOPLABS_TEMPORAL_PROOF_ARTIFACT_IMAGE_ID;
      assert(directory&&imageId,"Independently authenticated image-byte intake required for offline owner enrollment");
      const {enrollExtractedWorker}=await import("./worker-artifact-enrollment.mjs");
      const enrolled=await enrollExtractedWorker(db,imageId,directory,"ack");assert.equal(enrolled.buildId,built.buildId);artifactEvidence=enrolled;
      assert.equal(createHash("sha256").update(await readFile(`${directory}/temporal-service.cjs`)).digest("hex"),createHash("sha256").update(await readFile(".worker/temporal-service.cjs")).digest("hex"));
      assert.equal(createHash("sha256").update(await readFile(`${directory}/temporal-workflow.cjs`)).digest("hex"),createHash("sha256").update(await readFile(".worker/temporal-workflow.cjs")).digest("hex"));
    }
    const buildId=built.buildId;
    const scopes=new ScopeControl(productDb,provider),enrollment=await scopes.enroll(requester,randomUUID());
    assert.equal(enrollment.contact_id,proofRecord.contactId);assert.equal(enrollment.recipient,proofRecord.recipient);assert.equal(enrollment.binding_id,provider.bindingId);assert.equal(enrollment.contract_version,"private-record-twin-2");
    const enquiries = new EnquiryControl(productDb, workflows, async () => { const c = await provider.contact(); return { id: c.id, email: c.properties.email, version: c.updatedAt, lifecycle: c.properties.lifecyclestage }; },enrollment.contact_id,new TemporalAdmission(productDb,buildId));
    const taskQueue=`load-${randomUUID()}`, outbox=new TemporalOutbox(productDb,buildId);
    const bridgeGateway=secure && process.platform==="linux" ? await secure.docker("network","inspect","bridge","--format","{{(index .IPAM.Config 0).Gateway}}") : "";
    const hostAddress=containerHostAddress(secure ? process.platform : "darwin",bridgeGateway,Object.values(networkInterfaces()).flatMap(rows => (rows || []).map(row=>row.address)));
    if (secure && process.platform==="linux") stopFixtureRelay=await fixtureRelay(hostAddress,8018);
    await new Promise<void>((ok, fail) => { proxy.once("error", fail); proxy.listen(0, hostAddress, ok); });
    const address = proxy.address();
    assert(address && typeof address !== "string");
    const publications=new Map<"worker"|"scheduler",Awaited<ReturnType<typeof publishTemporalProofRole>>>();
    for(const role of ["worker","scheduler"] as const){const local=installed.environment(role);publications.set(role,await publishTemporalProofRole(local.LOOPLABS_WORKLOAD_INSTALLATION_FILE,resolve(dir,"runtime-"+role),role,secure?"host.docker.internal":"127.0.0.1",address.port,secure?"/proof-db/ca.pem":transport.caFile));}

    publicationDiagnostic=workloadPublicationPresence(publications.get("worker")!.environment);
    const spawnService = async (role: "worker" | "scheduler") => {
      if(secure) {
        const name=`${secure.network}-${role}-${randomBytes(4).toString("hex")}`;
        const publication=publications.get(role);assert(publication);
        const file=resolve(dir,`${name}.env`);
        await writeFile(file,Object.entries({...publication.environment,LOOPLABS_TEMPORAL_WORKER_TOKEN:workerKey,
          LOOPLABS_TEMPORAL_ADDRESS:"temporal:7233",LOOPLABS_TEMPORAL_NAMESPACE:secure.namespace,LOOPLABS_TEMPORAL_TASK_QUEUE:taskQueue,
          LOOPLABS_TEMPORAL_BUILD_ID:buildId,LOOPLABS_TEMPORAL_RECORD_BUILD_ID:buildId,LOOPLABS_TEMPORAL_API_KEY:secure.workloadKey,LOOPLABS_TEMPORAL_CA_PATH:"/proof-tls/ca.pem",
          LOOPLABS_TEMPORAL_CERT_PATH:"/proof-tls/client.pem",LOOPLABS_TEMPORAL_KEY_PATH:"/proof-tls/client.key",
          LOOPLABS_TEMPORAL_HEALTH_PORT:role === "worker" ? "9320":"9321",LOOPLABS_TEMPORAL_ACTIVITY_SLOTS:"3",LOOPLABS_TEMPORAL_WORKFLOW_SLOTS:"6",LOOPLABS_TEMPORAL_POLL_MS:"500",
          LOOPLABS_TEMPORAL_PROVIDER_DIAGNOSTICS:"isolated",LOOPLABS_CONNECTOR_TWIN_URL:"http://connector-twin:8018",LOOPLABS_CONNECTOR_TWIN_TOKEN:token}).map(([k,v])=>`${k}=${v}`).join("\n")+"\n",{mode:0o600});
        const hostMapping=process.platform==="linux" ? hostAddress : "host-gateway";
        const child=spawn("docker",["run","--rm","--name",name,"--label",`looplabs.load.owner=${containerOwner}`,"--network",secure.network,"--add-host",`host.docker.internal:${hostMapping}`,"--add-host",`connector-twin:${hostMapping}`,
          "--env-file",file,"--user",`${process.getuid!()}:${process.getgid!()}`,"--mount",`type=bind,src=${publication.directory},dst=/proof-runtime,readonly`,"--mount",`type=bind,src=${transport.caFile},dst=/proof-db/ca.pem,readonly`,"--mount",`type=bind,src=${secure.tlsDir},dst=/proof-tls,readonly`,"--read-only","--tmpfs","/tmp","--cap-drop","ALL","--security-opt","no-new-privileges","--memory",role === "worker" ? "768m":"256m",image!,"node",".worker/temporal-service.cjs",role],{stdio:["ignore","pipe","pipe"]});
        observe(child,name);
        children.push(child);containerNames.set(child,name);healthNames.set(role === "worker" ? 19420:19421,name);secure.registerContainer(name);return child;
      }
      const child=spawn(process.execPath,[".worker/temporal-service.cjs",role],{ env:{NODE_ENV:"test",PATH:process.env.PATH,HOME:process.env.HOME,LC_ALL:"C",LANG:"C",
        ...publications.get(role)!.environment, LOOPLABS_TEMPORAL_WORKER_TOKEN:workerKey,
        LOOPLABS_TEMPORAL_ADDRESS:env!.address, LOOPLABS_TEMPORAL_NAMESPACE:"default", LOOPLABS_TEMPORAL_TASK_QUEUE:taskQueue,
        LOOPLABS_TEMPORAL_BUILD_ID:buildId,LOOPLABS_TEMPORAL_RECORD_BUILD_ID:buildId, LOOPLABS_TEMPORAL_ALLOW_INSECURE_LOOPBACK:"true",
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
    const probeWorker=async(worker:ChildProcess)=>{if (secure) {
      // Probe the actual worker's provider route, credentials and read contract.
      // Host-side fixture reads do not prove container connector connectivity.
      const probe=JSON.parse(await secure.docker("exec",containerNames.get(worker)!,"node","-e",`fetch(process.env.LOOPLABS_CONNECTOR_TWIN_URL+'/crm/crm/v3/objects/contacts/${proofRecord.contactId}',{headers:{Authorization:'Bearer '+process.env.LOOPLABS_CONNECTOR_TWIN_TOKEN},signal:AbortSignal.timeout(5000)}).then(async r=>{const c=r.ok?await r.json():null;console.log(JSON.stringify({status:r.status,expectedRecord:c?.id===${JSON.stringify(proofRecord.contactId)}&&c?.properties?.email===${JSON.stringify(proofRecord.recipient)}&&typeof c?.updatedAt==='string'}));}).catch(()=>console.log(JSON.stringify({status:0,expectedRecord:false})));`));
      console.log("Worker provider read probe",JSON.stringify(probe));
      assert.deepEqual(probe,{status:200,expectedRecord:true},"Actual worker provider route/read contract unavailable; no approval attempted.");
    }};
    phase="actual-worker-start";let worker=await spawnService("worker");await until(()=>ready(19420),"worker ready");
    if(secure){await probeWorker(worker);pass("Actual worker container reads the authenticated private fixture through its configured provider route");}
    for (let i=0;;i++) { try { await env.client.workflowService.setWorkerDeploymentCurrentVersion({namespace:secure?.namespace||"default",deploymentName:"looplabs-acknowledgement",buildId,identity:"load-proof"});break; } catch(e) {if(i>100)throw e; await wait(100);} }
    const plans:RunContract[]=[];
    for(let i=0;i<25;i++) plans.push(await make());
    phase="actual-held-run-recovery";const setupStart=performance.now();
    await assert.rejects(() => enquiries.prepareChat(legacyRequester, randomUUID()));
    const held = (await workflows.read(requester, plans[0].runId)).steps[0];
    await assert.rejects(() => control.review(legacyReviewer, held.action_id, held.payload_hash, true));
    await assert.rejects(() => outbox.transfer(legacyRequester, plans[0].runId));
    assert.equal(await effects(), 0);
    pass("Installed migration23 records named-session generation1 authority; retained same-subject bearer proposal, approval and transfer are refused without effects");
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
    if(secure){await probeWorker(worker);pass("Replacement worker container retains authenticated provider connectivity after injected recovery faults");}
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
    await verifySources();const fingerprints=sourceHashes;
    pendingReceipt={workerArtifact:artifactEvidence,contract:"installed-temporal-load-2",reviewedManifestSha256:sourceSha,at:new Date().toISOString(),scope:secure?"Isolated self-hosted PostgreSQL-backed Temporal with mTLS/JWT namespace authorization and actual worker containers; no production cutover":"Local packaged pinned worker/scheduler, actual Temporal, isolated PostgreSQL and one private HTTP twin; no production cutover",checks,
      ...(secure?{imageIds:secure.imageIds,workerImage:{image,id:await secure.docker("image","inspect",image!,"--format","{{.Id}}")}}:{}),
      measurements:{plans:25,concurrentTransferCalls:50,activitySlots:3,workflowSlots:6,enqueueMs,totalSchedulingMs,schedulerCrashToBacklogDrainMs:recoveryMs,workerRestartReadyMs:workerRestartMs,approvalToCompletionMs,shutdownMs,databaseReplacementAttempts,finalEffects:2,...(snapshotRestoreToCompletedMs!==undefined?{snapshotRestoreToCompletedMs}:{})},
      sourceFingerprints:fingerprints,limitations:["One laptop sample, not capacity, percentile latency or availability SLO","25 concurrent held runs; one approved completion; remaining shared-contact plans contained",secure?"Single-node service/persistence SIGKILL and quiesced Temporal backup restore; no LoopLabs database restore, replicated failover or availability SLA":"Scheduler and worker SIGKILL plus TCP database outage; no database-server crash, restore, host failover or data-loss proof",secure?"Local Docker mTLS/JWT cluster only; no remote managed-cluster acceptance, SSO or independent security audit":"Authenticated TLS configuration validated; remote TLS handshake not exercised","No hosted atomic CRM guarantee or real provider delivery"]};
  } catch (error) {
    capturedFailure=sanitizedProofFailure(error,phase);
    // Only bounded state counts and fixed error categories leave the disposable
    // trial. No payloads, identities, references, tokens or raw logs are printed.
    try {
      const counts = async (table: string) => (await db.query(`SELECT state,count(*)::int AS count FROM ${table} GROUP BY state ORDER BY state`)).rows;
      const log = processLogs.join("");
      const reasons = Object.fromEntries(Object.entries({
        bindingRefused:/saved_request_binding_refused/g, descriptionRefused:/saved_request_description_refused/g,
        providerTypeErrors:/"kind":"type_error"/g, providerReferenceErrors:/"kind":"reference_error"/g,
        connectionRefused:/ECONNREFUSED/g, dnsUnavailable:/ENOTFOUND/g,
        connectTimeout:/UND_ERR_CONNECT_TIMEOUT/g, socketFailure:/UND_ERR_SOCKET/g, connectionReset:/ECONNRESET/g,
        invalidArgument:/ERR_INVALID_ARG_TYPE|ERR_INVALID_URL/g,
        activityFailed:/Activity failed/g, connectorUnavailable:/Connector evidence unavailable/g,
        savedRequestChanged:/Saved connector request or destination changed/g,
        authorityRefused:/not authorized|Unauthorized|Permission denied/gi,
        workflowNondeterminism:/nondeterminism|non-determinism/gi,
      }).map(([name,pattern]) => [name,[...log.matchAll(pattern)].length]));
      console.error("Bounded recovery diagnostic",JSON.stringify({
        runStates:await counts("ll_workflow_runs"), actionStates:await counts("ll_connector_actions"),
        dispatchStates:await counts("ll_temporal_dispatch"), reasons,
        startup:startupCategories(log),
        workloadPublication:publicationDiagnostic,
        fixtureTransport:stopFixtureRelay?.snapshot() ?? null,
        recordedProviderEffects:Object.keys(JSON.parse(await readFile(`${dir}/connector-twin-state.json`,"utf8")).effects).length,
        children:children.map(child=>({exitCode:child.exitCode,signal:child.signalCode})),
      }));
    } catch { console.error("Bounded recovery diagnostics unavailable; original failure retained."); }
    throw error;
  } finally {
    try{phase="owned-quiescence-cleanup";await quiesceOwnedProof({
      children,
      stopContainers:async()=>{if(secure)for(const name of containerNames.values()){
        let row;try{row=JSON.parse(await secure.docker("inspect",name))[0];}catch(error){if(/No such object|No such container/.test(String((error as {stderr?:string}).stderr)))continue;throw Error("Owned container observation unavailable");}
        assert.equal(row.Config.Labels?.["looplabs.load.owner"],containerOwner);assert.equal(row.Image,expectedImageId);
        await secure.docker("rm","-f",name);
        await assert.rejects(secure.docker("inspect",name),error=>/No such object|No such container/.test(String((error as {stderr?:string}).stderr)));
      }containersConfirmed=true;},
      stopProviders:async()=>{if(twin)await stopOwnedProcess(twin);for(const socket of sockets)socket.destroy();await stopFixtureRelay?.();await new Promise<void>((ok,fail)=>{if(!proxy.listening)ok();else proxy.close(error=>error?fail(error):ok());});if(!containersConfirmed)throw Error("Owned container cleanup unconfirmed; shared teardown withheld");await env?.teardown();},
      closePools:async()=>{await web?.close();await installed?.close();await db.end();},
    });
    await writeFile(".local/temporal-process-startup-categories.json", JSON.stringify(startupCategories(processLogs.join("")))+"\n", { mode: 0o600 });
    if(installed)for(const [role,oid]of Object.entries(installed.roles)){assert.equal((await admin.query("SELECT oid::text oid FROM pg_roles WHERE rolname=$1",[role])).rows[0]?.oid,oid);await admin.query(`DROP OWNED BY ${role}`);await admin.query(`DROP ROLE ${role}`);}
    if(schemaOid)assert.equal((await admin.query("SELECT oid::text oid FROM pg_namespace WHERE nspname=$1",[schema])).rows[0]?.oid,schemaOid);
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();await rm(dir,{recursive:true,force:true});
    await writeFile(receiptPath+".cleanup.json",JSON.stringify({ownedProcessesTerminal:true,ownedPoolsClosed:true,exactRolesAndSchemaRemoved:true,privateGenerationRemoved:true})+"\n",{mode:0o600,flag:"wx"});
    if(pendingReceipt){await verifySources();await writeFile(receiptPath,JSON.stringify({...pendingReceipt as object,cleanup:{ownedProcessesTerminal:true,ownedPoolsClosed:true,exactRolesAndSchemaRemoved:true,privateGenerationRemoved:true}},null,2)+"\n",{mode:0o600,flag:"wx"});}
    }catch(error){cleanupFailure=sanitizedProofFailure(error,phase);throw error;}
  }
}
main().catch(error=>{console.error(JSON.stringify({scope:"installed-temporal-load",...(capturedFailure??sanitizedProofFailure(error,phase)),cleanupFailure,passed:false}));process.exitCode=1;});
