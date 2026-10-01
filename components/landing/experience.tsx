"use client";

import Link from "next/link";
import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  CirclePause,
  FileCheck2,
  Fingerprint,
  GitBranch,
  LockKeyhole,
  Pause,
  Play,
  ShieldCheck,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";
import { MarketingHeader } from "@/components/marketing/chrome";
import { LoopMark } from "@/components/brand/loop-mark";

export function LandingHeader({ bookingUrl }: { bookingUrl: string }) {
  return <MarketingHeader bookingUrl={bookingUrl} />;
}

export function ControlWave() {
  const [paused, setPaused] = useState(false);
  const packetRows = [214, 244, 274, 304, 334];
  return (
    <div className={`ll-wave ${paused ? "ll-wave-paused" : ""}`}>
      <svg
        className="ll-wave-drawing"
        viewBox="0 0 660 550"
        fill="none"
        role="img"
        aria-label="Agent actions pass through a control boundary while an uncertain external outcome loops back for reconciliation before retry."
      >
        <defs>
          <linearGradient
            id="wave-fade"
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2="660"
            y2="0"
          >
            <stop stopColor="#1c1917" stopOpacity="0" />
            <stop offset=".28" stopColor="#1c1917" stopOpacity=".5" />
            <stop offset=".52" stopColor="#1c1917" />
            <stop offset=".9" stopColor="#1c1917" />
            <stop offset="1" stopColor="#1c1917" stopOpacity=".12" />
          </linearGradient>
        </defs>
        <rect x="35" y="153" width="275" height="244" rx="4" className="ll-wave-zone ll-wave-zone-in" />
        <rect x="407" y="153" width="218" height="244" rx="4" className="ll-wave-zone ll-wave-zone-out" />
        <text x="54" y="178" className="ll-wave-zone-label">AGENT ACTIONS</text>
        <text x="429" y="178" className="ll-wave-zone-label">EXTERNAL EFFECT</text>
        <g stroke="url(#wave-fade)" opacity=".42">
          {Array.from({ length: 104 }, (_, i) => {
            const x = 14 + i * 6.2;
            const disorder = Math.max(0, 1 - i / 57);
            const height =
              122 + disorder * (95 + 235 * Math.abs(Math.sin(i * 1.19)));
            const shift = disorder * Math.sin(i * 2.13) * 42;
            return (
              <path
                key={i}
                className={
                  i < 58
                    ? "ll-wave-line ll-wave-loose"
                    : "ll-wave-line ll-wave-steady"
                }
                d={`M${x.toFixed(2)} ${(275 - height / 2 + shift).toFixed(2)}v${height.toFixed(2)}`}
                strokeWidth={i % 5 === 0 ? 1.2 : 0.7}
                style={
                  {
                    "--line-delay": `${-i * 0.18}s`,
                    "--line-speed": `${3.8 + (i % 7) * 0.45}s`,
                  } as CSSProperties
                }
              />
            );
          })}
        </g>
        <path
          d="M358 123v92m0 121v91"
          stroke="#a8a29e"
          strokeWidth=".8"
          strokeDasharray="2 4"
        />
        <g className="ll-wave-rails" strokeWidth="1">
          {packetRows.map((y) => (
            <path key={y} d={`M56 ${y}H326M390 ${y}H610`} />
          ))}
        </g>
        <g className="ll-wave-packets-in">
          {packetRows.map((y, i) => (
            <g
              key={y}
              className="ll-packet ll-packet-in"
              style={{ "--packet-delay": `${i * 0.54}s` } as CSSProperties}
            >
              <circle cx="62" cy={y} r="6" />
              <circle cx="62" cy={y} r="11" className="ll-packet-ring" />
            </g>
          ))}
        </g>
        <g className="ll-wave-packets-out">
          {packetRows.map((y, i) => (
            <g
              key={y}
              className="ll-packet ll-packet-out"
              style={{ "--packet-delay": `${1.12 + i * 0.54}s` } as CSSProperties}
            >
              <circle cx="395" cy={y} r="5" />
              <path d={`M404 ${y}h15`} />
            </g>
          ))}
        </g>
        <g className="ll-packet ll-packet-blocked">
          <circle cx="62" cy="372" r="6" />
          <path d="m56 366 12 12m0-12-12 12" />
        </g>
        <g className="ll-wave-gate">
          <circle cx="358" cy="275" r="53" className="ll-gate-pulse" />
          <rect
            x="322"
            y="239"
            width="72"
            height="72"
            fill="#f5f5f4"
            stroke="#a8a29e"
            strokeWidth=".8"
          />
          <path
            d="m358 254-17 7v13c0 11 8 19 17 23 9-4 17-12 17-23v-13l-17-7Z"
            stroke="#57534e"
            strokeWidth="1.3"
          />
          <path d="m350 274 6 6 11-13" stroke="#57534e" strokeWidth="1.5" />
        </g>
        <g className="ll-wave-decision">
          <rect x="303" y="326" width="110" height="24" rx="12" />
          <circle cx="317" cy="338" r="3" />
          <text x="327" y="342">POLICY CHECK</text>
        </g>
        <g className="ll-wave-blocked-label">
          <rect x="252" y="387" width="130" height="23" rx="3" />
          <text x="266" y="402">1 ACTION HELD</text>
        </g>
        <path
          className="ll-reconcile-path"
          d="M586 356 C620 408 555 443 466 432 C410 425 389 399 377 362"
        />
        <g className="ll-reconcile-packet">
          <circle cx="0" cy="0" r="6" />
          <circle cx="0" cy="0" r="11" className="ll-packet-ring" />
        </g>
        <g className="ll-reconcile-label">
          <rect x="444" y="405" width="178" height="23" rx="3" />
          <text x="456" y="420">RECONCILE BEFORE RETRY</text>
        </g>
        <g className="ll-wave-caption">
          <rect
            x="248"
            y="98"
            width="220"
            height="26"
            rx="13"
            fill="#f5f5f4"
            stroke="#a8a29e"
            strokeWidth=".7"
          />
          <circle cx="265" cy="111" r="2.4" fill="#73745e" />
          <text
            x="366"
            y="115"
            fill="#57534e"
            fontSize="12"
            textAnchor="middle"
          >
            Authority → action → effect
          </text>
          <text
            x="358"
            y="451"
            fill="#57534e"
            textAnchor="middle"
            fontSize="12"
            letterSpacing="2"
          >
            CONTROL + RECOVERY BOUNDARY
          </text>
        </g>
      </svg>
      <button
        className="ll-animation-toggle"
        aria-label={paused ? "Play hero animation" : "Pause hero animation"}
        aria-pressed={paused}
        onClick={() => setPaused(!paused)}
      >
        {paused ? <Play size={12} /> : <Pause size={12} />}
      </button>
    </div>
  );
}

