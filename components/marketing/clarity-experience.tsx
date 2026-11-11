"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, CirclePause, Play, Undo2 } from "lucide-react";
import { LoopMark } from "@/components/brand/loop-mark";
import { EcosystemMark, type EcosystemIcon } from "./ecosystem-mark";
import { capabilityStage } from "./capability-scroll";
import { CapabilityAnimation } from "./capability-animation";
import connectionLine from "@/lib/marketing-connection-line.json";
import copy from "@/lib/marketing-clarity-copy.json";

const clientGroups: { label: string; icons: EcosystemIcon[] }[] = [
  { label: "MCP clients", icons: ["cursor", "openai", "claude"] },
  { label: "Models", icons: ["openai", "anthropic", "googlegemini"] },
  { label: "Frameworks", icons: ["langchain", "crewai", "n8n"] },
];
const businessSystems: EcosystemIcon[] = [
  "google", "twilio", "amazonwebservices", "asana",
  "stripe", "zoom", "hubspot", "github",
  "salesforce", "dropbox", "squarespace", "notion",
  "microsoft", "jira", "slack", "figma",
  "confluence", "linear", "googledrive", "zendesk",
];

export function ArchitectureFlow() {
  const [paused, setPaused] = useState(false);
  return <figure className={`clarity-architecture clarity-ecosystem ${paused ? "is-paused" : ""}`}>
    <div className="clarity-diagram-bar"><button type="button" onClick={() => setPaused(!paused)} aria-pressed={paused} aria-label={paused ? "Resume workflow animation" : "Pause workflow animation"}>{paused ? <Play size={16}/> : <CirclePause size={16}/>}</button></div>
    <div className="clarity-flow">
      <div className="clarity-ecosystem-panel clarity-agent-panel" role="group" aria-label={copy.architecture.left}>
        <span className="clarity-ecosystem-heading">{copy.architecture.left}</span>
        {clientGroups.map(group => <div className="clarity-ecosystem-group" key={group.label} role="group" aria-label={group.label}>
          <span className="clarity-ecosystem-group-label">{group.label}</span>
          <div className="clarity-client-marks">{group.icons.map(name => <EcosystemMark key={name} name={name}/>)}</div>
        </div>)}
      </div>
      <div className="clarity-flow-line" aria-hidden="true"><span/><span/></div>
      <div className="clarity-flow-core"><div className="clarity-orbit" aria-hidden="true"/><div className="clarity-orbit clarity-orbit-inner" aria-hidden="true"/><div className="clarity-center-disc"><LoopMark/><strong>{copy.architecture.center}</strong><div className="clarity-center-stages">{copy.capabilities.items.map(item => <span key={item.label}>{item.label}</span>)}</div></div></div>
      <div className="clarity-flow-line" aria-hidden="true"><span/><span/></div>
      <div className="clarity-ecosystem-panel clarity-systems-panel" role="group" aria-label={copy.architecture.right}>
        <span className="clarity-ecosystem-heading">{copy.architecture.right}</span>
        <div className="clarity-system-marks">{businessSystems.map(name => <EcosystemMark key={name} name={name}/>)}</div>
      </div>
    </div>
    <div className="clarity-return"><Undo2 size={16}/><span>{copy.architecture.return}</span></div>
    <figcaption>{connectionLine.text}</figcaption>
  </figure>;
}

export function CapabilityTabs() {
  const [active, setActive] = useState(0);
  const uid = useId();
  const refs = useRef<(HTMLButtonElement|null)[]>([]);
  const track = useRef<HTMLDivElement>(null);
  const pinned = useRef<HTMLDivElement>(null);
  const [scrollMode, setScrollMode] = useState(false);
  const [geometry, setGeometry] = useState({ height: 560, step: 430, top: 99 });
  useEffect(() => {
    const viewport = window.matchMedia("(min-width: 1024px) and (min-height: 760px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let enabled = false, step = 430, top = 99, frame = 0;
    function readScroll() {
      frame = 0;
      if (!enabled || !track.current) return;
      setActive(capabilityStage(top - track.current.getBoundingClientRect().top, step));
    }
    function schedule() { if (!frame) frame = window.requestAnimationFrame(readScroll); }
    function measure() {
      const height = pinned.current?.getBoundingClientRect().height ?? 560;
      top = document.querySelector(".marketing-header")?.getBoundingClientRect().height ?? 99;
      step = Math.max(280, Math.min(520, window.innerHeight * 0.55));
      enabled = viewport.matches && !reduced.matches && height + top + 16 <= window.innerHeight;
      setScrollMode(enabled);
      setGeometry(old => old.height === height && old.step === step && old.top === top ? old : { height, step, top });
      schedule();
    }
    const observer = new ResizeObserver(measure);
    if (pinned.current) observer.observe(pinned.current);
    viewport.addEventListener("change", measure);
    reduced.addEventListener("change", measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", schedule, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      viewport.removeEventListener("change", measure);
      reduced.removeEventListener("change", measure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  function select(index: number) {
    setActive(index);
    if (scrollMode && track.current) {
      window.scrollTo({ top: window.scrollY + track.current.getBoundingClientRect().top - geometry.top + index * geometry.step + 1, behavior: "instant" });
    }
  }
  const item = copy.capabilities.items[active];
  function keys(event:KeyboardEvent<HTMLButtonElement>, index:number) {
    let next=index;
    if(event.key==="ArrowRight") next=(index+1)%4;
    else if(event.key==="ArrowLeft") next=(index+3)%4;
    else if(event.key==="Home") next=0;
    else if(event.key==="End") next=3;
    else return;
    event.preventDefault();select(next);refs.current[next]?.focus({ preventScroll: true });
  }
  return <div ref={track} className={`clarity-scroll-track${scrollMode ? " is-scroll-driven" : ""}`} style={scrollMode ? { height: geometry.height + geometry.step * 4 } : undefined}>
    <div ref={pinned} className="clarity-capabilities" style={scrollMode ? { top: geometry.top } : undefined}>
    <div role="tablist" aria-label="Workflow control stages" className="clarity-tabs">{copy.capabilities.items.map((tab,i)=><button ref={el=>{refs.current[i]=el;}} type="button" key={tab.label} id={`${uid}-tab-${i}`} role="tab" aria-selected={active===i} aria-controls={`${uid}-panel`} tabIndex={active===i?0:-1} onClick={()=>select(i)} onKeyDown={e=>keys(e,i)}>{tab.label}<ArrowRight size={16}/></button>)}</div>
    <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${active}`} tabIndex={0} className="clarity-capability-panel">
      <div className="clarity-capability-copy"><span className="clarity-label">{item.label}</span><h3>{item.title}</h3><p>{item.body}</p><Link href={`/platform#${["workflow-boundaries","approved-execution","verified-outcomes","recovery"][active]}`}>{copy.hero.secondary}<ArrowRight size={16}/></Link></div>
      <CapabilityAnimation stage={active}/>
    </div>
    </div>
  </div>;
}
