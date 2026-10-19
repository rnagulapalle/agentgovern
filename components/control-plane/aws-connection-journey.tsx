"use client";
import Link from "next/link";
import { RuntimeMetadata } from "./runtime-metadata";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Cloud, Eye, LockKeyhole, Radio, ShieldCheck, UserRound } from "lucide-react";
import { workspaceJson } from "@/lib/workspace/response";
import { awsAgentName, awsConnectionId, awsJourneySteps, awsPlace, awsPlaceKey, type AwsPlace, type AwsConnectionCoverage } from "@/lib/workspace/aws-journey";
import type { CloudInventoryStore } from "@/lib/workspace/cloud-inventory";
import type { CloudDiscoveryOperations } from "@/lib/workspace/cloud-operations";
import type { CloudActivityOperations } from "@/lib/workspace/cloud-activity";
import { CloudOwnerReviewCard } from "./cloud-owner-review";
import { AwsWorkflowHistory } from "./aws-workflow-history";
type Connections = Awaited<ReturnType<CloudDiscoveryOperations["connections"]>>;
type Inventory = Awaited<ReturnType<CloudInventoryStore["latest"]>>;
type Activity = Awaited<ReturnType<CloudActivityOperations["read"]>>;
const date = (at: string | number) => new Date(at).toLocaleString();
async function request(path: string, body?: object) {
  const response = await fetch(path, { cache: "no-store", ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const result = await workspaceJson(response); if (!response.ok) throw Error(result.error); return result;
}
export function AwsIntegrationGuidance() {
  return <section className="cp-panel cp-durable-card" aria-label="AWS integration requirements"><h2>Understand your integration coverage</h2>
    <p>Your existing workflow and business rules stay in AWS. Missing tool events or an execution checkpoint do not mean the agent connection failed.</p>
    <dl className="aws-coverage-list"><dt>Current activity reader</dt><dd>Supported invocation events only · on-demand 15-minute window</dd><dt>Workflow and tool history</dt><dd>Workflow history requires observation onboarding and a supported telemetry source</dd><dt>Execution enforcement</dt><dd>Not enabled · requires a verified protected tool path</dd></dl>
    <details><summary>Recommendations for your workflow builder</summary><ol>
      <li>Expose the available AWS telemetry source and grant scoped read access. OpenTelemetry traces and structured events need a supported mapping; AWS storage alone does not make every format readable.</li>
      <li>Correlate events with stable run, action and event IDs, timestamps and deployment version. Report policy decisions, approvals, execution and output outcomes separately. Missing events remain unknown.</li>
      <li>Remove credentials and sensitive customer content before exporting. Configure retention and test delivery after a runtime restart.</li>
      <li>To enable enforcement, add a checkpoint before protected tool calls and verify continuation, outcome checks and bypass prevention. Keep one business approval authority and the existing safeguards.</li>
    </ol></details><a className="cp-button secondary" href="/guides/aws-agent-integration.txt" download>Download workflow builder guidance</a>
    <p>Reported activity is not independent proof of a successful effect, a verified approver or permission to execute.</p>
  </section>;
}
export function AwsControlReadiness() {
  return <section className="cp-panel cp-durable-card aws-control-readiness"><div className="aws-section-heading"><ShieldCheck size={22} aria-hidden="true" /><div><h2>Enable action controls</h2><p>Discovery and event visibility are the starting point. Each tool needs a verified execution path. Missing control integration does not invalidate the discovered agent.</p></div></div>
    <ol className="aws-readiness-list">
      <li><UserRound size={18} aria-hidden="true" /><div><strong>Assign an accountable owner</strong><p>Review the named person responsible for this exact agent version below.</p></div><span className="aws-status">Owner review</span></li>
      <li><Radio size={18} aria-hidden="true" /><div><strong>Connect activity evidence</strong><p>Confirm the agent’s CloudWatch source. An invocation event does not prove a tool ran or succeeded.</p></div><span className="aws-status">Separate access</span></li>
      <li><LockKeyhole size={18} aria-hidden="true" /><div><strong>Install an execution checkpoint</strong><p>The agent must ask LoopLabs before a protected tool action. This installation is not available in this flow yet.</p></div><span className="aws-status is-blocked">Not verified</span></li>
      <li><ShieldCheck size={18} aria-hidden="true" /><div><strong>Prove the control boundary</strong><p>Test approval, rejection, expiry, safe continuation and attempts to bypass the checkpoint before enabling control.</p></div><span className="aws-status is-blocked">Not verified</span></li>
    </ol><div className="aws-callout"><LockKeyhole size={20} aria-hidden="true" /><div><strong>Action controls are not enabled</strong><p>LoopLabs has not verified enforcement for this AWS agent. Owner review does not grant execution permission.</p></div></div><button className="cp-button" disabled>Enable controls · setup required</button><p><a href="/guides/aws-agent-integration.txt" download>Download workflow builder guidance</a></p>
  </section>;
}
export function AwsConnectionJourney({ onAgentSelect }: { onAgentSelect?: (place: AwsPlace & {scanId:string}) => void } = {}) {
  const connectionSetupOnly=Boolean(onAgentSelect);
  const [step, setStep] = useState(0), [connections, setConnections] = useState<Connections | null>(null);
  const [selected, setSelected] = useState(""), [inventory, setInventory] = useState<Inventory | null>(null), [runtimeArn, setRuntimeArn] = useState("");
  const [activity, setActivity] = useState<Activity | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [authorization,setAuthorization]=useState<{url:string;expiresAt:string;roleArn:string}|null>(null),[customLogGroup,setCustomLogGroup]=useState("");
  const [runtimeVersion,setRuntimeVersion]=useState(""),[savedEnrollment,setSavedEnrollment]=useState(false);
  const [coverage,setCoverage]=useState<AwsConnectionCoverage>({history:"not-checked",approvals:"not-checked"});
  const restoreLoad=useRef(load);restoreLoad.current=load;
  const generation = useRef(0), pending = useRef<{ account: string; region: string; id: string } | null>(null);
  const chosen = connections?.connections.find(c => c.scope.connectionId === selected);
  const observed = inventory?.status === "observed" ? inventory : null;
  const candidate = observed?.records.find(r => r.record.resourceArn === runtimeArn && (!runtimeVersion || r.record.version === runtimeVersion));
  const current = Boolean(candidate?.observedInCurrentScan && !candidate.stale && observed && !observed.stale);
  useEffect(() => {
    const requests = generation;
    const sequence = ++requests.current;
    request("/api/workspace/discovery").then(value => { if (generation.current !== sequence)return;setConnections(value);let place:AwsPlace|null=null;try{place=awsPlace(localStorage.getItem(awsPlaceKey));}catch{}if(place&&!connectionSetupOnly){const c=value.connections.find((c:Connections["connections"][number])=>c.scope.connectionId===place!.connectionId);if(c)void restoreLoad.current(place.connectionId,false,place,Boolean(c.authorizationAvailable));} }).catch(e => { if (generation.current === sequence) setError(e.message); });
    return () => { requests.current++; };
  }, [connectionSetupOnly]);
  function navigate(next: number) { generation.current++; setBusy(false); setError(""); setNotice(""); setStep(next); }
  async function load(id: string, scan = false, place?:AwsPlace, guided = Boolean(connections?.connections.find(c=>c.scope.connectionId===id)?.authorizationAvailable)) {
    const sequence = ++generation.current; setBusy(true); setError(""); setNotice(""); setSelected(id); setAuthorization(null); setInventory(null); setActivity(null); setRuntimeArn("");setRuntimeVersion("");setSavedEnrollment(false);setCoverage({history:"not-checked",approvals:"not-checked"});
    try {
      const value = await request(scan ? "/api/workspace/discovery" : `/api/workspace/discovery?connectionId=${encodeURIComponent(id)}`, scan ? { operation: "scan", connectionId: id } : undefined);
      if (sequence !== generation.current) return;
      setInventory(value); setStep(1);
      const remembered=place&&value.records.find((r:Inventory["records"][number])=>r.record.resourceArn===place.resourceArn&&r.record.version===place.version);
      const first=remembered||value.records.find((r:Inventory["records"][number])=>r.observedInCurrentScan&&!r.stale)||value.records.find((r:Inventory["records"][number])=>r.observedInCurrentScan);
      if(first){setRuntimeArn(first.record.resourceArn);setRuntimeVersion(first.record.version);
       if(guided&&!onAgentSelect){const check=await request("/api/workspace/discovery/onboarding",{operation:"enrollment",connectionId:id,scanId:value.scanId,resourceArn:first.record.resourceArn,version:first.record.version});if(sequence!==generation.current)return;if(check.enrollment){remember(id,first.record.resourceArn,first.record.version);setSavedEnrollment(true);setStep(3);setNotice("Saved agent reopened. Checking its current history and approval connection.");}}
      }
    } catch (e) { if (sequence === generation.current) setError(e instanceof Error ? e.message : "AWS inventory could not be loaded."); }
    finally { if (sequence === generation.current) setBusy(false); }
  }
  async function reviewAgent(resourceArn:string,version:string){
    if(onAgentSelect&&observed){onAgentSelect({connectionId:observed.scope.connectionId,scanId:observed.scanId,resourceArn,version});return;}
    selectRuntime(resourceArn,version);
    if(!chosen?.authorizationAvailable||!observed){setStep(2);return;}
    const sequence=++generation.current;setBusy(true);setError("");
    try{const result=await request("/api/workspace/discovery/onboarding",{operation:"enrollment",connectionId:observed.scope.connectionId,scanId:observed.scanId,resourceArn,version});if(sequence===generation.current){if(result.enrollment){remember(selected,resourceArn,version);setSavedEnrollment(true);setStep(3);}else if(!observed||observed.stale||!observed.records.some(r=>r.record.resourceArn===resourceArn&&r.record.version===version&&r.observedInCurrentScan&&!r.stale))throw Error("Refresh the agent list before setting up observation for this agent.");else setStep(2);}}
    catch(e){if(sequence===generation.current)setError(e instanceof Error?e.message:"Saved onboarding could not be checked.");}
    finally{if(sequence===generation.current)setBusy(false);}
  }
  async function configure(form: HTMLFormElement) {
    const values = new FormData(form), account = String(values.get("accountId") ?? ""), region = String(values.get("region") ?? "");
    const sequence = ++generation.current; setBusy(true); setError(""); setNotice("");
    try {
      if (!pending.current || pending.current.account !== account || pending.current.region !== region) pending.current = { account, region, id: awsConnectionId(account, region) };
      const id = pending.current.id;
      await request("/api/workspace/discovery", { operation: "configure", connectionId: id, accountId: account, region });
      const saved = await request("/api/workspace/discovery"); if (sequence !== generation.current) return;
      setConnections(saved); setSelected(id); setAuthorization(null); setInventory(null); setRuntimeArn("");setRuntimeVersion("");setSavedEnrollment(false);setCoverage({history:"not-checked",approvals:"not-checked"}); setActivity(null); setNotice("AWS account scope saved. Read-only access must be configured before discovery can run.");
    } catch (e) { if (sequence === generation.current) setError(e instanceof Error ? e.message : "The account scope could not be saved. Retry the same account and region."); }
    finally { if (sequence === generation.current) setBusy(false); }
  }
  async function prepareAuthorization() {
    const sequence=++generation.current;setBusy(true);setError("");setAuthorization(null);
    try{const data=await request("/api/workspace/discovery/onboarding",{operation:"authorization",connectionId:selected,telemetryLogGroup:customLogGroup});if(generation.current===sequence)setAuthorization(data);}
    catch(e){if(generation.current===sequence)setError(e instanceof Error?e.message:"AWS authorization could not be prepared.");}
    finally{if(generation.current===sequence)setBusy(false);}
  }
  async function verifyAccess() {
    const sequence=++generation.current;setBusy(true);setError("");setNotice("");setInventory(null);setActivity(null);setRuntimeArn("");setRuntimeVersion("");setSavedEnrollment(false);setCoverage({history:"not-checked",approvals:"not-checked"});
    try{const data=await request("/api/workspace/discovery/onboarding",{operation:"verify",connectionId:selected});if(generation.current!==sequence)return;
      setInventory(data.inventory);const first=data.inventory.records.find((r:Inventory["records"][number])=>r.observedInCurrentScan&&!r.stale);if(first){setRuntimeArn(first.record.resourceArn);setRuntimeVersion(first.record.version);}
      setNotice("AWS account identity verified. Review the discovered agents below; execution controls remain off.");
    }catch(e){if(generation.current===sequence)setError(e instanceof Error?e.message:"AWS access could not be verified.");}
    finally{if(generation.current===sequence)setBusy(false);}
  }
  async function readActivity() {
    if (!observed || !candidate || !current) return;
    const sequence = ++generation.current; setBusy(true); setError(""); setActivity(null);
    try {
      const value = await request("/api/workspace/discovery/activity", { connectionId: observed.scope.connectionId, scanId: observed.scanId, resourceArn: candidate.record.resourceArn, version: candidate.record.version });
      if (generation.current === sequence) setActivity(value);
    } catch (e) { if (generation.current === sequence) setError(e instanceof Error ? e.message : "Activity could not be verified."); }
    finally { if (generation.current === sequence) setBusy(false); }
  }
  function remember(connectionId:string,resourceArn:string,version:string){try{localStorage.setItem(awsPlaceKey,JSON.stringify({connectionId,resourceArn,version}));}catch{}}
  function selectRuntime(arn:string,version?:string){generation.current++;setBusy(false);setRuntimeArn(arn);setRuntimeVersion(version??observed?.records.find(r=>r.record.resourceArn===arn&&r.observedInCurrentScan)?.record.version??"");setSavedEnrollment(false);setCoverage({history:"not-checked",approvals:"not-checked"});setActivity(null);setError("");}
  function reportCoverage(value:Partial<AwsConnectionCoverage>){setCoverage(previous=>({...previous,...value}));if(value.history==="connected"&&candidate){setNotice("");setSavedEnrollment(true);remember(selected,candidate.record.resourceArn,candidate.record.version);}}
  const progress=[{label:"Account saved",done:Boolean(selected)},{label:"AWS access checked",done:Boolean(observed&&!observed.stale)},{label:"Agent selected",done:Boolean(candidate)},{label:"History connected",done:coverage.history==="connected"}];
  return <div className={`aws-journey${connectionSetupOnly?" aws-journey-account":""}${step===3?" aws-journey-operational":""}`}>
    <section className="aws-journey-hero"><div><span className="aws-eyebrow">AWS CONNECTION</span><h2>{connectionSetupOnly?"AWS account setup":"Your AWS agents"}</h2><p>Connect your AWS account, choose an agent and follow its workflow history. Your agent keeps running in AWS.</p></div><span className="aws-status"><Eye size={15} aria-hidden="true" /> {coverage.approvals==="connected"?"History & approvals":coverage.history==="connected"?"History connected":"Observation first"}</span></section>
    <ol className="aws-progress" aria-label="Connection progress">{progress.filter((_,index)=>!connectionSetupOnly||index<2).map(p=><li key={p.label} data-complete={p.done}><span aria-hidden="true">{p.done?"✓":"○"}</span> {p.label}<span className="sr-only">{p.done?" — confirmed":" — not confirmed"}</span></li>)}</ol>
    <details className="aws-connection-setup" open={!(step===3&&savedEnrollment)}><summary>Connection setup</summary><nav aria-label="AWS connection steps"><ol className="aws-stepper">{awsJourneySteps.filter((_,index)=>!connectionSetupOnly||index<2).map((label, index) => <li key={label}><button aria-current={step === index ? "step" : undefined} onClick={() => navigate(index)} disabled={index > 0 && !selected || index > 1 && !current && !(index===3&&savedEnrollment)}><span className="aws-step-number">{index + 1}</span><span>{index===3&&savedEnrollment?"Agent workspace":label}</span></button></li>)}</ol></nav></details>
    {error && <p role="alert" className="cp-durable-message is-error">{error}</p>}{notice && <p role="status" className="cp-durable-message">{notice}</p>}
    <div className="aws-workspace-grid"><div className="aws-main-panel">
    {step === 0 && <><section className="cp-panel cp-durable-card"><div className="aws-section-heading"><Cloud size={24} aria-hidden="true" /><div><h2>Connect an AWS account</h2><p>Start with the account and region where your AgentCore agents run.</p></div></div>
      <form className="cp-durable-form" onSubmit={e => { e.preventDefault(); void configure(e.currentTarget); }}>
        <label>AWS account ID<input name="accountId" required inputMode="numeric" pattern="[0-9]{12}" maxLength={12} placeholder="12-digit account ID" disabled={busy} /></label>
        <label>AWS region<input name="region" required pattern="[a-z]{2}-[a-z]+-[1-9]" maxLength={32} placeholder="us-west-2" disabled={busy} /></label>
        <p className="aws-field-help">LoopLabs generates the connection reference. Enter no passwords, access keys or tokens.</p><button className="cp-button" disabled={busy || !connections}>{busy ? "Saving…" : "Save AWS account"}</button>
      </form></section>
      <section className="cp-panel cp-durable-card"><h2>Your AWS accounts</h2>{!connections && !error && <p role="status">Loading AWS connections…</p>}{connections && !connections.connections.length && <p>No AWS accounts have been added. This does not mean your AWS account has no agents.</p>}
        {connections?.truncated && <p>Showing the first 100 account scopes. Additional scopes are outside this view.</p>}
        {connections?.connections.map(c => <article className="aws-account-row" key={c.scope.connectionId}><div><h3>AWS account · {c.scope.accountId}</h3><p>{c.scope.region}</p><span className="aws-status">{c.scanReady ? "Access configured · verification required" : "Awaiting read-only access"}</span></div><button className="cp-button secondary" disabled={busy} onClick={() => void load(c.scope.connectionId)}>Open account <ArrowRight size={16} aria-hidden="true" /></button></article>)}
      </section></>}
    {step === 1 && <><section className="cp-panel cp-durable-card"><h2>Discover agents</h2><p>Account {chosen?.scope.accountId ?? inventory?.scope.accountId} · {chosen?.scope.region ?? inventory?.scope.region}</p>
      <details open={!observed || !chosen?.authorizationAvailable}><summary>Manage AWS access</summary>{chosen?.authorizationAvailable ? <div><h3>Authorize observation access in AWS</h3><p>Review a dedicated role in your AWS account. It permits agent inventory and scoped CloudWatch reads; it cannot invoke agents, read secrets or execute tools.</p>
      <label>Custom workflow log group · optional<input value={customLogGroup} onChange={e=>{setCustomLogGroup(e.target.value);setAuthorization(null);}} placeholder="/company/agent-events" maxLength={251} disabled={busy}/></label>
      <p>Use the exact log group provided by your workflow builder if business events are stored outside AgentCore runtime logs.</p>
      <button className="cp-button secondary" disabled={busy} onClick={()=>void prepareAuthorization()}>Prepare AWS access request</button>
      {authorization&&<div className="aws-callout"><div><strong>Review and create the observation role in AWS</strong><p>Sign in to account {chosen.scope.accountId} in the AWS console, review the permissions and create the stack. Then return here to verify access. The link expires {date(authorization.expiresAt)}.</p><a className="cp-button" href={authorization.url} target="_blank" rel="noopener noreferrer">Review access in AWS</a><details><summary>Dedicated role reference</summary><p>{authorization.roleArn}</p></details></div></div>}
      <button className="cp-button" disabled={busy} onClick={()=>void verifyAccess()}>{busy?"Checking AWS…":"Verify AWS access and discover"}</button></div> : chosen?.scanReady ? <><p>Read-only access is configured. Each scan checks the AWS account identity before saving inventory.</p><button className="cp-button" disabled={busy} onClick={() => void load(selected, true)}>{busy ? "Checking AWS…" : "Discover agents in AWS"}</button></> : <div className="aws-callout"><LockKeyhole size={20} aria-hidden="true" /><div><strong>Read-only access setup required</strong><p>Your cloud administrator must configure temporary discovery access for this account and region. Saving the account alone does not connect it.</p><p>This release uses administrator-assisted setup. Self-service AWS role authorization is not available yet.</p></div></div>}
      <button className="cp-button secondary" disabled={busy} onClick={() => void load(selected,true)}>Scan AWS for updates</button>
      <button className="cp-button secondary" disabled={busy} onClick={() => void load(selected)}>Reload saved inventory</button>
      </details></section>
      <section className="cp-panel cp-durable-card"><h2>Your agents</h2>{busy && <p role="status">Checking saved AWS evidence…</p>}{inventory?.status === "no-scan" && <p>No discovery scan has been saved. Agent identity, tools and activity are unknown.</p>}
      {observed && <><p>{observed.completeness === "partial" ? "Partial discovery · some reads could not be verified." : "Agent list saved for this AWS account."} Last checked {date(observed.observedAt)}.{observed.stale ? " Refresh the list before setting up a new agent." : ""}</p>{observed.historyTruncated && <p>Showing 2,000 resource versions. Earlier history remains in the workspace database.</p>}{!observed.records.length && <p>No runtime observations were saved. This does not prove that no agents exist.</p>}
        {observed.records.map(({ record, observedInCurrentScan, stale }) => <article className={`aws-agent-row${runtimeArn === record.resourceArn ? " is-selected" : ""}`} key={`${record.resourceArn}:${record.version}`}><div><h3>{awsAgentName(record.resourceId)}</h3><p>AgentCore runtime · Version {record.version}</p><span className="aws-status">{!observedInCurrentScan ? "Earlier observation" : stale || observed.stale ? "Refresh required" : "Discovered · controls not enabled"}</span><p>Tools and effective permissions have not been verified.</p></div><button className="cp-button secondary" disabled={busy || (!chosen?.authorizationAvailable && (!observedInCurrentScan || stale || observed.stale))} onClick={() => void reviewAgent(record.resourceArn,record.version)}>Review agent <ArrowRight size={16} aria-hidden="true" /></button></article>)}
      </>}
      </section></>}
    {step >= 2 && candidate && observed && <>
      {!candidate.observedInCurrentScan&&<div className="aws-callout"><div><strong>You are viewing a saved deployment version</strong><p>This workspace belongs to version {candidate.record.version}. A newer deployment needs its own owner, source and approval connection review.</p>{observed.records.filter(r=>r.observedInCurrentScan&&r.record.resourceArn===candidate.record.resourceArn).map(r=><button key={r.record.version} className="cp-button secondary" disabled={busy} onClick={()=>void reviewAgent(r.record.resourceArn,r.record.version)}>Review version {r.record.version}</button>)}</div></div>}<section className="cp-panel cp-durable-card aws-agent-summary"><label>Selected agent<select aria-label="Selected AWS agent" value={`${runtimeArn}|${runtimeVersion}`} onChange={e => {const [arn,version]=e.target.value.split("|");void reviewAgent(arn,version);}}>{observed.records.filter(r => r.observedInCurrentScan || r.record.resourceArn===runtimeArn&&r.record.version===runtimeVersion).map(({ record }) => <option key={`${record.resourceArn}:${record.version}`} value={`${record.resourceArn}|${record.version}`}>{awsAgentName(record.resourceId)} · Version {record.version}</option>)}</select></label><p>Account {observed.scope.accountId} · {observed.scope.region} · Observed {date(candidate.record.observedAt)}</p><details><summary>Agent identity and source</summary><dl className="aws-identity"><dt>Runtime reference</dt><dd>{candidate.record.resourceArn}</dd><dt>Runtime role</dt><dd>{candidate.record.roleReference ?? "Not observed"}</dd><dt>Workload identity</dt><dd>{candidate.record.workloadIdentityReference ?? "Not observed"}</dd></dl></details></section>
      {step >= 2 && <RuntimeMetadata metadata={candidate.record.declaredMetadata} version={candidate.record.version}/>}
      {step === 2 && <><AwsIntegrationGuidance /><section className="cp-panel cp-durable-card"><div className="aws-section-heading"><Radio size={22} aria-hidden="true" /><div><h2>Review recent activity</h2><p>Read supported invocation events from this agent’s reviewed CloudWatch log source.</p></div></div><p>This checks the last 15 minutes when you click. It is not a live feed; results are not retained as a LoopLabs event history.</p><button className="cp-button" disabled={busy || !current} onClick={() => void readActivity()}>{busy ? "Reading AWS activity…" : "Check last 15 minutes"}</button>
      {activity && <div className="aws-activity-results"><p>Checked {date(activity.checkedAt)} · {activity.completeness === "partial" ? "Partial read · some events could not be verified" : "Log API traversal finished for this time window"}</p>{activity.failures.length > 0 && <p role="status">Some activity could not be read or validated. This result is incomplete; check source permissions and retry.</p>}{!activity.observations.length && <div className="aws-callout"><Eye size={20} aria-hidden="true" /><div><strong>No supported invocation events found in this read</strong><p>This does not prove the agent was idle or that an action succeeded. Logs may be delayed, unavailable or use an unsupported format.</p></div></div>}{activity.unsupportedRecords > 0 && <p>{activity.unsupportedRecords} records did not match the supported invocation format. Raw log content is not displayed.</p>}{activity.observations.map(event => <article className="aws-event-row" key={event.sourceEventId}><Radio size={18} aria-hidden="true" /><div><strong>Agent invocation reported</strong><p>{date(event.timestamp)} · {event.observation.operation}</p><p>Tool activity unknown · Outcome not verified</p><details><summary>Correlation references</summary><p>Request: {event.observation.requestId}</p><p>Session: {event.observation.sessionId}</p></details></div></article>)}</div>}
      <div className="aws-callout"><Eye size={20} aria-hidden="true" /><div><strong>Visibility is separate from control</strong><p>An event reports an invocation. It does not show every tool action, attest the executed runtime version or authorize a write.</p></div></div><button className="cp-button secondary" disabled={!current} onClick={() => navigate(3)}>{chosen?.authorizationAvailable ? "Continue to onboarding" : "Continue to control setup"} <ArrowRight size={16} aria-hidden="true" /></button></section></>}
      {step === 3 && (chosen?.authorizationAvailable ? <><AwsWorkflowHistory key={`${candidate.record.resourceArn}:${candidate.record.version}`} onCoverage={reportCoverage} reference={{connectionId:observed.scope.connectionId,scanId:observed.scanId,resourceArn:candidate.record.resourceArn,version:candidate.record.version}} name={awsAgentName(candidate.record.resourceId)} /><details><summary>Optional execution enforcement</summary><AwsControlReadiness /></details></> : <><AwsControlReadiness /><CloudOwnerReviewCard reference={{ provider: "aws-agentcore-runtime", connectionId: observed.scope.connectionId, scanId: observed.scanId, resource: candidate.record.resourceArn, version: candidate.record.version }} current={current} /></>)}
    </>}
    {step > 0 && <button className="cp-button secondary" onClick={() => navigate(step - 1)}><ArrowLeft size={16} aria-hidden="true" /> Back</button>}
    </div>{!connectionSetupOnly&&<aside className="aws-context-panel"><section className="cp-panel cp-durable-card"><span className="aws-eyebrow">CONNECTION COVERAGE</span><h3>Know what is connected</h3><dl className="aws-coverage-list"><dt>Agent discovery</dt><dd>{observed ? observed.stale ? "Refresh required" : observed.completeness === "partial" ? "Partial observation" : "Agents discovered" : "Not checked"}</dd><dt>Tool access</dt><dd>Not verified</dd><dt>Workflow history</dt><dd>{({"not-checked":"Not checked","connected":"History connected","unavailable":"Check failed · retry required","setup-required":"Choose owner and history source"})[coverage.history]}</dd><dt>Workflow approvals</dt><dd>{({"not-checked":"Not checked","connected":"Approvals connected","unavailable":"Connection unavailable · decisions disabled","setup-required":"Approval setup required"})[coverage.approvals]}</dd><dt>Execution enforcement</dt><dd>Not enabled</dd><dt>Verified outcomes</dt><dd>Not independently verified</dd></dl></section><section className="cp-panel cp-durable-card"><h3>Your workflow stays in AWS</h3><p>Discovery saves identity references. It does not move code, copy provider credentials or recreate your workflow.</p><p>A connected approval bridge lets you decide requests here. Mandatory checks before every tool call require a separate verified execution checkpoint.</p><Link prefetch={false} href="/control-plane/connectors">Back to connections</Link></section></aside>}</div>
  </div>;
}
