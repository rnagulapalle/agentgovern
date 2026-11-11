"use client";

import { useState } from "react";
import { Bot, CirclePause, Play, UserRound, ShieldCheck, Database, ScanLine, LockKeyhole, Check, ChevronRight } from "lucide-react";
import { LoopMark } from "@/components/brand/loop-mark";
import { EcosystemMark } from "./ecosystem-mark";

/** Architecture illustration only. No provider requests or live runtime health. */
export function DeploymentArchitecture({title,note}:{title:string;note:string}) {
  const [paused,setPaused]=useState(false);
  return <figure className={`deployment-blueprint${paused?" is-paused":""}`} aria-label="Controlled deployment architecture">
    <div className="deployment-blueprint-top"><span><LockKeyhole size={13}/>{title}</span><button type="button" aria-label={paused?"Resume deployment animation":"Pause deployment animation"} aria-pressed={paused} onClick={()=>setPaused(!paused)}>{paused?<Play size={14}/>:<CirclePause size={14}/>}</button></div>
    <div className="deployment-blueprint-body">
      <div className="deployment-review"><span className="deployment-owner"><UserRound size={15}/>Named reviewer</span><span className="deployment-review-rule"/><span className="deployment-approval"><ShieldCheck size={15}/>Exact-action approval</span></div>
      <div className="deployment-runtime-boundary">
        <div className="deployment-runtime-label"><EcosystemMark name="amazonwebservices"/><span>Workflow runtime</span><LockKeyhole size={12}/></div>
        <div className="deployment-runtime-flow">
          <svg className="deployment-runtime-paths" viewBox="0 0 600 210" preserveAspectRatio="none" aria-hidden="true"><path d="M85 105H300H510"/><path d="M300 105V185"/><path className="deployment-packet" d="M85 105H300H510"/><path className="deployment-packet deployment-packet-return" d="M510 125H300V185"/></svg>
          <div className="deployment-agent"><span><Bot/></span><strong>Scoped agents</strong><small>Identity + limits</small></div>
          <div className="deployment-engine"><LoopMark/><strong>LoopLabs</strong><span><Check size={11}/>Policy checks</span></div>
          <div className="deployment-systems"><span><EcosystemMark name="hubspot"/><EcosystemMark name="google"/></span><strong>Business systems</strong><small>Scoped connections</small></div>
        </div>
      </div>
      <div className="deployment-evidence"><div><Database size={18}/><span><strong>Action history</strong><small>Who · what · when</small></span></div><ChevronRight size={16}/><div><ScanLine size={18}/><span><strong>Outcome verification</strong><small>Read back · reconcile</small></span></div></div>
    </div>
    <figcaption>{note}</figcaption>
  </figure>;
}
