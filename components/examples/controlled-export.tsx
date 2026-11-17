"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, FileCheck2, LockKeyhole, RefreshCw, ShieldCheck, UserRound, X } from "lucide-react";
import { LoopMark } from "@/components/brand/loop-mark";
import { EcosystemMark } from "@/components/marketing/ecosystem-mark";
import { checkExampleExport, decideExampleExport, currentExampleDecision, type ExampleExportDecision } from "@/lib/examples/controlled-export";
import content from "@/lib/marketing-export-example-copy.json";
import policyCopy from "@/lib/marketing-export-policy-copy.json";

const copy = content.example;
/** A browser-only teaching surface. No session, connector, approval API or effect. */
export function ControlledExportExample() {
  const [rows,setRows] = useState(3120);
  const [evaluated,setEvaluated] = useState(false);
  const [record,setRecord] = useState<ExampleExportDecision|null>(null);
  const [invalidated,setInvalidated] = useState(false);
  const verdict = checkExampleExport(rows);
  const current = currentExampleDecision(record,rows);
  function changeRows(value:number) {
    if(value===rows)return;
    if(record)setInvalidated(true);
    setRows(value);setRecord(null);setEvaluated(false);
  }
  function check() {
    if(verdict===null)return;
    setEvaluated(true);setInvalidated(false);
    setRecord(verdict==="allow"?decideExampleExport(rows,"approve"):null);
  }
  function review(decision:"approve"|"reject") {
    if(!evaluated)return;
    setRecord(decideExampleExport(rows,decision));setInvalidated(false);
  }
  function reset() {setRows(3120);setEvaluated(false);setRecord(null);setInvalidated(false);}
  const rejected=current?.outcome==="rejected";
  const approved=current?.outcome==="review-approved";
  const title=invalidated?copy.invalidatedTitle:rejected?copy.rejectedTitle:approved?copy.approvedTitle:evaluated?(verdict==="allow"?copy.allowedTitle:copy.heldTitle):copy.workflowTitle;
  const body=invalidated?copy.invalidatedBody:rejected?copy.rejectedBody:approved?copy.approvedBody:evaluated?(verdict==="allow"?copy.allowedBody:copy.heldBody):`${copy.scopeLabel}: ${rows.toLocaleString("en-US")}`;
  return <>
    <section className="example-heading"><span className="clarity-label">{copy.eyebrow}</span><h1>{copy.title}</h1><p>{copy.body}</p><span className="example-scope">{copy.scopeNote}</span></section>
    <section className="export-example" aria-label={copy.workflowTitle}>
      <div className="export-controls">
        <div className="example-card-heading"><ShieldCheck/><h2>{copy.policyTitle}</h2></div><p>{policyCopy.policyBody}</p>
        <label htmlFor="export-rows">{copy.scopeLabel}<strong>{rows.toLocaleString("en-US")}</strong></label>
        <input id="export-rows" type="range" min="0" max="5000" step="1" value={rows} onChange={e=>changeRows(Number(e.target.value))}/>
        <div className="export-presets">{[100,500,3120].map(n=><button key={n} type="button" aria-pressed={rows===n} onClick={()=>changeRows(n)}>{n.toLocaleString("en-US")}</button>)}</div>
        <div className="example-buttons"><button className="clarity-primary" type="button" onClick={check} disabled={verdict===null}>{copy.evaluate}<ArrowRight size={16}/></button><button className="example-reset" type="button" onClick={reset}><RefreshCw size={15}/>{copy.reset}</button></div>
      </div>
      <div className="export-live">
        <div className="export-flow" aria-label="Example request path">
          <div><EcosystemMark name="databricks"/><strong>Restricted records</strong><span>{rows.toLocaleString("en-US")} records</span></div><ArrowRight className="export-arrow"/>
          <div className="export-loop"><LoopMark/><strong>LoopLabs</strong><span>Action check</span></div><ArrowRight className="export-arrow"/>
          <div><LockKeyhole/><strong>Analytics export</strong><span>{evaluated&&!current?"Held":current?"Decision recorded":"Not checked"}</span></div>
        </div>
        <div className={`export-verdict ${invalidated||(!current&&evaluated)?"is-held":current&&!rejected?"is-approved":rejected?"is-rejected":""}`} role="status" aria-live="polite"><div className="example-verdict-icon">{rejected?<X/>:current?<Check/>:<LockKeyhole/>}</div><div><h2>{title}</h2><p>{body}</p></div></div>
        {evaluated&&!current&&verdict==="require_approval"&&<div className="export-review"><div className="export-reviewer"><UserRound/><span>Example data steward</span></div><div className="example-buttons"><button type="button" onClick={()=>review("approve")}>{copy.approve}</button><button type="button" onClick={()=>changeRows(500)}>{copy.narrow}</button><button type="button" onClick={()=>review("reject")}>{copy.reject}</button></div></div>}
        <div className="export-record"><div className="example-card-heading"><FileCheck2/><h3>{copy.recordTitle}</h3></div>{current||evaluated?<dl><div><dt>Requested scope</dt><dd>{(current?.rows??rows).toLocaleString("en-US")} records</dd></div><div><dt>Decision</dt><dd>{!current?copy.heldTitle:current.outcome==="rejected"?"Rejected":current.outcome==="review-approved"?"Example reviewer approved":"Within example policy"}</dd></div><div><dt>Business-system calls</dt><dd>0</dd></div></dl>:<p>{invalidated?copy.invalidatedBody:"Check a request to create an example decision record."}</p>}</div>
      </div>
    </section>
    <div className="example-closing"><Link className="clarity-primary" href="/contact-sales">{copy.cta}<ArrowRight size={16}/></Link><Link href="/platform">{copy.homeLink}</Link></div>
  </>;
}
