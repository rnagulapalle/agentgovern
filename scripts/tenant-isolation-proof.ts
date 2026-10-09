// Real Next HTTP API + packaged Temporal roles + PostgreSQL + private HTTP twins.
import type {WorkflowHandle} from "@temporalio/client";
import {TestWorkflowEnvironment} from "@temporalio/testing";
import {Worker} from "@temporalio/worker";
import {Pool} from "pg";
import {spawn,type ChildProcess} from "node:child_process";
import {randomBytes,randomUUID,createHash} from "node:crypto";
import {readFile,writeFile,mkdtemp,rm} from "node:fs/promises";
import {resolve} from "node:path";
import assert from "node:assert/strict";
import {authenticate,tokenHash} from "../lib/durable/service";
import {FetchSandboxConnectors} from "../lib/connectors/twin";
import {ConnectorControl} from "../lib/connectors/service";
import {ScopeControl} from "../lib/connectors/scopes";
import {WorkflowControl} from "../lib/workflows/service";
import {EnquiryControl} from "../lib/enquiries/service";
import {submitScoped} from "../lib/enquiries/submission";
import {recordActivities} from "../runtime/temporal/record-routing";
import {chromium,expect,type Browser,type BrowserContext,type Page,type Response} from "@playwright/test";
import {passwordHash} from "../lib/workspace/auth";
const origin="http://localhost:3117",wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until(test:()=>Promise<boolean>,label:string,timeout=15000){const start=Date.now();while(!(await test())){if(Date.now()-start>timeout)throw Error(`Unavailable: ${label}`);await wait(100);}}
async function main(){
 const load=process.env.LOOPLABS_TENANT_LOAD_PROOF==="1";if(process.env.LOOPLABS_TENANT_LOAD_PROOF&&!load)throw Error("Unsupported tenant workload mode");
 const url=process.env.LOOPLABS_TEST_DATABASE_URL;if(!url)throw Error("Dedicated test PostgreSQL required");
 const recoveryEpoch=randomUUID();
 const schema=`tenant_proof_${randomBytes(8).toString("hex")}`,dir=await mkdtemp(resolve(".local/tenant-proof-")),token=randomBytes(32).toString("base64url");
 const admin=new Pool({connectionString:url}),db=new Pool({connectionString:url,options:`-c search_path=${schema}`});
 const runtimeRole=`ll_tenant_${randomBytes(8).toString("hex")}`,runtimePassword=randomBytes(32).toString("base64url");let runtime:Pool|undefined,roleCreated=false;
 const provisioningFiles=["scripts/durable-runtime-role.ts","scripts/workspace-setup.ts","scripts/refund-setup.ts","scripts/connector-setup.ts","scripts/enquiry-setup.ts","scripts/enquiry-managed-setup.ts","scripts/temporal-setup.ts","scripts/workspace-recovery.ts","scripts/record-scope-setup.ts","scripts/record-routing-setup.ts"];
 const records=[{version:"record-scope-1" as const,workspaceId:"company-a",contactId:"4001",recipient:"alice@example.test"},{version:"record-scope-1" as const,workspaceId:"company-b",contactId:"4002",recipient:"bob@example.test"}];
 const loadRecords=load?companiesRecords():[];
 function companiesRecords(){return ["company-a","company-b"].flatMap((workspaceId,index)=>Array.from({length:12},(_,i)=>({version:"record-scope-1" as const,workspaceId,contactId:String(4101+index*100+i),recipient:`tenant${index+1}-customer${i+1}@example.test`})) );}
 const catalogRecords=[...records,...loadRecords];
 let loadMeasurement:object|undefined;
 let app:ChildProcess|undefined,twin:ChildProcess|undefined,browser:Browser|undefined,temporal:TestWorkflowEnvironment|undefined;const children:ChildProcess[]=[];const checks:string[]=[];let denied=0;const password=randomBytes(24).toString("base64url"),hashedPassword=passwordHash(password);
 const pass=(s:string)=>{checks.push(s);console.log("PASS",s);};
 const request=async(key:string,path:string,p?:object)=>{const response=await fetch(origin+path,{headers:{Authorization:`Bearer ${key}`,Origin:origin,...(p?{"Content-Type":"application/json"}:{})},...(p?{method:"POST",body:JSON.stringify(p)}:{})});return {status:response.status,data:await response.json()};};
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);
  for(const f of ["lib/durable/schema.sql","lib/workspace/schema.sql","lib/refunds/schema.sql","lib/connectors/schema.sql","lib/workflows/schema.sql","lib/durable/proposal-schema.sql","lib/enquiries/schema.sql","lib/enquiries/managed-schema.sql","lib/enquiries/temporal-schema.sql","lib/durable/recovery-schema.sql","lib/connectors/scope-schema.sql","lib/enquiries/record-routing-schema.sql"])await db.query(await readFile(f,"utf8"));
  await writeFile(`${dir}/connector-twin-credentials.json`,JSON.stringify({token}),{mode:0o600});await writeFile(`${dir}/connector-twin-records.json`,JSON.stringify({records:catalogRecords}),{mode:0o600});
  await writeFile(`${dir}/connector-twin-faults.json`,JSON.stringify({loseResponseRecords:load?["4001","4105","4209"]:["4001"]}),{mode:0o600});
  const backend=process.env.FETCHSANDBOX_BACKEND_PATH||`${process.env.HOME}/sandbox/backend`;
  twin=spawn(`${backend}/.venv/bin/python`,["scripts/connector-twin.py"],{env:{...process.env,LOOPLABS_CONNECTOR_STATE_DIR:dir},stdio:"ignore"});
  const base=new FetchSandboxConnectors("http://127.0.0.1:8018",token);
  await until(async()=>{try{await base.contact();return true;}catch{if(twin!.exitCode!==null)throw Error("Private twin exited; port 8018 must be free");return false;}},"private twin");
  const build=JSON.parse(await readFile(".worker/temporal-manifest.json","utf8"));
  const companies:{scope:(typeof records)[number];scopeId:string;keys:Record<"owner"|"reviewer"|"worker"|"agent",string>;owner:Awaited<ReturnType<typeof authenticate>>;reviewer:Awaited<ReturnType<typeof authenticate>>;worker:Awaited<ReturnType<typeof authenticate>>;agent:Awaited<ReturnType<typeof authenticate>>;provider:FetchSandboxConnectors;control:ConnectorControl;flow:WorkflowControl;plan:Awaited<ReturnType<EnquiryControl["prepareChat"]>>["saved"];run:Awaited<ReturnType<WorkflowControl["read"]>>;input:{runId:string;planHash:string;planVersion:string;connectorVersion:string}}[]=[];
  for(const scope of records){
   const org=scope.workspaceId,keys={owner:randomBytes(32).toString("base64url"),reviewer:randomBytes(32).toString("base64url"),worker:randomBytes(32).toString("base64url"),agent:randomBytes(32).toString("base64url")};
   await db.query("INSERT INTO ll_orgs(id) VALUES($1)",[org]);
   await db.query("INSERT INTO ll_workspace_recovery(org_id,epoch) VALUES($1,$2)",[org,recoveryEpoch]);
   const actors=[];
   for(const [subject,role,key] of [[`${org}-owner@example.test`,"operator",keys.owner],[`${org}-reviewer@example.test`,"operator",keys.reviewer],["enquiry-temporal","worker",keys.worker],["crm","agent",keys.agent]]){
    if(role==="operator")await db.query("INSERT INTO ll_members(org_id,email,name,password_hash) VALUES($1,$2,$2,$3)",[org,subject,hashedPassword]);
    await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,$2,$3,$4)",[tokenHash(key),org,subject,role]);
   }
   for(const key of [keys.owner,keys.reviewer,keys.worker,keys.agent])actors.push(await authenticate(db,key));
   const [owner,reviewer,worker,agent]=actors;
   for(const [id,tool,role,connector] of [["crm","twin.crm","crm_agent","crm_twin"],["email","twin.email","email_agent","email_twin"]]){
    await db.query("INSERT INTO ll_agents(org_id,id,tools,action_limit) VALUES($1,$2,ARRAY[$3],$4)",[org,id,tool,load?13:1]);
    await db.query("INSERT INTO ll_agent_profiles(org_id,agent_id,name,owner,role,connector) VALUES($1,$2,$2,$3,$4,$5)",[org,id,owner.subject,role,connector]);
    if(id!=="crm")await db.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,$2,$3,'agent')",[tokenHash(randomBytes(32).toString("base64url")),org,id]);
   }
   await db.query("INSERT INTO ll_connector_policies(org_id,connector) VALUES($1,'crm'),($1,'email')",[org]);
   const provider=new FetchSandboxConnectors("http://127.0.0.1:8018",token,1500,scope),control=new ConnectorControl(db,provider),flow=new WorkflowControl(db,control),scopes=new ScopeControl(db,provider),scopeId=randomUUID();
   await scopes.enroll(owner,scopeId);for(const id of ["crm","email"])await scopes.grant(owner,scopeId,id);
   const enquiries=new EnquiryControl(db,flow,async()=>{const c=await provider.contact();return {id:c.id,email:c.properties.email,version:c.updatedAt,lifecycle:c.properties.lifecyclestage};});
   const plan=(await enquiries.prepareChat(owner,randomUUID())).saved;
   await submitScoped(enquiries,owner,plan.id,plan.plan_hash,"crm","email",build.buildId);
   const run=await flow.read(owner,plan.id),input={runId:plan.id,planHash:plan.plan_hash,planVersion:"acknowledgement-1",connectorVersion:"private-record-twin-2"};
   companies.push({scope,scopeId,keys,owner,reviewer,worker,agent,provider,control,flow,plan,run,input});
  }
  // Apply the literal GRANT statements from the actual provisioners, rather than
  // silently replacing their permissions with an owner or ALL TABLES grant.
  await admin.query(`CREATE ROLE ${runtimeRole} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${runtimePassword}'`);roleCreated=true;
  let grantStatements=0;
  for(const file of provisioningFiles){
   const source=await readFile(file,"utf8");let found=0;
   for(const match of source.matchAll(/c\.query\(\s*("(?:[^"\\]|\\.)*")/g)){
    const sql=JSON.parse(match[1]) as string;if(!sql.startsWith("GRANT ")||!sql.endsWith(" TO ll_runtime"))continue;
    await db.query(sql.replace("ON SCHEMA public",`ON SCHEMA ${schema}`).replace(" TO ll_runtime",` TO ${runtimeRole}`));found++;grantStatements++;
   }
   assert(found>0,`No literal runtime grants found in ${file}; update proof explicitly`);
  }
  const databaseUrl=new URL(url);databaseUrl.username=runtimeRole;databaseUrl.password=runtimePassword;databaseUrl.searchParams.set("options",`-c search_path=${schema}`);
  runtime=new Pool({connectionString:databaseUrl.toString()});
  const identity=(await runtime.query("SELECT current_user AS name,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
  assert.equal(identity.name,runtimeRole);for(const flag of ["rolsuper","rolcreatedb","rolcreaterole","rolreplication","rolbypassrls"])assert.equal(identity[flag],false);
  assert.equal((await runtime.query("SELECT count(*)::int n FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=$1 AND t.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)",[schema])).rows[0].n,0);
  assert.equal((await runtime.query("SELECT has_schema_privilege(current_user,$1,'CREATE') AS permitted",[schema])).rows[0].permitted,false);
  const ownerRole=(await admin.query("SELECT current_user AS name")).rows[0].name;
  assert.equal((await runtime.query("SELECT pg_has_role(current_user,$1,'MEMBER') AS permitted",[ownerRole])).rows[0].permitted,false);
  const runtimeEnv={...process.env,LOOPLABS_RECOVERY_EPOCH:recoveryEpoch,LOOPLABS_MIGRATION_DATABASE_URL:"",LOOPLABS_TEST_DATABASE_URL:""};
  pass(`Actual LOGIN runtime uses ${grantStatements} provisioner grants with no owner membership, schema creation, table ownership or privileged role flags`);
  app=spawn("pnpm",["exec","next","start","-p","3117"],{detached:true,env:{...runtimeEnv,LOOPLABS_DATABASE_URL:databaseUrl.toString(),LOOPLABS_DURABLE_ORIGIN:"",LOOPLABS_CONNECTOR_TWIN_URL:"http://127.0.0.1:8018",LOOPLABS_CONNECTOR_TWIN_TOKEN:token,LOOPLABS_FETCHSANDBOX_BINDING:"",LOOPLABS_RECORD_CATALOG:JSON.stringify({records:catalogRecords}),LOOPLABS_TEMPORAL_WORKSPACE:"staging",LOOPLABS_TEMPORAL_RECORD_BUILD_ID:build.buildId},stdio:"ignore"});
  await until(async()=>{try{return (await fetch(origin+"/sign-in")).ok;}catch{return false;}},"real application");
  const effects=async()=>JSON.parse(await readFile(`${dir}/connector-twin-state.json`,"utf8")).effects;
  const snapshot=async()=>JSON.stringify((await db.query("SELECT org_id,id,state,payload_hash,approved_by FROM ll_connector_actions ORDER BY org_id,id")).rows);
  const before=await snapshot();assert.equal(Object.keys(await effects()).length,0);
  let deniedDatabase=0;
  for(const [sql,params,code] of [
   ["UPDATE ll_connector_actions SET payload_hash='tampered' WHERE id=$1",[companies[0].run.steps[0].action_id],"23514"],
   ["UPDATE ll_connector_actions SET payload='{}'::jsonb WHERE id=$1",[companies[0].run.steps[0].action_id],"23514"],
   ["UPDATE ll_connector_actions SET org_id='company-b' WHERE id=$1",[companies[0].run.steps[0].action_id],"23514"],
   ["UPDATE ll_workflow_steps SET payload='{}'::jsonb",[],"42501"],
   ["UPDATE ll_enquiry_plans SET plan_hash='tampered'",[],"42501"],
   ["UPDATE ll_members SET active=false",[],"42501"],
   ["UPDATE ll_tokens SET active=false",[],"42501"],
   ["DELETE FROM ll_connector_actions",[],"42501"],
   ["UPDATE ll_connector_events SET kind='tampered'",[],"42501"],
   ["TRUNCATE ll_connector_events",[],"42501"],
   ["ALTER TABLE ll_connector_actions DISABLE TRIGGER ALL",[],"42501"],
   ["SET session_replication_role='replica'",[],"42501"],
   ["CREATE TABLE runtime_unauthorized(id integer)",[],"42501"],
  ] as [string,unknown[],string][]){await assert.rejects(()=>runtime!.query(sql,params),(error:{code?:string})=>error.code===code);deniedDatabase++;}
  assert.equal(await snapshot(),before);assert.equal(Object.keys(await effects()).length,0);
  // This shared application role can read both companies. That is an explicit
  // remaining SQL-compromise boundary, not database tenant row-level isolation.
  assert.equal((await runtime.query("SELECT count(DISTINCT org_id)::int n FROM ll_connector_actions")).rows[0].n,2);
  pass("Thirteen actual restricted-database attacks refuse proposal rewrites, identity revocation, event mutation, deletion, truncation, trigger disabling and DDL without effects; shared role still reads both companies (no RLS claim)");
  browser=await chromium.launch({headless:true});let deniedBrowser=0;
  for(let i=0;i<companies.length;i++){
   const own=companies[i],other=companies[1-i];const context:BrowserContext=await browser.newContext();const page:Page=await context.newPage();
   await page.goto(origin+"/sign-in?next=/control-plane/records");await page.getByLabel("Email",{exact:true}).fill(own.owner.subject);await page.getByLabel("Password").fill(password);
   const signedIn:Promise<Response>=page.waitForResponse(r=>r.url().endsWith("/api/workspace/session")&&r.request().method()==="POST");await page.getByRole("button",{name:"Sign in",exact:true}).click();assert.equal((await signedIn).status(),200);
   await expect(page.getByText(own.scope.recipient,{exact:true}).first()).toBeVisible();assert(!(await page.locator("body").innerText()).includes(other.scope.recipient));
   const cookie=(await context.cookies()).find(c=>c.name==="looplabs_workspace_session");assert(cookie?.httpOnly);assert.equal(cookie.sameSite,"Strict");assert(!(await page.evaluate(()=>document.cookie)).includes(cookie.value));
   for(const path of ["/api/durable/workflows?run="+other.plan.id,"/api/durable/connectors?action="+other.run.steps[0].action_id,"/api/workspace/enquiries?scope="+other.scopeId]){const r=await context.request.get(origin+path);assert.equal(r.status(),404);assert(!(await r.text()).includes(other.scope.recipient));deniedBrowser++;}
   const hostile=await context.request.post(origin+"/api/durable/connectors",{headers:{Origin:"https://untrusted.example"},data:{operation:"approve",actionId:own.run.steps[0].action_id,payloadHash:own.run.steps[0].payload_hash}});assert.equal(hostile.status(),403);deniedBrowser++;
   await db.query("UPDATE ll_sessions SET expires_at=now()-interval '1 second' WHERE email=$1",[own.owner.subject]);assert.equal((await context.request.get(origin+"/api/workspace/records")).status(),401);
   await page.reload();assert(!(await page.locator("body").innerText()).includes(other.scope.recipient));await context.close();
  }
  assert.equal(deniedBrowser,8);assert.equal(await snapshot(),before);assert.equal(Object.keys(await effects()).length,0);
  pass("Two real browser sessions keep company records separate; eight cross-company/origin attacks are denied, HttpOnly/Strict cookies hide credentials from scripts and expired sessions lose API access without effects");
  for(let i=0;i<companies.length;i++){
   const own=companies[i],other=companies[1-i];
   const catalog=await request(own.keys.owner,"/api/workspace/records");assert.equal(catalog.status,200);assert.deepEqual(catalog.data.candidates.map((r:{contactId:string})=>r.contactId).sort(),catalogRecords.filter(r=>r.workspaceId===own.scope.workspaceId).map(r=>r.contactId).sort());assert.deepEqual(catalog.data.records.map((r:{id:string})=>r.id),[own.scopeId]);
   const plans=await request(own.keys.owner,"/api/workspace/enquiries?scope="+own.scopeId);assert.equal(plans.status,200);assert.deepEqual(plans.data.plans.map((p:{id:string})=>p.id),[own.plan.id]);
   for(const key of [own.keys.owner,own.keys.reviewer,own.keys.worker,own.keys.agent]){
    const attempts:[string,object|undefined][]=[
     ["/api/durable/workflows?run="+other.plan.id,undefined],
     ["/api/durable/connectors?action="+other.run.steps[0].action_id,undefined],
     ["/api/durable/connectors",{operation:"approve",actionId:other.run.steps[0].action_id,payloadHash:other.run.steps[0].payload_hash}],
     ["/api/durable/connectors",{operation:"execute",actionId:other.run.steps[0].action_id}],
     ["/api/durable/connectors",{operation:"reconcile",actionId:other.run.steps[0].action_id}],
     ["/api/durable/workflows",{operation:"pause",runId:other.plan.id}],
     ["/api/workspace/enquiries?scope="+other.scopeId,{operation:"submit",id:other.plan.id,planHash:other.plan.plan_hash,crmAgent:"crm",emailAgent:"email"}],
     ["/api/workspace/records",{operation:"grant",scopeId:other.scopeId,agentId:"crm"}],
    ];
    for(const [path,p] of attempts){const r=await request(key,path,p);assert([403,404].includes(r.status),`${path}: ${r.status}`);const text=JSON.stringify(r.data);assert(!text.includes(other.scope.recipient));assert(!text.includes(other.plan.plan_hash));denied++;}
   }
   await assert.rejects(()=>recordActivities(runtime!,own.worker,()=>own.provider,build.buildId)(other.input));
  }
  assert.equal(await snapshot(),before);assert.equal(Object.keys(await effects()).length,0);
  pass("Real authenticated HTTP: each catalog/plan list exposes only its company; 64 cross-company member/agent/worker reads and mutations are denied with no state or effects changed");
  pass("Identical CRM/email agent IDs in two companies do not grant cross-company approval, record access or pinned worker routing");
  temporal=await TestWorkflowEnvironment.createLocal({server:{dbFilename:`${dir}/temporal.sqlite`}});
  const queues=companies.map(c=>`${c.scope.workspaceId}-${randomUUID()}`);assert.equal(new Set(queues).size,2);
  const service=(index:number,role:"worker"|"scheduler")=>{
   const child=spawn(process.execPath,[".worker/temporal-service.cjs",role],{env:{...runtimeEnv,LOOPLABS_DATABASE_URL:databaseUrl.toString(),LOOPLABS_TEMPORAL_WORKER_TOKEN:companies[index].keys.worker,LOOPLABS_TEMPORAL_ADDRESS:temporal!.address,LOOPLABS_TEMPORAL_NAMESPACE:"default",LOOPLABS_TEMPORAL_TASK_QUEUE:queues[index],LOOPLABS_TEMPORAL_BUILD_ID:build.buildId,LOOPLABS_TEMPORAL_ALLOW_INSECURE_LOOPBACK:"true",LOOPLABS_TEMPORAL_API_KEY:"",LOOPLABS_TEMPORAL_CERT_PATH:"",LOOPLABS_TEMPORAL_KEY_PATH:"",LOOPLABS_TEMPORAL_CA_PATH:"",LOOPLABS_TEMPORAL_POLL_MS:"250",LOOPLABS_TEMPORAL_HEALTH_PORT:String(19340+index*2+(role==="scheduler"?1:0)),LOOPLABS_CONNECTOR_TWIN_URL:"http://127.0.0.1:8018",LOOPLABS_CONNECTOR_TWIN_TOKEN:token,LOOPLABS_FETCHSANDBOX_BINDING:""},stdio:"ignore"});children.push(child);return child;
  };
  const ready=async(port:number)=>{try{return (await fetch(`http://127.0.0.1:${port}/health/ready`,{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}};
  const crashed=service(0,"worker");service(0,"scheduler");service(1,"worker");service(1,"scheduler");
  await until(async()=> (await Promise.all([19340,19341,19342,19343].map(ready))).every(Boolean),"two-company packaged readiness",90000);
  await until(async()=> (await db.query("SELECT count(*)::int n FROM ll_temporal_dispatch WHERE state='started'")).rows[0].n===2,"two scoped Temporal histories",90000);
  await wait(1200);assert.equal(Object.keys(await effects()).length,0);
  pass("Two company-scoped packaged workers and schedulers use separate task queues and start both pinned histories; held approvals remain effect-free");
  crashed.kill("SIGKILL");await until(async()=>crashed.signalCode==="SIGKILL","confirmed company-a worker crash");
  for(const own of companies)for(const step of own.run.steps){const r=await request(own.keys.reviewer,"/api/durable/connectors",{operation:"approve",actionId:step.action_id,payloadHash:step.payload_hash});assert.equal(r.status,200);}
  await until(async()=> (await companies[1].flow.read(companies[1].owner,companies[1].plan.id)).state==="completed","company-b completes with company-a worker stopped",90000);
  const whileStopped=await effects();assert.equal(Object.keys(whileStopped).length,2);assert(companies[0].run.steps.every((s:{action_id:string})=>!whileStopped[s.action_id]));assert.equal((await companies[0].flow.read(companies[0].owner,companies[0].plan.id)).state,"active");assert.equal(crashed.signalCode,"SIGKILL");
  pass("Company-b independently approved workflow completes two correct effects while company-a worker is confirmed stopped; no company-a effect or replacement authority");
  let activeA=service(0,"worker");await until(()=>ready(19340),"company-a replacement worker",90000);
  await until(async()=> (await companies[0].flow.read(companies[0].owner,companies[0].plan.id)).state==="completed","company-a recovered completion",90000);
  const completed=await effects();assert.equal(Object.keys(completed).length,4);
  for(const own of companies)for(const step of own.run.steps){assert.equal(completed[step.action_id].recordId,own.scope.contactId);if(step.connector==="email")assert.deepEqual(completed[step.action_id].body.to,[own.scope.recipient]);}
  assert((await db.query("SELECT 1 FROM ll_connector_events WHERE action_id=$1 AND kind='uncertain'",[companies[0].run.steps[0].action_id])).rows[0]);
  pass("Replacement packaged worker preserves company-a original actions and recovers its actual lost CRM response; exactly four intended HTTP effects across companies and no cross-company destination");
  const workflowIds:string[]=[];
  for(const own of companies){const id=(await db.query("SELECT workflow_id FROM ll_temporal_dispatch WHERE org_id=$1 AND plan_id=$2",[own.scope.workspaceId,own.plan.id])).rows[0].workflow_id;assert(id.startsWith(`looplabs:${own.scope.workspaceId}:ack:`));workflowIds.push(id);const handle:WorkflowHandle=temporal.client.workflow.getHandle(id);assert.equal(await handle.result(),"completed");const history=await handle.fetchHistory();await Worker.runReplayHistory({workflowsPath:resolve("runtime/temporal/pinned-workflow.ts")},history);for(const secret of [token,...companies.flatMap(c=>Object.values(c.keys))])assert(!JSON.stringify(history).includes(secret));}
  assert.deepEqual(await effects(),completed);
  pass("Both actual company histories replay without new effects, credential leakage or replacement action identities");
  for(const own of companies)assert.equal(await recordActivities(runtime!,own.worker,()=>own.provider,build.buildId)(own.input),"completed");
  assert.deepEqual(await effects(),completed);
  pass("Repeated completed activity calls retain four effects and each company\'s original action identities");
  if(load){
   const prepared:{company:(typeof companies)[number];record:(typeof records)[number];plan:Awaited<ReturnType<EnquiryControl["prepareChat"]>>["saved"];run:Awaited<ReturnType<WorkflowControl["read"]>>;flow:WorkflowControl}[]=[];
   for(const record of loadRecords){
    const company=companies.find(c=>c.scope.workspaceId===record.workspaceId)!;
    const provider:FetchSandboxConnectors=new FetchSandboxConnectors("http://127.0.0.1:8018",token,1500,record);const control:ConnectorControl=new ConnectorControl(runtime!,provider),flow:WorkflowControl=new WorkflowControl(runtime!,control),scopes:ScopeControl=new ScopeControl(runtime!,provider),scopeId=randomUUID();
    await scopes.enroll(company.owner,scopeId);for(const id of ["crm","email"])await scopes.grant(company.owner,scopeId,id);
    const enquiries:EnquiryControl=new EnquiryControl(runtime!,flow,async()=>{const c=await provider.contact();return {id:c.id,email:c.properties.email,version:c.updatedAt,lifecycle:c.properties.lifecyclestage};});
    const plan:Awaited<ReturnType<EnquiryControl["prepareChat"]>>["saved"]=(await enquiries.prepareChat(company.owner,randomUUID())).saved;
    await submitScoped(enquiries,company.owner,plan.id,plan.plan_hash,"crm","email",build.buildId);
    const run:Awaited<ReturnType<WorkflowControl["read"]>>=await flow.read(company.owner,plan.id);
    await submitScoped(enquiries,company.owner,plan.id,plan.plan_hash,"crm","email",build.buildId);
    assert.deepEqual((await flow.read(company.owner,plan.id)).steps.map((s:{action_id:string})=>s.action_id),run.steps.map((s:{action_id:string})=>s.action_id));
    prepared.push({company,record,plan,run,flow});
   }
   assert.equal(prepared.length,24);assert.equal(Object.keys(await effects()).length,4);
   await until(async()=> (await db.query("SELECT count(*)::int n FROM ll_temporal_dispatch WHERE state='started'")).rows[0].n===26,"all two-company workload histories started",90000);
   const reservations=(await db.query("SELECT org_id,id,reserved,action_limit FROM ll_agents ORDER BY org_id,id")).rows;
   assert.equal(reservations.length,4);assert(reservations.every(a=>a.reserved===13&&a.action_limit===13));
   const samples:{company:string;ordinal:number;approvalToObservedCompletionMs:number}[]=[],waves:{wave:number;observedAtMs:number;effects:number;held:number}[]=[];
   const started=performance.now();let faultIsolationObserved=false;
   for(let wave=0;wave<6;wave++){
    const batch=companies.flatMap(company=>prepared.filter(r=>r.company===company).slice(wave*2,wave*2+2));
    const began=new Map<string,number>(),seen=new Set<string>();
    if(wave===2){activeA.kill("SIGKILL");await until(async()=>activeA.signalCode==="SIGKILL","workload company-a SIGKILL");}
    for(const run of batch){began.set(run.plan.id,performance.now());for(const step of run.run.steps){const input={operation:"approve",actionId:step.action_id,payloadHash:step.payload_hash};assert.equal((await request(run.company.keys.reviewer,"/api/durable/connectors",input)).status,200);assert.equal((await request(run.company.keys.reviewer,"/api/durable/connectors",input)).status,200);}}
    if(wave===2){
     const b=batch.filter(r=>r.company===companies[1]);
     await until(async()=> (await Promise.all(b.map(r=>r.flow.read(r.company.owner,r.plan.id)))).every(r=>r.state==="completed"),"company-b workload with company-a stopped",90000);
     const observed=await effects();assert.equal(Object.keys(observed).length,24);
     for(const a of batch.filter(r=>r.company===companies[0])){assert.equal((await a.flow.read(a.company.owner,a.plan.id)).state,"active");assert(a.run.steps.every((s:{action_id:string})=>!observed[s.action_id]));}
     assert.equal(activeA.signalCode,"SIGKILL");await wait(15000);assert.deepEqual(await effects(),observed);
     activeA=service(0,"worker");await until(()=>ready(19340),"workload replacement worker",90000);faultIsolationObserved=true;
    }
    await until(async()=>{for(const run of batch){if(!seen.has(run.plan.id)&&(await run.flow.read(run.company.owner,run.plan.id)).state==="completed"){seen.add(run.plan.id);samples.push({company:run.record.workspaceId,ordinal:loadRecords.indexOf(run.record)+1,approvalToObservedCompletionMs:Math.round(performance.now()-began.get(run.plan.id)!)});}}return seen.size===4;},`two-company workload wave ${wave+1}`,90000);
    const observed=await effects(),held=(await db.query("SELECT count(*)::int n FROM ll_connector_actions WHERE state='held'")).rows[0].n;
    assert.equal(Object.keys(observed).length,4+(wave+1)*8);assert.equal(held,(5-wave)*8);
    const completeIds=new Set(prepared.filter(r=>samples.some(s=>s.ordinal===loadRecords.indexOf(r.record)+1)).flatMap(r=>r.run.steps.map((s:{action_id:string})=>s.action_id)));
    for(const run of prepared)for(const step of run.run.steps){if(completeIds.has(step.action_id)){assert.equal(observed[step.action_id].recordId,run.record.contactId);if(step.connector==="email")assert.deepEqual(observed[step.action_id].body.to,[run.record.recipient]);}else assert(!observed[step.action_id]);}
    waves.push({wave:wave+1,observedAtMs:Math.round(performance.now()-started),effects:Object.keys(observed).length,held});
    if(wave<5)await wait(30000);
   }
   const windowMs=Math.round(performance.now()-started);assert(windowMs>=150000);assert.equal(samples.length,24);assert(faultIsolationObserved);
   const final=await effects();assert.equal(Object.keys(final).length,52);
   let replayed=0;
   for(const run of prepared){
    const id=(await db.query("SELECT workflow_id FROM ll_temporal_dispatch WHERE org_id=$1 AND plan_id=$2",[run.record.workspaceId,run.plan.id])).rows[0].workflow_id;
    const handle:WorkflowHandle=temporal.client.workflow.getHandle(id);assert.equal(await handle.result(),"completed");await Worker.runReplayHistory({workflowsPath:resolve("runtime/temporal/pinned-workflow.ts")},await handle.fetchHistory());replayed++;
   }
   assert.deepEqual(await effects(),final);assert.deepEqual((await db.query("SELECT org_id,id,reserved,action_limit FROM ll_agents ORDER BY org_id,id")).rows,reservations);
   for(const contactId of ["4105","4209"]){const run=prepared.find(r=>r.record.contactId===contactId)!;assert((await db.query("SELECT 1 FROM ll_connector_events WHERE action_id=$1 AND kind='uncertain'",[run.run.steps[0].action_id])).rows[0]);}
   loadMeasurement={additionalRuns:24,independentRecords:24,sharedAgents:4,waves,windowMs,samples,effects:52,heldBeforeApproval:48,replayedHistories:replayed,workerFaultIsolation:true,lostResponseRecords:2,reservationsPreserved:true,duplicateSubmissions:24,duplicateApprovals:48};
   pass("Six paced two-company waves complete 24 independently scoped workflows with shared agents, duplicate-safe submissions/approvals, isolated worker crash, lost-response readback and 52 exact effects; histories replay without changing reservations");
  }
  const files=[...provisioningFiles,"scripts/tenant-isolation-proof.ts","scripts/temporal-service.ts","runtime/temporal/pinned-workflow.ts","runtime/temporal/version-contract.ts","scripts/build-temporal-worker.mjs","lib/workspace/auth.ts","lib/workspace/identity.ts","app/api/workspace/session/route.ts","lib/durable/http.ts","lib/durable/recovery.ts","lib/durable/recovery-schema.sql","lib/durable/service.ts","lib/durable/database.ts","lib/connectors/routing.ts","lib/connectors/catalog.ts","lib/connectors/scopes.ts","lib/connectors/service.ts","lib/connectors/twin.ts","lib/enquiries/service.ts","lib/enquiries/submission.ts","lib/workflows/service.ts","runtime/temporal/record-routing.ts","runtime/temporal/activities.ts","runtime/temporal/outbox.ts","app/api/durable/connectors/route.ts","app/api/durable/workflows/route.ts","app/api/workspace/enquiries/route.ts","app/api/workspace/records/route.ts","scripts/connector-twin.py"];
  const sourceFingerprints=Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash("sha256").update(await readFile(f)).digest("hex")])));
  await writeFile(load?"docs/evidence/tenant-paced-operation-proof.json":"docs/evidence/tenant-isolation-proof.json",JSON.stringify({loadMeasurement,at:new Date().toISOString(),checks,sourceFingerprints,measurements:{companies:2,deniedHttpRequests:denied,deniedBrowserRequests:deniedBrowser,deniedDatabaseRequests:deniedDatabase,runtimeGrantStatements:grantStatements,restrictedDatabaseLogin:true,databaseTenantRls:false,effects:load?52:4,taskQueues:2,workerProcesses:load?4:3,schedulerProcesses:2,crashedWorkers:load?2:1,replayedHistories:load?26:2},workflowIds,buildId:build.buildId,scope:"Local real browser, Next HTTP API, packaged Temporal roles, PostgreSQL and provider twins; separate per-company queues, not saturation, remote TLS or an independent security audit"},null,2)+"\n");
 }finally{
  for(const child of children)if(child.exitCode===null&&!child.signalCode){child.kill("SIGTERM");await until(async()=>child.exitCode!==null||Boolean(child.signalCode),"packaged tenant role shutdown",25000);}
  await temporal?.teardown();await browser?.close();
  if(app?.pid){try{process.kill(-app.pid,"SIGKILL");}catch{}await wait(400);}
  if(twin&&twin.exitCode===null&&!twin.signalCode){twin.kill("SIGTERM");try{await until(async()=>twin!.exitCode!==null||Boolean(twin!.signalCode),"private twin graceful shutdown");}catch{twin.kill("SIGKILL");await until(async()=>twin!.exitCode!==null||Boolean(twin!.signalCode),"private twin forced shutdown");}}
  await runtime?.end();await db.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);if(roleCreated){await admin.query(`DROP OWNED BY ${runtimeRole}`);await admin.query(`DROP ROLE ${runtimeRole}`);}await admin.end();await rm(dir,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
