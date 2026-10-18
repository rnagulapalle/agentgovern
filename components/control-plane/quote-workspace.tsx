"use client";
import { useEffect,useRef,useState } from "react";
import { QuoteWorkflowArtifact } from "./quote-workflow-view";
import { PageTitle } from "./ui";
import { workspaceJson } from "@/lib/workspace/response";
import type { QuoteWorkflowView } from "@/lib/quotes/workflow-view";
import type { SavedQuotePlan } from "@/lib/quotes/store";
import type { QuoteVerificationView } from '@/lib/quotes/verification-receipt';
import type { QuotePlanV2 } from "@/lib/quotes/plan-v2";

export type QuoteScope={id:string;quoteId:string;distributorId:string;manager:string;canPrepare:boolean;plans?:{id:string;quoteId:string;discountBps:number;totalMinor:number;manager:string}[]};
type Summary={id:string;quoteId:string;distributorId:string;discountBps:number;totalMinor:number;manager:string};
export type QuoteAction={id:string;connector:string;payload_hash:string;state:string;approved_by:string|null;evidence?:{reference?:string}|null};
export type QuoteSnapshot={saved:SavedQuotePlan;run:{id:string;state:string}|null;actions:QuoteAction[];background?:{available:boolean;state:'pending'|'started'|null};completion:"not-established"};
/** Presentation correlation only. A matched receipt describes the recorded
 * result; neither historical nor current verification grants execution authority. */
