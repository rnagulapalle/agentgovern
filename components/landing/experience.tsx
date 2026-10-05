"use client";

import Link from "next/link";
import {
  useRef,
  useState,
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
  ShieldCheck,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";
import { ActionFlowAnimation } from "./action-flow";
import { MarketingHeader } from "@/components/marketing/chrome";
import { LoopMark } from "@/components/brand/loop-mark";

export function LandingHeader({ bookingUrl }: { bookingUrl: string }) {
  return <MarketingHeader bookingUrl={bookingUrl} />;
}

export function ControlWave() {
  return <ActionFlowAnimation />;
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