const controls = [
  {
    id: "actions",
    icon: SlidersHorizontal,
    label: "Action controls",
    title: "Decide what agents can do.",
    body: "Set tool permissions and approval rules. Check each proposed action before it changes a company system.",
    href: "/control-plane/policies",
  },
  {
    id: "execution",
    icon: GitBranch,
    label: "Execution controls",
    title: "Keep running work within its limits.",
    body: "Follow each step and handoff. Hold work for approval, stop a run, or suspend an agent and its delegated work.",
    href: "/control-plane/runs",
  },
  {
    id: "outputs",
    icon: FileCheck2,
    label: "Output controls",
    title: "Check what leaves the agent.",
    body: "Inspect the result before it is released. Redact sensitive information or block an output that breaks policy.",
    href: "/control-plane/outputs",
  },
];

function ActionPreview() {
  return (
    <>
      <div className="ll-preview-heading">
        <span className="ll-preview-icon">
          <Bot size={22} />
        </span>
        <div>
          <strong>Revenue agent</strong>
          <span>Proposed action</span>
        </div>
        <span className="ll-status ll-status-hold">Needs approval</span>
      </div>
      <div className="ll-request">
        <span className="ll-micro">SEND CUSTOMER EMAIL</span>
        <p>Offer Acme a 25% renewal discount.</p>
        <div>
          <span>
            Requested discount <b>25%</b>
          </span>
          <span>
            Agent authority <b>10%</b>
          </span>
        </div>
      </div>
      <div className="ll-check-row">
        <Check size={15} />
        <span>Agent identity verified</span>
        <span>Passed</span>
      </div>
      <div className="ll-check-row">
        <Check size={15} />
        <span>Email tool permitted</span>
        <span>Passed</span>
      </div>
      <div className="ll-check-row ll-check-held">
        <CirclePause size={15} />
        <span>Discount exceeds authority</span>
        <span>Held</span>
      </div>
      <div className="ll-preview-note">
        <LockKeyhole size={14} />
        Email stays unsent until a person approves.
      </div>
    </>
  );
}
function ExecutionPreview() {
  return (
    <>
      <div className="ll-preview-heading">
        <span className="ll-preview-icon">
          <GitBranch size={22} />
        </span>
        <div>
          <strong>Acme renewal</strong>
          <span>Three agents · one execution</span>
        </div>
        <span className="ll-status ll-status-hold">On hold</span>
      </div>
      <div className="ll-execution-list">
        <div>
          <span className="ll-step-dot">
            <Check size={13} />
          </span>
          <div>
            <strong>Renewal coordinator</strong>
            <p>Delegated account research</p>
          </div>
          <span>Complete</span>
        </div>
        <div>
          <span className="ll-step-dot">
            <Check size={13} />
          </span>
          <div>
            <strong>Account researcher</strong>
            <p>Read the latest CRM record</p>
          </div>
          <span>Complete</span>
        </div>
        <div>
          <span className="ll-step-dot ll-step-wait">
            <Pause size={12} />
          </span>
          <div>
            <strong>Revenue agent</strong>
            <p>Waiting for discount approval</p>
          </div>
          <span>Held</span>
        </div>
      </div>
      <div className="ll-preview-note">
        <CirclePause size={14} />
        Dependent work waits with the held action.
      </div>
    </>
  );
}
function OutputPreview() {
  return (
    <>
      <div className="ll-preview-heading">
        <span className="ll-preview-icon">
          <FileCheck2 size={22} />
        </span>
        <div>
          <strong>Customer summary</strong>
          <span>Output inspection</span>
        </div>
        <span className="ll-status">Redacted</span>
      </div>
      <div className="ll-output-block">
        <span className="ll-micro">AGENT DRAFT</span>
        <p>
          Contact <mark>alex@example.com</mark> to confirm the renewal date.
        </p>
      </div>
      <div className="ll-output-arrow">
        <ArrowDown size={16} />
        <span>Email address detected</span>
      </div>
      <div className="ll-output-block ll-output-clean">
        <span className="ll-micro">CHECKED OUTPUT</span>
        <p>
          Contact <code>[EMAIL REDACTED]</code> to confirm the renewal date.
        </p>
      </div>
      <div className="ll-preview-note">
        <ShieldCheck size={14} />
        Sensitive content is removed before release.
      </div>
    </>
  );
}

