"use client";

import { useState } from "react";
import { Bot, Check, CirclePause, Play, UserRound, FileCheck2, LockKeyhole, Search, Clock3 } from "lucide-react";
import { LoopMark } from "@/components/brand/loop-mark";
import { EcosystemMark } from "./ecosystem-mark";
import workflow from "@/lib/marketing-tab-workflow-copy.json";

const text = workflow.diagram;
/** Explanatory sample only: all chapters share one record, no execution authority. */
export function CapabilityAnimation({ stage }: { stage: number }) {
  const [paused, setPaused] = useState(false);
  const label = workflow.items[stage].label;
  return <figure className={`clarity-motion-frame scene-${stage}${paused ? " is-paused" : ""}`} aria-label={`${label} workflow illustration`}>
    <div className="clarity-motion-wash" aria-hidden="true"/>
    <div className="clarity-motion-surface">
      <div className="clarity-motion-toolbar"><span>LoopLabs / {label}</span><button type="button" aria-label={paused ? "Resume tab animation" : "Pause tab animation"} aria-pressed={paused} onClick={()=>setPaused(!paused)}>{paused?<Play size={15}/>:<CirclePause size={15}/>}</button></div>
      <div className="motion-workflow-context"><strong>{text.workflow}</strong><span>{text.record}</span></div>
      <div className="clarity-motion-scene" key={stage}>
        {stage===0?<DefineScene/>:stage===1?<ApproveScene/>:stage===2?<VerifyScene/>:<ReconcileScene/>}
      </div>
      <figcaption>{text.sampleNote}</figcaption>
    </div>
  </figure>;
}
function Hub() { return <div className="motion-hub"><div className="motion-halo"/><LoopMark/><span>LoopLabs</span></div>; }
function Paths({ kind }: { kind:"scope"|"approval"|"readback"|"reconcile" }) {
  return <svg viewBox="0 0 600 360" className="motion-paths" aria-hidden="true">
    {kind==="scope"&&<><path d="M100 100 H180 Q205 100 230 160 L260 180"/><path d="M100 250 H180 Q205 250 230 210 L260 180"/><path className="motion-held-path" d="M340 180 H390 Q420 180 440 110 H500"/><path className="motion-held-path" d="M340 180 H390 Q420 180 440 250 H500"/><path className="motion-packet" d="M100 100 H180 Q205 100 230 160 L260 180"/></>}
    {kind==="approval"&&<><path d="M105 180 H260"/><path d="M300 140 V85 H440"/><path className="motion-held-path" d="M340 180 H495"/><path className="motion-packet" d="M105 180 H260"/><path className="motion-packet packet-delayed" d="M300 140 V85 H440"/></>}
    {(kind==="readback"||kind==="reconcile")&&<><path className="motion-held-path" d="M100 180 H260"/><path d="M340 155 C410 95 455 95 510 150"/><path d="M510 210 C450 270 400 270 340 205"/><path className="motion-packet" d="M340 155 C410 95 455 95 510 150"/><path className="motion-packet packet-delayed" d="M510 210 C450 270 400 270 340 205"/></>}
  </svg>;
}
function DefineScene() {
 return <><Paths kind="scope"/><div className="motion-node node-person"><Bot/><span>{text.crmAgent}</span></div><div className="motion-node node-agent"><Bot/><span>{text.emailAgent}</span></div><Hub/><div className="motion-node node-system system-top"><EcosystemMark name="hubspot"/><span>{text.crmUpdate}</span></div><div className="motion-node node-system system-bottom"><EcosystemMark name="google"/><span>{text.emailSend}</span></div><div className="motion-workflow-note"><LockKeyhole size={13}/><span>{text.dependency}</span></div></>;
}
function ApproveScene() {
 return <><Paths kind="approval"/><div className="motion-node node-request"><FileCheck2/><span>{text.crmUpdate}</span></div><Hub/><div className="motion-node node-approver"><UserRound/><span>{text.reviewerName}</span><small>{text.reviewerRole}</small></div><div className="motion-node node-destination"><EcosystemMark name="google"/><span>{text.emailSend}</span><span className="motion-held"><LockKeyhole size={12}/>{text.dependency}</span></div><div className="motion-approval-details"><span><FileCheck2 size={14}/>{text.crmApproval}</span><span><FileCheck2 size={14}/>{text.emailApproval}</span></div></>;
}
function VerifyScene() {
 return <><Paths kind="readback"/><div className="motion-node node-request"><EcosystemMark name="google"/><span>{text.emailSend}</span><span className="motion-held"><LockKeyhole size={12}/>{text.dependency}</span></div><Hub/><div className="motion-node node-destination"><EcosystemMark name="hubspot"/><span>{text.crmReadback}</span><span className="motion-verified"><Check size={12}/>{text.verified}</span></div><div className="motion-result-note"><Check size={15}/><span>{text.mayContinue}</span></div></>;
}
function ReconcileScene() {
 return <><Paths kind="reconcile"/><div className="motion-node node-request"><Clock3/><span>{text.lostResponse}</span></div><div className="motion-reconcile-hub"><div className="motion-halo"/><Search/><span>{text.checkExisting}</span></div><div className="motion-node node-destination"><EcosystemMark name="hubspot"/><span>{text.crmReadback}</span><span className="motion-verified"><Check size={12}/>{text.foundOnce}</span></div><div className="motion-reconcile-result"><span><Check size={14}/>{text.noDuplicate}</span><span><LockKeyhole size={14}/>{text.unknownHeld}</span></div></>;
}