export function quoteHistoricallyVerified(snapshot:QuoteSnapshot,verification:QuoteVerificationView|null){
 const p=snapshot.saved.plan as QuotePlanV2,r=verification?.historical;
 if(!r||snapshot.run?.state!=='completed'||
    snapshot.run.id!==snapshot.saved.id||p.planId!==snapshot.saved.id||r.runId!==snapshot.run.id||
    r.planHash!==snapshot.saved.planHash||r.workspaceId!==p.workspaceId||r.quoteId!==p.quote.id||
    r.recoveryEpoch!==p.authority.recoveryEpoch||snapshot.actions.length!==2||!Array.isArray(r.steps)||r.steps.length!==2)return false;
 return ([p.update,p.message] as const).every((part,i)=>{
  const a=snapshot.actions.find(a=>a.id===part.actionId),step=r.steps[i];
  return a?.state==='succeeded'&&step?.ordinal===i+1&&step.actionId===part.actionId&&
   step.payloadHash===a.payload_hash&&step.binding===part.request.binding;
 });
}
export function quoteCurrentlyVerified(snapshot:QuoteSnapshot,verification:QuoteVerificationView|null){
 return verification?.current?.outcome==='verified'&&quoteHistoricallyVerified(snapshot,verification);
}
export function quotePresentedView(view:QuoteWorkflowView,snapshot:QuoteSnapshot|null,verification:QuoteVerificationView|null):QuoteWorkflowView {
 if(!snapshot||view.planId!==snapshot.saved.id||view.planHash!==snapshot.saved.planHash||
    view.steps.length!==2||view.steps.some((s,i)=>s.ordinal!==i+1||s.actionId!==snapshot.saved.plan[i===0?'update':'message'].actionId)||
    !quoteHistoricallyVerified(snapshot,verification))return view;
 const current=quoteCurrentlyVerified(snapshot,verification);
 return {...view,steps:view.steps.map(s=>({...s,status:(s.ordinal===1?'Quote update verified':'Confirmation acceptance verified')+(current?'':' at completion')}))};
}
export function quoteNextDecision(snapshot:QuoteSnapshot,viewer:string,verification:QuoteVerificationView|null=null){
 const p=snapshot.saved.plan as QuotePlanV2,update=snapshot.actions.find(a=>a.id===p.update.actionId),message=snapshot.actions.find(a=>a.id===p.message.actionId);
 if(quoteCurrentlyVerified(snapshot,verification))return 'Quote update and confirmation acceptance are verified. Recheck the full result whenever you need a current check.';
 if(quoteHistoricallyVerified(snapshot,verification))return 'This workflow was verified at completion. The latest check does not confirm current authority and provider state. Review the current check below; the saved result does not authorize another action.';
 if(snapshot.run?.state==='paused')return "Workflow paused. Further execution stays held; recorded effects remain available for inspection.";
 if(!snapshot.run)return "Review this proposal, then submit its two actions for independent approval.";
 if(snapshot.actions.length!==2)return "Submission is partial. Inspect existing work before retrying the same saved request.";
 if([update,message].some(a=>a?.state==='uncertain'||a?.state==='executing'))return "An outcome is uncertain. Check existing effects before any further execution.";
 if([update,message].some(a=>['cancelled','rejected','conflict'].includes(a?.state??'')))return "Work is contained. Resolve the changed authority or evidence before preparing fresh work.";
 if(update?.state==='held')return viewer===p.approver?"Review the exact quote update. Your decision does not approve the customer message.":`Waiting for ${p.approver} to review the quote update.`;
 if(snapshot.background?.state&&!snapshot.background.available&&update?.state!=='succeeded')return 'Background continuation remains recorded, but the service is unavailable. Manual execution stays held; refresh the existing work after configuration is restored.';
 if(snapshot.background?.state&&update?.state==='ready')return "Background continuation is requested. The worker must still check current authority; no quote effect is established yet.";
 if(update?.state==='ready')return "The exact update is approved. The requester can apply it after current authority checks.";
 if(update?.state==='succeeded'&&message?.state==='held')return viewer===p.approver?"Review the exact confirmation separately. Its quote predecessor must be verified.":`Waiting for ${p.approver} to review the customer confirmation.`;
 if(update?.state==='succeeded'&&message?.state==='ready')return "The confirmation is approved. Sending still requires a verified matching quote effect.";
 if(update?.state==='succeeded'&&message?.state==='succeeded')return "Both effects are recorded. Check the full result; action states alone do not establish completion.";
 return "Current eligibility is unavailable. Work stays held.";
}
export function QuoteDecisionControls({snapshot,viewer,busy,onOperation,verification=null}:{snapshot:QuoteSnapshot;viewer:string;busy:boolean;verification?:QuoteVerificationView|null;onOperation:(operation:string,step?:'update'|'message',approve?:boolean)=>void}){
 const p=snapshot.saved.plan as QuotePlanV2,owner=viewer===snapshot.saved.createdBy&&snapshot.run?.state!=='paused',manager=viewer===p.approver&&snapshot.run?.state!=='paused';
 const update=snapshot.actions.find(a=>a.id===p.update.actionId),message=snapshot.actions.find(a=>a.id===p.message.actionId);
 return <section aria-label="Next quote decision" className="cp-panel cp-durable-card"><h2>{quoteHistoricallyVerified(snapshot,verification)?'Recorded result':'Next decision'}</h2><p>{quoteNextDecision(snapshot,viewer,verification)}</p><div className="cp-durable-buttons">
 {owner&&(!snapshot.run||snapshot.actions.length!==2)&&<button className="cp-button" disabled={busy} onClick={()=>onOperation('submit')}>{snapshot.run?'Retry exact submission':'Submit for approval'}</button>}
 {manager&&update?.state==='held'&&<><button className="cp-button" disabled={busy} onClick={()=>onOperation('review','update',true)}>Approve quote update</button><button className="cp-button secondary" disabled={busy} onClick={()=>onOperation('review','update',false)}>Decline quote update</button></>}
 {owner&&update?.state==='ready'&&message?.state==='held'&&snapshot.background?.available&&!snapshot.background.state&&<button className="cp-button" disabled={busy} onClick={()=>onOperation('background')}>Continue in background</button>}
 {owner&&!snapshot.background?.state&&update?.state==='ready'&&<button className="cp-button" disabled={busy} onClick={()=>onOperation('advance','update')}>Apply approved discount</button>}
 {manager&&update?.state==='succeeded'&&message?.state==='held'&&<><button className="cp-button" disabled={busy} onClick={()=>onOperation('review','message',true)}>Approve confirmation</button><button className="cp-button secondary" disabled={busy} onClick={()=>onOperation('review','message',false)}>Decline confirmation</button></>}
 {owner&&!snapshot.background?.state&&update?.state==='succeeded'&&message?.state==='ready'&&<button className="cp-button" disabled={busy} onClick={()=>onOperation('advance','message')}>Send approved confirmation</button>}
 {snapshot.actions.filter(a=>a.state==='uncertain'||a.state==='executing').map(a=><button className="cp-button secondary" key={a.id} disabled={busy} onClick={()=>onOperation('observe',a.id===p.update.actionId?'update':'message')}>Check existing {a.id===p.update.actionId?'quote':'confirmation'} effect</button>)}
 {owner&&update?.state==='succeeded'&&message?.state==='succeeded'&&<button className="cp-button" disabled={busy} onClick={()=>onOperation(quoteHistoricallyVerified(snapshot,verification)?'resolve':'verify')}>{quoteHistoricallyVerified(snapshot,verification)?'Recheck current status':'Check full result'}</button>}
 <button className="cp-button secondary" disabled={busy} onClick={()=>onOperation('resolve')}>Refresh saved state</button></div><p>{!quoteHistoricallyVerified(snapshot,verification)&&snapshot.background?.state?'Background continuation requested; queued work is not execution or verification. The worker waits for the separate confirmation decision. ':''}{quoteHistoricallyVerified(snapshot,verification)?'Each exact action was independently approved.':'Independent approval applies separately to each exact action.'}</p></section>;
}
/** History is evidence of its original check; only fresh current status may
 * describe the provider state now. Neither grants action authority. */