export function ControlExplorer() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function keyboard(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (e.key === "ArrowDown" || e.key === "ArrowRight")
      next = (index + 1) % controls.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft")
      next = (index + controls.length - 1) % controls.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = controls.length - 1;
    else return;
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  }
  const selected = controls[active];
  return (
    <div className="ll-controls-grid">
      <div
        role="tablist"
        aria-label="Agent control layers"
        aria-orientation="vertical"
        className="ll-control-tabs"
      >
        {controls.map((item, i) => (
          <button
            key={item.id}
            ref={(node) => {
              refs.current[i] = node;
            }}
            id={`control-tab-${item.id}`}
            role="tab"
            aria-selected={active === i}
            aria-controls="control-panel"
            tabIndex={active === i ? 0 : -1}
            onKeyDown={(e) => keyboard(e, i)}
            onClick={() => setActive(i)}
            className={`ll-control-tab ${active === i ? "is-active" : ""}`}
          >
            <span className="ll-tab-icon">
              <item.icon size={23} strokeWidth={1.5} />
            </span>
            <span>
              <span className="ll-tab-label">
                0{i + 1} / {item.label}
              </span>
              <strong>{item.title}</strong>
              <span className="ll-tab-body">{item.body}</span>
            </span>
            <ArrowUpRight className="ll-tab-arrow" size={18} />
          </button>
        ))}
      </div>
      <div
        className="ll-control-stage"
        role="tabpanel"
        id="control-panel"
        aria-labelledby={`control-tab-${selected.id}`}
        tabIndex={0}
      >
        <div className="ll-preview-window" key={selected.id}>
          <div className="ll-preview-bar">
            <span>
              <LoopMark />
              LoopLabs
            </span>
            <span>{selected.label}</span>
            <span className="ll-window-dot" />
          </div>
          <div className="ll-preview-body">
            {active === 0 ? (
              <ActionPreview />
            ) : active === 1 ? (
              <ExecutionPreview />
            ) : (
              <OutputPreview />
            )}
          </div>
        </div>
        <div className="ll-stage-footer">
          <span>Illustrative workflow · sample data</span>
          <Link href={selected.href}>
            Explore this control <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}

