"use client";

import { useState, type CSSProperties } from "react";
import { Headset, Landmark, Package, ShieldCheck, ContactRound, Mail, CreditCard, Warehouse, Pause, X } from "lucide-react";
import { multiFlowBranches, multiFlowScenes } from "./multi-flow";

const icons = { crm: ContactRound, email: Mail, credit: CreditCard, vendor: Warehouse };

export function HorizontalFlowScene({ step, paused, onInspect }: {
  step: number; paused: boolean; onInspect: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const current = Math.max(0, Math.min(6, step));
  const branches = multiFlowBranches(current);
  const scene = multiFlowScenes[current];
  const inspected = branches.find(branch => branch.id === selected);
  return (
    <div className={`ll-horizontal-scene ${paused ? "is-paused" : ""}`} data-step={current}>
      <div className="ll-horizontal-labels"><span>Agents</span><span>LoopLabs</span><span>Systems</span></div>
      <div className="ll-horizontal-canvas">
        <svg viewBox="0 0 360 250" fill="none" aria-hidden="true">
          {[62, 125, 188].map((y, team) => (
            <g key={y}>
              {[-15, -10, -5, 0, 5, 10, 15].map((offset, lane) => {
                const path = `M42 ${y + offset} C92 ${y + offset},112 ${125 + offset},156 ${125 + offset}`;
                return <g key={offset} style={{ "--flow-delay": `${-lane * .35 - team * .5}s` } as CSSProperties}>
                  <path d={path} stroke="#dedfd7" strokeWidth=".8" />
                  <path d={path} pathLength="100" className={`ll-action-pulse ll-horizontal-request ll-action-team-${team}`} />
                </g>;
              })}
            </g>
          ))}
          {branches.map((branch, index) => {
            const y = 41 + index * 56;
            return <g key={branch.id} data-branch={branch.id} data-dispatched={branch.dispatch}>
              {[-8, -4, 0, 4, 8].map((offset, lane) => {
                const path = `M204 ${125 + offset} C246 ${125 + offset},264 ${y + offset},304 ${y + offset}`;
                return <g key={offset} style={{ "--flow-delay": `${-lane * .4}s` } as CSSProperties}>
                  <path d={path} stroke="#dedfd7" strokeWidth=".8" />
                  {branch.dispatch && <path d={path} pathLength="100" className="ll-action-pulse ll-horizontal-dispatch ll-action-allowed" />}
                </g>;
              })}
              {!branch.dispatch && branch.status !== "Effect verified" && (
                <g transform={`translate(257 ${y + (125 - y) * .35})`}>
                  <circle r="10" fill={branch.tone === "blocked" ? "#f5e7e0" : "#f8eedf"} />
                  {branch.tone === "blocked" ? <X x={-6} y={-6} width={12} height={12} stroke="#a85f48" /> : <Pause x={-6} y={-6} width={12} height={12} stroke="#98703d" />}
                </g>
              )}
            </g>;
          })}
          {current === 4 && <path d="M305 41 C264 14,215 25,180 84" pathLength="100" className="ll-action-pulse ll-horizontal-evidence ll-action-check" />}
        </svg>
        {[Headset, Landmark, Package].map((Icon, index) => <div key={index} className="ll-horizontal-agent" style={{ top: `${(62 + index * 63) / 2.5}%` }} aria-label={["Customer operations agent", "Finance operations agent", "Vendor operations agent"][index]}><Icon size={26} aria-hidden="true" /></div>)}
        <button type="button" className="ll-horizontal-gate" aria-label="Show LoopLabs control decision" onClick={() => { setSelected(null); onInspect(); }}><ShieldCheck size={36} aria-hidden="true" /></button>
        {branches.map((branch, index) => {
          const Icon = icons[branch.id];
          return <button key={branch.id} type="button" className={`ll-horizontal-system ll-action-tone-${branch.tone}`} style={{ top: `${(41 + index * 56) / 2.5}%` }} aria-label={`Inspect ${branch.system}: ${branch.action}. ${branch.status}`} aria-pressed={selected === branch.id} onClick={() => { setSelected(branch.id); onInspect(); }}><Icon size={26} aria-hidden="true" /></button>;
        })}
      </div>
      <div className="ll-horizontal-caption">
        <strong className={`ll-action-tone-${inspected?.tone ?? scene.tone}`}>{inspected ? `${inspected.system} · ${inspected.status}` : scene.gate}</strong>
        <p>{inspected ? inspected.action : scene.title}</p>
        <details><summary>What this shows</summary><p>{scene.detail}</p></details>
      </div>
    </div>
  );
}