export function QuoteVerificationStatus({view}:{view:QuoteVerificationView|null}){
 if(!view)return null;
 return <section className="cp-panel cp-durable-card" aria-label="Quote verification"><h2>Verification history and current status</h2>
 <h3>Recorded result</h3>{view.historical?<p>Quote update and simulated confirmation acceptance were verified at completion on {view.historical.verifiedAt}. The original result is retained.</p>:<p>No final verification record has been saved yet.</p>}
 <h3>Current check</h3><p>{view.current.outcome==='verified'&&view.historical?'Current authority and provider evidence match the recorded result.':view.current.outcome==='conflict'?'Current authority or provider state has changed.':'Current verification is unavailable.'}</p><p>{view.current.detail}</p><p>Checked {view.current.checkedAt}</p>
 <h3>Permission for further actions</h3><p>This result does not authorize another action. Any further execution requires current authorization; expired approvals cannot be reused.</p>
 {view.historical&&<details><summary>Verification references</summary><p>Run: {view.historical.runId}</p><p>Receipt: {view.historical.receiptHash}</p>{view.historical.steps.map(step=><p key={step.actionId}>{step.ordinal===1?'Quote update':'Customer confirmation'} · {step.providerReference}</p>)}</details>}</section>;
}
/** Ephemeral current-request context only. The retained server parseTurns
 * accepts user turns; assistant copy remains display-only, never authority. */
