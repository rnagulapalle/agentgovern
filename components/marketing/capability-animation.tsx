"use client";

import { useState } from "react";
import { Bot, Check, CirclePause, Play, UserRound, FileCheck2, LockKeyhole, Undo2 } from "lucide-react";
import { LoopMark } from "@/components/brand/loop-mark";
import { EcosystemMark } from "./ecosystem-mark";

const labels = ["Define", "Approve", "Verify", "Recover"];
/** Explanatory motion only. No connector call or execution authority exists here. */
export function CapabilityAnimation({ stage }: { stage: number }) {
  const [paused, setPaused] = useState(false);
  return <figure className={`clarity-motion-frame scene-${stage}${paused ? " is-paused" : ""}`} aria-label={`${labels[stage]} workflow illustration`}>
    <div className="clarity-motion-wash" aria-hidden="true"/>
    <div className="clarity-motion-surface">
      <div className="clarity-motion-toolbar"><span>LoopLabs / {labels[stage]}</span><button type="button" aria-label={paused ? "Resume tab animation" : "Pause tab animation"} aria-pressed={paused} onClick={()=>setPaused(!paused)}>{paused?<Play size={15}/>:<CirclePause size={15}/>}</button></div>
      <div className="clarity-motion-scene" key={stage}>
        {stage===0?<DefineScene/>:stage===1?<ApproveScene/>:stage===2?<VerifyScene/>:<RecoverScene/>}
      </div>
      <figcaption>Illustrative workflow · sample data</figcaption>
    </div>
  </figure>;
}
function Hub() { return <div className="motion-hub"><div className="motion-halo"/><LoopMark/><span>LoopLabs</span></div>; }
function Paths({ kind }: { kind:"scope"|"approval"|"readback"|"recovery" }) {
  return <svg viewBox="0 0 600 360" className="motion-paths" aria-hidden="true">
    {kind==="scope"&&<><path d="M100 100 H180 Q205 100 230 160 L260 180"/><path d="M100 250 H180 Q205 250 230 210 L260 180"/><path d="M340 180 H390 Q420 180 440 110 H500"/><path d="M340 180 H390 Q420 180 440 250 H500"/><path className="motion-packet" d="M100 100 H180 Q205 100 230 160 L260 180"/><path className="motion-packet packet-delayed" d="M100 250 H180 Q205 250 230 210 L260 180"/></>}
    {kind==="approval"&&<><path d="M105 180 H260"/><path d="M300 140 V85 H440"/><path className="motion-held-path" d="M340 180 H495"/><path className="motion-packet" d="M105 180 H260"/><path className="motion-packet packet-delayed" d="M300 140 V85 H440"/></>}
    {kind==="readback"&&<><path d="M100 180 H260"/><path d="M340 155 C410 95 455 95 510 150"/><path d="M510 210 C450 270 400 270 340 205"/><path className="motion-packet" d="M340 155 C410 95 455 95 510 150"/><path className="motion-packet packet-delayed" d="M510 210 C450 270 400 270 340 205"/></>}
    {kind==="recovery"&&<><path d="M115 180 H255"/><path className="motion-proposed-path" d="M345 180 H490"/><path className="motion-packet" d="M115 180 H255"/></>}
  </svg>;
}
function DefineScene() {
 return <><Paths kind="scope"/><div className="motion-node node-person"><UserRound/><span>Accountable owner</span></div><div className="motion-node node-agent"><Bot/><span>Revenue agent</span></div><Hub/><div className="motion-node node-system system-top"><EcosystemMark name="hubspot"/><span>CRM read</span></div><div className="motion-node node-system system-bottom"><EcosystemMark name="google"/><span>Email send</span></div><div className="motion-scope-note"><LockKeyhole size={13}/><span>Agent authority</span><strong>10%</strong></div></>;
}
function ApproveScene() {
 return <><Paths kind="approval"/><div className="motion-node node-request"><Bot/><span>Proposed action</span></div><Hub/><div className="motion-node node-approver"><UserRound/><span>Sarah Chen</span><small>Manager</small></div><div className="motion-node node-destination"><EcosystemMark name="google"/><span>Messaging</span><span className="motion-held"><LockKeyhole size={12}/>Held</span></div><div className="motion-request-detail"><span>Requested discount<strong>25%</strong></span><span>Agent authority<strong>10%</strong></span><div className="motion-review-highlight">Needs approval</div></div></>;
}
function VerifyScene() {
 return <><Paths kind="readback"/><div className="motion-node node-request"><FileCheck2/><span>Action</span></div><Hub/><div className="motion-node node-destination"><EcosystemMark name="hubspot"/><span>CRM / Account update</span></div><span className="motion-path-label read-label">Read-back</span><span className="motion-path-label evidence-label">Observed outcome</span><div className="motion-readback"><span className="motion-uncertain"><span/>Uncertain</span><div><FileCheck2 size={16}/><span>Messaging</span><strong>Held · verify CRM first</strong></div></div></>;
}
function RecoverScene() {
 return <><Paths kind="recovery"/><div className="motion-node node-record"><span>Current record</span><strong>Net 90</strong><small>v12</small></div><div className="motion-recovery-review"><div className="motion-halo"/><Undo2/><span>Review the recovery plan</span><UserRound size={17}/></div><div className="motion-node node-proposed"><span>Restore Net 30</span><strong>Net 30</strong><small>v13 · Proposed</small></div><div className="motion-recovery-note"><Check size={14}/><span>Restore only if the record still matches the reviewed version.</span></div></>;
}