export function IdentityDiagram() {
  return (
    <div className="ll-identity-diagram">
      <div className="ll-agent-pass">
        <div className="ll-agent-pass-top">
          <Fingerprint size={30} strokeWidth={1.3} />
          <span className="ll-micro">AGENT IDENTITY</span>
          <span className="ll-status">Active</span>
        </div>
        <h3>Revenue agent</h3>
        <p>Owned by the revenue operations team</p>
        <dl>
          <div>
            <dt>Role</dt>
            <dd>Revenue operator</dd>
          </div>
          <div>
            <dt>Tools</dt>
            <dd>CRM read · Email send</dd>
          </div>
          <div>
            <dt>Models</dt>
            <dd>Approved tier only</dd>
          </div>
          <div>
            <dt>Budget</dt>
            <dd>$50 per month</dd>
          </div>
        </dl>
      </div>
      <div className="ll-identity-connection">
        <span />
        <LockKeyhole size={17} />
        <span />
      </div>
      <div className="ll-access-nodes">
        <span>
          <Bot size={17} /> Models
        </span>
        <span>
          <SlidersHorizontal size={17} /> Tools
        </span>
        <span>
          <GitBranch size={17} /> Other agents
        </span>
      </div>
      <span className="ll-diagram-caption">
        Access follows the agent&apos;s assigned permissions.
      </span>
    </div>
  );
}

export function RecoveryDiagram() {
  return (
    <div className="ll-recovery-diagram">
      <div className="ll-recovery-top">
        <span className="ll-status ll-status-hold">Agent isolated</span>
        <span className="ll-micro">CRM / ACCOUNT UPDATE</span>
      </div>
      <div className="ll-recovery-record">
        <span className="ll-micro">UNEXPECTED CHANGE</span>
        <strong>Payment terms changed</strong>
        <div>
          <span>Net 30</span>
          <ArrowRight size={20} />
          <s>Net 90</s>
        </div>
        <span className="ll-record-version">Record version 12</span>
      </div>
      <div className="ll-recovery-connector">
        <Undo2 size={18} />
        <span>Review the recovery plan</span>
      </div>
      <div className="ll-recovery-restored">
        <Check size={18} />
        <div>
          <strong>Restore Net 30</strong>
          <span>Write a new version. Keep the history.</span>
        </div>
        <span className="ll-record-version">v13</span>
      </div>
      <p>Restore only if the record still matches the reviewed version.</p>
    </div>
  );
}