export function quoteConversationTurns(messages:readonly {role:'user'|'assistant';text:string}[],content:string){
 const turns=[...messages.filter(m=>m.role==='user').map(m=>({role:'user' as const,text:m.text})),{role:'user' as const,text:content.trim()}];
 if(turns.length>6||turns.some(t=>!t.text||t.text.length>800)||turns.reduce((n,t)=>n+t.text.length,0)>2400)throw Error('Use up to six bounded messages for this request. Start a new quote request for different work.');return turns;
}
export function QuoteWorkspace(){
 const [quotes,setQuotes]=useState<Summary[]|null>(null),[scopes,setScopes]=useState<QuoteScope[]|null>(null),[scopeId,setScope]=useState(''),[viewer,setViewer]=useState(''),[view,setView]=useState<QuoteWorkflowView|null>(null),[snapshot,setSnapshot]=useState<QuoteSnapshot|null>(null),[error,setError]=useState(''),[historyError,setHistoryError]=useState(''),[setupError,setSetupError]=useState(''),[busy,setBusy]=useState(false),[text,setText]=useState(''),[messages,setMessages]=useState<{role:'user'|'assistant';text:string}[]>([]),[tab,setTab]=useState('Conversation'),[verification,setVerification]=useState<QuoteVerificationView|null>(null);
 const pending=useRef(false),requestId=useRef<string|null>(null);
 useEffect(()=>{
  const controller=new AbortController();
  // Historical access may be refused by current authority without invalidating
  // an independently authorized current catalog. Neither error means empty data.
  const load=async(url:string,apply:(value:Awaited<ReturnType<typeof workspaceJson>>)=>void,report:(message:string)=>void,fallback:string)=>{try{const response=await fetch(url,{cache:'no-store',signal:controller.signal}),value=await workspaceJson(response);if(!response.ok)throw Error(value.error||fallback);if(!controller.signal.aborted)apply(value);}catch(e){if(!controller.signal.aborted)report(e instanceof Error?e.message:fallback);}};
  void load('/api/workspace/quotes',q=>setQuotes(q.quotes),setHistoryError,'Saved quote views are unavailable.');
  void load('/api/workspace/quotes/setup',s=>{setScopes(s.scopes);setViewer(s.viewer);setScope(s.scopes[0]?.id??'');},setSetupError,'Quote configuration is unavailable.');
  return()=>controller.abort();
 },[]);
 function adopt(value:QuoteSnapshot){setVerification(null);setSnapshot(value);const p=value.saved.plan as QuotePlanV2;setView({contract:"quote-workflow-view-1",planId:p.planId,planHash:value.saved.planHash,quoteId:p.quote.id,distributorId:p.quote.distributorId,currency:p.quote.currency,subtotalMinor:p.quote.subtotalMinor,totalMinor:p.totalMinor,discountBps:p.discountBps,delegatedBps:p.policy.delegatedBps,hardCapBps:p.policy.hardCapBps,manager:p.approver,customer:p.quote.recipient,subject:p.message.request.body.subject,message:p.message.request.body.text,sourceVersion:p.quote.sourceVersion,completion:"not-established",steps:(["update","message"] as const).map((step,i)=>{const a=value.actions.find(a=>a.id===p[step].actionId);return {ordinal:i+1,title:step==="update"?"Update distributor quote":"Send customer confirmation",status:a?.state==="succeeded"?"Effect recorded; current verification required":a?.state==="ready"?"Exact approval recorded; execution checks pending":a?.state==="uncertain"||a?.state==="executing"?"Outcome awaiting verification":a?.state==="held"||!a?"Independent approval required":"Contained; current review required",state:a?.state??null,actionId:p[step].actionId,approvedBy:a?.approved_by??null,evidenceReference:a?.evidence?.reference??null};})});}
 async function call(operation:string,extra:Record<string,unknown>={},id=snapshot?.saved.id,selectedScope=scopeId){if(!id)throw Error('Select an exact saved quote.');const r=await fetch(`/api/workspace/quotes?scope=${encodeURIComponent(selectedScope)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,id,...extra})}),value=await workspaceJson(r);if(!r.ok)throw Error(value.error||'The requested decision is unavailable.');return value;}
 async function refreshVerification(value:QuoteSnapshot,selectedScope:string){if(!value.run)return;const q=new URLSearchParams({scope:selectedScope,id:value.saved.id,planHash:value.saved.planHash});const r=await fetch('/api/workspace/quotes/verification?'+q,{cache:'no-store'}),v=await workspaceJson(r);if(!r.ok)throw Error(v.error||'Current quote verification is unavailable.');setVerification(v as QuoteVerificationView);}
 async function select(id:string,draftScope?:string){if(pending.current)return;pending.current=true;setBusy(true);setError('');try{if(draftScope){setScope(draftScope);const value=await call('resolve',{},id,draftScope);adopt(value);await refreshVerification(value,draftScope);setTab('Plan');return;}const r=await fetch(`/api/workspace/quotes?run=${encodeURIComponent(id)}`,{cache:'no-store'}),v=await workspaceJson(r);if(!r.ok)throw Error(v.error||'This saved quote is unavailable.');setView(v.view);setSnapshot(null);const s=scopes?.find(s=>s.quoteId===v.view.quoteId&&s.manager===v.view.manager);if(s){setScope(s.id);const value=await call('resolve',{},id,s.id);adopt(value);await refreshVerification(value,s.id);}setTab('Plan');}catch(e){setError(e instanceof Error?e.message:'This saved quote is unavailable.');}finally{pending.current=false;setBusy(false);}}
 async function prepare(){if(pending.current||!text.trim())return;pending.current=true;setBusy(true);setError('');const content=text.trim();setMessages(m=>[...m,{role:'user',text:content}]);requestId.current??=crypto.randomUUID();try{const v=await call('prepare',{turns:quoteConversationTurns(messages,content)},requestId.current);if(v.saved){adopt({saved:v.saved,run:null,actions:[],completion:'not-established'});setMessages(m=>[...m,{role:'assistant',text:v.reply}]);setText('');requestId.current=null;setTab('Plan');}else setMessages(m=>[...m,{role:'assistant',text:v.clarification}]);}catch(e){setError(e instanceof Error?e.message:'Quote planning is unavailable.');}finally{pending.current=false;setBusy(false);}}
 async function recoverDraft(){if(pending.current||!requestId.current)return;pending.current=true;setBusy(true);setError('');try{adopt(await call('resolve',{},requestId.current));requestId.current=null;setTab('Plan');setText('');}catch(e){setError(e instanceof Error?e.message:'Existing saved request is unavailable.');}finally{pending.current=false;setBusy(false);}}
 async function operate(operation:string,step?:'update'|'message',approve?:boolean){if(pending.current||!snapshot)return;pending.current=true;setBusy(true);setError('');try{const p=snapshot.saved.plan as QuotePlanV2,extra:Record<string,unknown>=operation==='resolve'?{}:{planHash:snapshot.saved.planHash};if(step)extra.step=step;if(operation==='review'){const a=snapshot.actions.find(a=>a.id===p[step!].actionId);if(!a)throw Error('Refresh the exact saved action before reviewing.');extra.payloadHash=a.payload_hash;extra.approve=approve;}const value=await call(operation,extra);const resolved=value.saved?value:await call('resolve');adopt(resolved);await refreshVerification(resolved,scopeId);if(value.blocker)setError(value.blocker);if(operation==='verify')setMessages(m=>[...m,{role:'assistant',text:'The original verification record and a fresh provider check are shown separately in the plan. Recorded action states alone are not completion.'}]);}catch(e){setError((e instanceof Error?e.message:'This decision is unavailable.')+' Refresh saved state before retrying; an effect may already exist.');}finally{pending.current=false;setBusy(false);}}
 function newRequest(){setSnapshot(null);setVerification(null);setView(null);setText('');setMessages([]);setError('');setScope(scopes?.[0]?.id??'');requestId.current=null;setTab('Conversation');}
 const selected=scopes?.find(s=>s.id===scopeId);
 const presentedView=view?quotePresentedView(view,snapshot,verification):null;
 return <div className="cp-durable quote-workspace"><PageTitle eyebrow="QUOTE WORKSPACE" title="Distributor quotes" description="Prepare a discount, get an independent decision, and confirm the exact verified quote."/>
 <p className="quote-environment">Simulated business systems · no real customer update or email delivery.</p>{error&&<p role="alert">{error}</p>}{historyError&&<p role="alert">Saved workflow history unavailable: {historyError}</p>}{setupError&&<p role="alert">Quote configuration unavailable: {setupError}</p>}
 {quotes===null&&!historyError&&<p role="status">Loading saved quote workflows…</p>}
 {scopes?.length===0&&<p role="status">Interactive quote configuration is unavailable. Saved workflows remain available for review; no default provider is selected.</p>}
 {!!scopes?.some(s=>s.plans?.length)&&<details className="cp-panel cp-durable-card"><summary>Saved quote requests</summary><div className="cp-durable-buttons">{scopes.flatMap(s=>(s.plans??[]).map(p=><button className="cp-button secondary" key={p.id} disabled={busy} onClick={()=>void select(p.id,s.id)}>Open {p.quoteId} · {p.discountBps/100}% · {p.manager}</button>))}</div></details>}
 {!!quotes?.length&&<details className="cp-panel cp-durable-card"><summary>Saved quote workflows</summary><div className="cp-durable-buttons">{quotes.map(q=><button className="cp-button secondary" key={q.id} disabled={busy} onClick={()=>void select(q.id)}>View {q.quoteId} · {q.distributorId} · {q.discountBps/100}%</button>)}</div></details>}
 <div className="cp-durable-buttons quote-tabs" role="tablist" aria-label="Quote workspace views">{['Conversation','Plan','Activity'].map(t=><button className="cp-button secondary" role="tab" aria-selected={tab===t} key={t} onClick={()=>setTab(t)}>{t}</button>)}</div>
 <div className="quote-main"><section data-active={tab==='Conversation'} className="cp-panel cp-durable-card quote-conversation" aria-label="Quote conversation"><h2>Describe the quote change</h2><p>Choose a quote already allowed in this workspace. Its pricing rules and designated manager are configured by your administrator.</p>{messages.map((m,i)=><p key={i}><strong>{m.role==='user'?'You':'LoopLabs'}:</strong> {m.text}</p>)}{!messages.length&&<p>Try: “Prepare a 14% discount for this distributor and ask the designated manager before changing the quote or sending confirmation.”</p>}</section>
 <div data-active={tab==='Plan'} className="quote-artifact">{view?<QuoteWorkflowArtifact view={presentedView!} currentlyVerified={!!snapshot&&quoteCurrentlyVerified(snapshot,verification)} historicallyVerified={presentedView!==view}/>:<section className="cp-panel cp-durable-card"><h2>Quote plan</h2><p>Your exact saved pricing and customer message will appear here for review.</p></section>}</div></div>
 {tab==='Activity'&&<section className="cp-panel cp-durable-card"><h2>Activity</h2>{snapshot?<><p>{quoteNextDecision(snapshot,viewer,verification)}</p><details><summary>Technical references</summary>{snapshot.actions.map(a=><p key={a.id}>{a.connector} · {a.state} · {a.id}</p>)}</details></>:<p>Select a saved quote to inspect its recorded actions.</p>}</section>}
 <QuoteVerificationStatus view={verification}/>{snapshot&&<QuoteDecisionControls snapshot={snapshot} verification={verification} viewer={viewer} busy={busy} onOperation={(o,s,a)=>void operate(o,s,a)}/>}
 {tab!=='Conversation'&&(snapshot||requestId.current)&&<button className="cp-button secondary quote-new-request" type="button" disabled={busy} onClick={newRequest}>New quote request</button>}
 <form hidden={tab!=='Conversation'} className="cp-panel cp-durable-card quote-composer" onSubmit={e=>{e.preventDefault();void prepare();}} aria-label="Quote request composer"><label>Enrolled quote<select value={scopeId} disabled={busy||!!snapshot||!!requestId.current} onChange={e=>setScope(e.target.value)}>{scopes?.map(s=><option key={s.id} value={s.id}>{s.quoteId} · {s.distributorId}</option>)}</select></label>{selected&&<p>Designated manager: {selected.manager}</p>}<label htmlFor="quote-request">Your request</label><textarea id="quote-request" value={text} onChange={e=>setText(e.target.value)} maxLength={800} rows={3} disabled={busy||!selected?.canPrepare}/><div className="cp-durable-buttons"><button className="cp-button" type="submit" disabled={busy||!selected?.canPrepare||!text.trim()}>Prepare quote plan</button>{requestId.current&&<button className="cp-button secondary" type="button" disabled={busy} onClick={()=>void recoverDraft()}>Check existing saved request</button>}{(snapshot||requestId.current)&&<button className="cp-button secondary" type="button" disabled={busy} onClick={newRequest}>New quote request</button>}</div><p>Preparing a plan does not approve or execute it. Another named member reviews each action before it can proceed. This planner supports only the sample quote workflow.</p></form>
 {busy&&<p role="status">Checking the exact saved quote…</p>}<style>{`
 .quote-workspace {font-size:16px;}
 .quote-workspace .cp-button {font:inherit;}
 .quote-workspace .quote-main {display:grid;grid-template-columns:minmax(0,1fr);gap:16px;}
 .quote-workspace .quote-conversation[data-active="false"],.quote-workspace .quote-artifact[data-active="false"],.quote-workspace .quote-composer[hidden] {display:none;}
 .quote-workspace .quote-composer {position:relative;background:var(--cp-surface,#fafaf7);}
 .quote-workspace .quote-composer textarea,.quote-workspace .quote-composer select {width:100%;font:inherit;min-height:44px;}
 .quote-workspace .cp-button,.quote-workspace summary {min-height:44px;}
 .quote-workspace summary {display:flex;align-items:center;cursor:pointer;}
 .quote-workspace summary::before {content:'▸';margin-right:8px;}.quote-workspace details[open]>summary::before {content:'▾';}
 .quote-workspace .quote-tabs {display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0;}
 .quote-workspace .quote-tabs .cp-button {width:100%;padding:10px 8px;}
 .quote-workspace .quote-environment {margin:0 0 12px;}
 .quote-workspace .quote-overview h2 {margin-bottom:12px;}
 .quote-workspace .quote-totals {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:12px 0;}
 .quote-workspace .quote-totals dd {margin:4px 0 0;font-size:24px;}
 .quote-workspace .quote-manager {display:flex;flex-wrap:wrap;gap:4px 12px;padding:12px 0;border-block:1px solid var(--cp-border,#deded6);}
 .quote-workspace .quote-steps {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:0;list-style:none;counter-reset:quote-step;margin:16px 0;}
 .quote-workspace .quote-steps li {counter-increment:quote-step;min-width:0;}
 .quote-workspace .quote-steps h3::before {content:counter(quote-step) '. ';}
 .quote-workspace .quote-steps h3,.quote-workspace .quote-message h3 {font-size:16px;margin:0 0 4px;}
 .quote-workspace .quote-steps p {margin:0;}
 .quote-workspace .quote-message {padding:12px;background:var(--cp-surface,#fafaf7);border:1px solid var(--cp-border,#deded6);}
 .quote-workspace .quote-message p {margin:4px 0;}
 .quote-workspace .quote-snapshot-note {margin:12px 0 0;}
 .quote-workspace p,.quote-workspace dd,.quote-workspace strong {overflow-wrap:anywhere;}
 .quote-workspace .quote-new-request {margin-bottom:16px;}
 @media(min-width:1000px){.quote-workspace .quote-overview {max-width:960px;}.quote-workspace .quote-composer {max-width:960px;}}
 `}</style></div>;
}