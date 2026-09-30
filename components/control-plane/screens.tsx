"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Ban,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Code2,
  Database,
  Download,
  FileCheck2,
  Fingerprint,
  GitBranch,
  History,
  KeyRound,
  Layers3,
  LockKeyhole,
  Mail,
  Network,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Terminal,
  Undo2,
  Wallet,
  X,
} from "lucide-react";
import {
  MODELS,
  ROLE_TIERS,
  ROLE_TOOLS,
  ROLES,
  type Agent,
  type Incident,
  type Run,
  type Section,
  type Tier,
} from "@/lib/control-plane/model";
import { useControl } from "./provider";
import {
  Avatar,
  BrandMark,
  Empty,
  exportJson,
  Modal,
  money,
  PageTitle,
  PanelHead,
  SignalArt,
  Status,
  timeAgo,
} from "./ui";

type Inspect =
  | {
      kind: "agent" | "run" | "approval" | "policy" | "incident" | "budget";
      id: string;
    }
  | { kind: "onboard" | "simulate" | "reset" }
  | null;
type Open = (value: Inspect) => void;
export function ControlScreen({
  section,
  initialInspect,
}: {
  section: Section;
  initialInspect?: string;
}) {
  const { state, ready } = useControl();
  const [inspect, setInspect] = useState<Inspect>(null);
  useEffect(() => {
    if (initialInspect && (section === "agents" || section === "runs"))
      setInspect({
        kind: section === "agents" ? "agent" : "run",
        id: initialInspect,
      });
  }, [initialInspect, section]);
  if (!ready)
    return (
      <div className="cp-loading" role="status">
        <BrandMark />
        <span>Opening your workspace…</span>
      </div>
    );
  return (
    <>
      {section === "overview" && <Overview open={setInspect} />}
      {section === "agents" && <Agents open={setInspect} />}
      {section === "runs" && <Runs open={setInspect} />}
      {section === "policies" && <Policies open={setInspect} />}
      {section === "approvals" && <Approvals open={setInspect} />}
      {section === "gateway" && <Gateway open={setInspect} />}
      {section === "outputs" && <Outputs />}
      {section === "reconciliation" && <Reconciliation />}
      {section === "audit" && <Audit open={setInspect} />}
      {section === "settings" && <Settings open={setInspect} />}
      {inspect?.kind === "onboard" && (
        <Onboard onClose={() => setInspect(null)} />
      )}
      {inspect?.kind === "simulate" && (
        <Simulate onClose={() => setInspect(null)} />
      )}
      {inspect?.kind === "agent" && (
        <AgentDetail
          agentId={inspect.id}
          open={setInspect}
          onClose={() => setInspect(null)}
        />
      )}
      {inspect?.kind === "run" && (
        <RunDetail
          runId={inspect.id}
          open={setInspect}
          onClose={() => setInspect(null)}
        />
      )}
      {inspect?.kind === "approval" && (
        <ApprovalDetail
          approvalId={inspect.id}
          onClose={() => setInspect(null)}
        />
      )}
      {inspect?.kind === "policy" && (
        <PolicyDetail policyId={inspect.id} onClose={() => setInspect(null)} />
      )}
      {inspect?.kind === "incident" && (
        <Modal
          title="Review and restore affected state"
          subtitle="Contain first. Preview the change. Restore only if the record is unchanged."
          wide
          onClose={() => setInspect(null)}
        >
          <Recovery
            incident={state.incidents.find((i) => i.id === inspect.id)!}
          />
        </Modal>
      )}
      {inspect?.kind === "budget" && (
        <Budget agentId={inspect.id} onClose={() => setInspect(null)} />
      )}
      {inspect?.kind === "reset" && <Reset onClose={() => setInspect(null)} />}
    </>
  );
}

function Overview({ open }: { open: Open }) {
  const { state } = useControl();
  const pending = state.approvals.filter((a) => a.status === "pending");
  const incidents = state.incidents.filter((i) => i.status !== "resolved");
  const active = state.agents.filter((a) => a.status === "active").length;
  const spend = state.agents.reduce((n, a) => n + a.spent, 0);
  return (
    <>
      <div className="cp-overview-heading">
        <div>
          <div className="cp-eyebrow">
            <span className="cp-tiny-cross">✳</span> YOUR AGENT CONTROL PLANE
          </div>
          <h1>Agent control overview</h1>
          <p>Review agents, running work, approvals, and recovery.</p>
        </div>
        <button
          className="cp-button cp-button-dark"
          onClick={() => open({ kind: "onboard" })}
        >
          <Plus size={16} />
          Onboard agent
        </button>
      </div>
      <div className="cp-welcome">
        <div>
          <span className="cp-eyebrow">ONE WORKSPACE. COMPLETE CONTROL.</span>
          <h2>
            Let agents do the work.
            <br />
            <span>You set the boundaries.</span>
          </h2>
          <p>
            Identity, model access, execution, and output protection.
            <br className="cp-desktop-only" /> Connected from the first request
            to the final result.
          </p>
          <button
            className="cp-text-button"
            onClick={() => open({ kind: "simulate" })}
          >
            See governance in action <ArrowUpRight size={16} />
          </button>
        </div>
        <SignalArt />
      </div>
      <div className="cp-stats">
        {[
          {
            label: "Registered agents",
            value: String(state.agents.length).padStart(2, "0"),
            note: `${active} active · ${state.agents.length - active} paused`,
            icon: Bot,
            route: "agents",
            bars: [3, 5, 4, 7, 8, 7, 10, 12, 10, 14, 13, 17],
          },
          {
            label: "Governed executions",
            value: String(state.runs.length).padStart(2, "0"),
            note: "Identity → action → output",
            icon: GitBranch,
            route: "runs",
            bars: [8, 13, 6, 10, 5, 16, 9, 12, 15, 8, 18, 14],
          },
          {
            label: "Needs your approval",
            value: String(pending.length).padStart(2, "0"),
            note: pending.length
              ? "Held before execution"
              : "Your queue is clear",
            icon: ShieldCheck,
            route: "approvals",
            bars: [2, 3, 2, 3, 2, 9, 3, 2, 4, 2, 6, 3],
          },
          {
            label: "Model spend",
            value: money(spend),
            note: `of ${money(state.agents.reduce((n, a) => n + a.budget, 0))} allocated`,
            icon: Wallet,
            route: "gateway",
            bars: [4, 6, 6, 9, 8, 11, 9, 14, 12, 15, 14, 19],
          },
        ].map((s) => (
          <Link
            className="cp-stat"
            href={`/control-plane/${s.route}`}
            key={s.label}
          >
            <div>
              <span>{s.label}</span>
              <s.icon size={16} />
            </div>
            <strong>{s.value}</strong>
            <div className="cp-stat-bottom">
              <small>{s.note}</small>
              <span className="cp-sparkbars" aria-hidden>
                {s.bars.map((h, i) => (
                  <i key={i} style={{ height: h }} />
                ))}
              </span>
            </div>
          </Link>
        ))}
      </div>
      <section className="cp-panel cp-orchestration">
        <PanelHead
          title="A boundary at every step"
          sub="How your multi-agent workforce stays governed"
          action={
            <button
              className="cp-button cp-button-small"
              onClick={() => open({ kind: "simulate" })}
            >
              <Play size={12} />
              Simulate a run
            </button>
          }
        />
        <ControlGraph />
        <div className="cp-graph-footer">
          <span>
            <span className="cp-live-dot" />7 controls across the execution
            lifecycle
          </span>
          <span>
            <LockKeyhole size={12} />
            Default deny · scoped delegation
          </span>
          <span className="cp-mono">DEMO TOPOLOGY</span>
        </div>
      </section>
      <div className="cp-overview-bottom">
        <section className="cp-panel">
          <PanelHead
            title="Recent executions"
            sub="The work, and the decisions behind it"
            action={
              <Link className="cp-text-button" href="/control-plane/runs">
                View all <ArrowUpRight size={14} />
              </Link>
            }
          />
          <RunTable runs={state.runs.slice(0, 4)} open={open} compact />
        </section>
        <section className="cp-panel cp-attention">
          <PanelHead
            title="Needs your review"
            action={
              <span className="cp-small-counter">
                {pending.length + incidents.length}
              </span>
            }
          />
          {pending.slice(0, 1).map((a) => (
            <button
              className="cp-attention-item"
              key={a.id}
              onClick={() => open({ kind: "approval", id: a.id })}
            >
              <span className="cp-attention-icon amber">
                <ShieldCheck size={18} />
              </span>
              <span>
                <span className="cp-eyebrow">APPROVAL REQUIRED</span>
                <strong>{a.title}</strong>
                <small>
                  {a.amount}% requested · {a.limit}% authority
                </small>
              </span>
              <ArrowUpRight size={15} />
            </button>
          ))}
          {incidents.slice(0, 1).map((i) => (
            <button
              className="cp-attention-item"
              key={i.id}
              onClick={() => open({ kind: "incident", id: i.id })}
            >
              <span className="cp-attention-icon rust">
                <Undo2 size={18} />
              </span>
              <span>
                <span className="cp-eyebrow">STATE RECOVERY</span>
                <strong>Review an unexpected record change</strong>
                <small>Northstar CRM · drift detected</small>
              </span>
              <ArrowUpRight size={15} />
            </button>
          ))}
          {!pending.length && !incidents.length && (
            <Empty
              title="All caught up"
              text="No pending approvals or state drift."
            />
          )}
          <div className="cp-attention-note">
            <Shield size={15} />
            <p>
              Agents keep moving.
              <br />
              Risky actions wait for you.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

function ControlGraph() {
  return (
    <div className="cp-graph-scroll">
      <div className="cp-control-graph">
        <div className="cp-graph-node cp-graph-root">
          <div className="cp-graph-node-icon">
            <Bot size={23} strokeWidth={1.4} />
          </div>
          <strong>Renewal coordinator</strong>
          <span>Owner · Raj Nagulapalle</span>
          <small>
            <Fingerprint size={11} /> VERIFIED IDENTITY
          </small>
        </div>
        <div className="cp-graph-fork">
          <i />
          <i />
          <i />
        </div>
        <div className="cp-graph-workers">
          <div>
            <span className="cp-worker-icon sage">
              <Search size={15} />
            </span>
            <span>
              <strong>Account researcher</strong>
              <small>Read-only scope</small>
            </span>
            <Check size={12} />
          </div>
          <div>
            <span className="cp-worker-icon lavender">
              <SlidersHorizontal size={15} />
            </span>
            <span>
              <strong>Revenue operator</strong>
              <small>Scoped write access</small>
            </span>
            <Check size={12} />
          </div>
          <div className="cp-delegation-label">
            <GitBranch size={12} />
            Permissions travel with the work
          </div>
        </div>
        <div className="cp-graph-arrow">
          <span>PROPOSE</span>
          <ArrowRight size={22} strokeWidth={1} />
        </div>
        <div className="cp-graph-gate">
          <ShieldCheck size={23} strokeWidth={1.4} />
          <strong>Policy boundary</strong>
          <span>Allow · hold · block</span>
          <div>
            <span>Identity</span>
            <span>Action</span>
            <span>Output</span>
          </div>
        </div>
        <div className="cp-graph-arrow">
          <span>ENFORCE</span>
          <ArrowRight size={22} strokeWidth={1} />
        </div>
        <div className="cp-graph-destinations">
          <div>
            <Database size={17} />
            <span>Company systems</span>
          </div>
          <div>
            <Mail size={17} />
            <span>Approved outputs</span>
          </div>
          <small>
            <FileCheck2 size={12} />
            EVERY OUTCOME RECORDED
          </small>
        </div>
      </div>
    </div>
  );
}

function SearchFilter({
  query,
  setQuery,
  placeholder,
  children,
}: {
  query: string;
  setQuery: (q: string) => void;
  placeholder: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="cp-table-toolbar">
      <div className="cp-filter-input">
        <Search size={15} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      </div>
      {children}
    </div>
  );
}

function Agents({ open }: { open: Open }) {
  const { state } = useControl();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const agents = state.agents.filter(
    (a) =>
      `${a.name} ${a.owner} ${a.team} ${a.id}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "all" || a.status === filter),
  );
  return (
    <>
      <PageTitle
        eyebrow="IDENTITY & ACCESS"
        title="An identity for every agent."
        description="Give agents the same accountability as the people they work alongside."
        action={
          <button
            className="cp-button cp-button-dark"
            onClick={() => open({ kind: "onboard" })}
          >
            <Plus size={15} />
            Onboard agent
          </button>
        }
      />
      <div className="cp-inline-metrics">
        <span>
          <strong>{state.agents.length}</strong> registered agents
        </span>
        <span>
          <i className="cp-live-dot" />
          <strong>
            {state.agents.filter((a) => a.status === "active").length}
          </strong>{" "}
          active
        </span>
        <span>
          <Fingerprint size={15} />
          Every agent has an accountable owner
        </span>
      </div>
      <section className="cp-panel">
        <SearchFilter
          query={query}
          setQuery={setQuery}
          placeholder="Search agents, owners, or teams…"
        >
          <select
            aria-label="Filter agent status"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
          <span className="cp-table-count">{agents.length} agents</span>
        </SearchFilter>
        <div className="cp-table-scroll">
          <table className="cp-table cp-agent-table">
            <thead>
              <tr>
                <th>AGENT</th>
                <th>OWNER / TEAM</th>
                <th>ROLE</th>
                <th>MODEL ACCESS</th>
                <th>STATUS</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id}>
                  <td>
                    <button
                      className="cp-entity"
                      onClick={() => open({ kind: "agent", id: a.id })}
                    >
                      <Avatar agent={a} />
                      <span>
                        <strong>{a.name}</strong>
                        <small className="cp-mono">
                          {a.id}
                          {a.parentId && " · delegated"}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <strong className="cp-cell-primary">{a.owner}</strong>
                    <small className="cp-cell-secondary">{a.team}</small>
                  </td>
                  <td>
                    <span className="cp-role-chip">{a.role}</span>
                  </td>
                  <td>
                    <span className="cp-model-cell">
                      <Layers3 size={14} />
                      {a.tier}
                    </span>
                  </td>
                  <td>
                    <Status value={a.status} />
                  </td>
                  <td>
                    <button
                      className="cp-icon-button"
                      aria-label={`View ${a.name}`}
                      onClick={() => open({ kind: "agent", id: a.id })}
                    >
                      <ArrowUpRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!agents.length && (
          <Empty
            title="No agents found"
            text="Try a different search or onboard your first agent."
          />
        )}
      </section>
      <div className="cp-note">
        <GitBranch size={17} />
        <p>
          <strong>Delegation doesn’t mean more permission.</strong> Child agents
          receive an explicit subset of their parent’s access. Pausing a parent
          also suspends its descendants.
        </p>
      </div>
    </>
  );
}

function Runs({ open }: { open: Open }) {
  const { state } = useControl();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const runs = state.runs.filter(
    (r) =>
      `${r.id} ${r.name}`.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "all" || r.status === filter),
  );
  return (
    <>
      <PageTitle
        eyebrow="WHILE WORK RUNS"
        title="Execution controls"
        description="Follow agent handoffs, policy decisions, and outcomes in one execution trace."
        action={
          <button
            className="cp-button cp-button-dark"
            onClick={() => open({ kind: "simulate" })}
          >
            <Play size={14} />
            Simulate a run
          </button>
        }
      />
      <section className="cp-panel">
        <SearchFilter
          query={query}
          setQuery={setQuery}
          placeholder="Search executions or run IDs…"
        >
          <select
            aria-label="Filter run status"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All outcomes</option>
            <option value="completed">Completed</option>
            <option value="awaiting_approval">Needs approval</option>
            <option value="contained">Contained</option>
            <option value="terminated">Terminated</option>
            <option value="blocked">Blocked</option>
          </select>
        </SearchFilter>
        <RunTable runs={runs} open={open} />
        {!runs.length && (
          <Empty
            title="No matching executions"
            text="Try another filter, or simulate a new run."
          />
        )}
      </section>
      <div className="cp-note">
        <Square size={15} />
        <p>
          Terminating a run invalidates its pending approvals. Completed
          external effects require a separate, verified recovery operation.
        </p>
      </div>
    </>
  );
}
function RunTable({
  runs,
  open,
  compact = false,
}: {
  runs: Run[];
  open: Open;
  compact?: boolean;
}) {
  const { state } = useControl();
  return (
    <div className="cp-table-scroll">
      <table className={`cp-table cp-run-table ${compact ? "is-compact" : ""}`}>
        <thead>
          <tr>
            <th>EXECUTION</th>
            {!compact && <th>AGENTS</th>}
            <th>OUTCOME</th>
            <th>{compact ? "STARTED" : "MODEL COST"}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td>
                <button
                  className="cp-entity"
                  onClick={() => open({ kind: "run", id: r.id })}
                >
                  <span className="cp-run-icon">
                    <GitBranch size={16} />
                  </span>
                  <span>
                    <strong>{r.name}</strong>
                    <small>
                      {compact
                        ? `${r.agentIds.length} agent${r.agentIds.length > 1 ? "s" : ""} · ${r.steps.length} steps`
                        : r.id}
                    </small>
                  </span>
                </button>
              </td>
              {!compact && (
                <td>
                  <div className="cp-avatar-stack">
                    {r.agentIds.map((id) => {
                      const a = state.agents.find((a) => a.id === id);
                      return a ? <Avatar key={id} agent={a} small /> : null;
                    })}
                    <small>{r.agentIds.length} assigned</small>
                  </div>
                </td>
              )}
              <td>
                <Status value={r.status} />
              </td>
              <td className="cp-subtle cp-nowrap">
                {compact ? timeAgo(r.at) : `$${r.cost.toFixed(3)}`}
              </td>
              <td>
                <button
                  className="cp-icon-button"
                  onClick={() => open({ kind: "run", id: r.id })}
                  aria-label={`Inspect ${r.name}`}
                >
                  <ChevronRight size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Policies({ open }: { open: Open }) {
  const { state } = useControl();
  const [stage, setStage] = useState("All policies");
  const list = state.policies.filter(
    (p) => stage === "All policies" || p.stage === stage,
  );
  return (
    <>
      <PageTitle
        eyebrow="BEFORE AN ACTION RUNS"
        title="Action controls"
        description="Deterministic controls that live outside the agent’s reasoning."
      />
      <div className="cp-tabs" role="tablist" aria-label="Policy stage">
        {["All policies", "Identity", "Action", "Execution", "Output"].map(
          (s) => (
            <button
              key={s}
              role="tab"
              aria-selected={stage === s}
              className={stage === s ? "is-active" : ""}
              onClick={() => setStage(s)}
            >
              {s}
              {s === "All policies" && <span>{state.policies.length}</span>}
            </button>
          ),
        )}
      </div>
      <div className="cp-policy-grid">
        {list.map((p) => (
          <button
            className="cp-policy-card"
            key={p.id}
            onClick={() => open({ kind: "policy", id: p.id })}
          >
            <div>
              <span className="cp-policy-icon">
                {p.stage === "Identity" ? (
                  <Fingerprint size={21} />
                ) : p.stage === "Output" ? (
                  <FileCheck2 size={21} />
                ) : p.stage === "Execution" ? (
                  <GitBranch size={21} />
                ) : (
                  <ShieldCheck size={21} />
                )}
              </span>
              <Status value="active" label="Enforced" />
            </div>
            <span className="cp-eyebrow">{p.stage} BOUNDARY</span>
            <h2>{p.name}</h2>
            <p>{p.description}</p>
            <footer>
              <span className="cp-mono">
                {p.threshold !== undefined
                  ? `${p.threshold}${p.unit === "%" ? "%" : ` ${p.unit}`} threshold`
                  : "Always enforced"}
              </span>
              <span>
                v{p.version}
                <ArrowUpRight size={15} />
              </span>
            </footer>
          </button>
        ))}
      </div>
      <div className="cp-note">
        <LockKeyhole size={17} />
        <p>
          Changing a threshold creates a new policy version and invalidates
          pending approvals. The original proposal must be evaluated again.
        </p>
      </div>
    </>
  );
}

function Approvals({ open }: { open: Open }) {
  const { state } = useControl();
  const [tab, setTab] = useState("pending");
  const approvals = state.approvals.filter((a) =>
    tab === "pending" ? a.status === "pending" : a.status !== "pending",
  );
  return (
    <>
      <PageTitle
        eyebrow="HUMAN OVERSIGHT"
        title="Actions waiting for approval"
        description="Review what an agent intends to do before it reaches your company’s systems."
      />
      <div className="cp-tabs" role="tablist" aria-label="Approval queue">
        <button
          role="tab"
          aria-selected={tab === "pending"}
          className={tab === "pending" ? "is-active" : ""}
          onClick={() => setTab("pending")}
        >
          Needs review
          <span>
            {state.approvals.filter((a) => a.status === "pending").length}
          </span>
        </button>
        <button
          role="tab"
          aria-selected={tab === "history"}
          className={tab === "history" ? "is-active" : ""}
          onClick={() => setTab("history")}
        >
          Decision history
        </button>
      </div>
      <div className="cp-approval-list">
        {approvals.map((a) => {
          const agent = state.agents.find((x) => x.id === a.agentId)!;
          return (
            <section className="cp-panel cp-approval-item" key={a.id}>
              <div className="cp-approval-heading">
                <div className="cp-entity">
                  <Avatar agent={agent} />
                  <span>
                    <strong>{agent.name}</strong>
                    <small>
                      Owned by {agent.owner} · {timeAgo(a.at)}
                    </small>
                  </span>
                </div>
                <Status value={a.status} />
              </div>
              <div className="cp-approval-main">
                <div>
                  <span className="cp-eyebrow">
                    DISCOUNT AUTHORITY · V{a.policyVersion}
                  </span>
                  <h2>{a.title}</h2>
                  <p>
                    The agent proposed a <strong>{a.amount}% discount</strong>{" "}
                    for {a.target}. Its delegated authority is {a.limit}%.
                  </p>
                  <span className="cp-proposal-target">
                    <Mail size={14} />
                    Email · send
                    <ChevronRight size={13} />
                    {a.target}
                  </span>
                </div>
                <div className="cp-proposal-numbers">
                  <div>
                    <strong>
                      {a.amount}
                      <small>%</small>
                    </strong>
                    <span>Requested</span>
                  </div>
                  <div>
                    <strong>
                      {a.limit}
                      <small>%</small>
                    </strong>
                    <span>Allowed</span>
                  </div>
                </div>
              </div>
              <footer>
                <span>
                  <LockKeyhole size={13} />
                  {a.status === "pending"
                    ? "Execution is held. No email has been sent."
                    : `Decision recorded · ${a.runId}`}
                </span>
                <button
                  className="cp-button cp-button-dark cp-button-small"
                  onClick={() => open({ kind: "approval", id: a.id })}
                >
                  {a.status === "pending" ? "Review proposal" : "View decision"}
                  <ArrowRight size={14} />
                </button>
              </footer>
            </section>
          );
        })}
        {!approvals.length && (
          <section className="cp-panel">
            <Empty
              title={
                tab === "pending"
                  ? "Nothing waiting on you."
                  : "No decisions yet."
              }
              text={
                tab === "pending"
                  ? "Actions within policy keep moving. Anything that needs your judgment will appear here."
                  : "Approved, rejected, and invalidated proposals will be recorded here."
              }
            />
          </section>
        )}
      </div>
    </>
  );
}

function Gateway({ open }: { open: Open }) {
  const { state } = useControl();
  const spend = state.agents.reduce((n, a) => n + a.spent, 0);
  const budget = state.agents.reduce((n, a) => n + a.budget, 0);
  return (
    <>
      <PageTitle
        eyebrow="CENTRAL MODEL ACCESS"
        title="Model access and budgets"
        description="Identity, entitlements, and budgets travel with every agent request."
        action={
          <span className="cp-outline-label">
            <Terminal size={14} />
            Gateway simulation
          </span>
        }
      />
      <div className="cp-gateway-banner">
        <div className="cp-gateway-symbol">
          <Network size={31} strokeWidth={1} />
        </div>
        <div>
          <h2>One identity. Scoped access.</h2>
          <p>
            Registered agent <ArrowRight size={12} /> Role & model policy{" "}
            <ArrowRight size={12} /> Budget check <ArrowRight size={12} /> Model
          </p>
        </div>
        <Link className="cp-text-button" href="/control-plane/settings">
          Connection settings
          <ArrowUpRight size={14} />
        </Link>
      </div>
      <div className="cp-model-grid">
        {MODELS.map((m, i) => (
          <section className="cp-model-card" key={m.id}>
            <div className="cp-model-card-top">
              <span className="cp-model-number">0{i + 1}</span>
              <span className="cp-outline-label">{m.id}</span>
            </div>
            <div className="cp-provider-mark">
              {i === 0 ? (
                <span className="cp-amazon">
                  a<span>⌣</span>
                </span>
              ) : i === 1 ? (
                <span className="cp-meta">∞</span>
              ) : (
                <span className="cp-mistral">M</span>
              )}
            </div>
            <h2>{m.model}</h2>
            <p>
              {m.provider} · {m.region}
            </p>
            <div className="cp-model-roles">
              {m.allowedRoles.map((r) => (
                <span key={r}>{r}</span>
              ))}
            </div>
            <footer>
              <span>
                {state.agents.filter((a) => a.tier === m.id).length} assigned
                agents
              </span>
              <span>
                Configured tier <Check size={12} />
              </span>
            </footer>
          </section>
        ))}
      </div>
      <section className="cp-panel cp-budget-panel">
        <PanelHead
          title="Agent budgets"
          sub="Per-agent ceilings · shared identity across requests"
          action={
            <span className="cp-budget-total">
              {money(spend)} <small>/ {money(budget)} allocated</small>
            </span>
          }
        />
        <div className="cp-table-scroll">
          <table className="cp-table">
            <thead>
              <tr>
                <th>AGENT</th>
                <th>MODEL TIER</th>
                <th>BUDGET USAGE</th>
                <th>REMAINING</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.agents.map((a) => (
                <tr key={a.id}>
                  <td>
                    <button
                      className="cp-entity"
                      onClick={() => open({ kind: "agent", id: a.id })}
                    >
                      <Avatar agent={a} small />
                      <strong>{a.name}</strong>
                    </button>
                  </td>
                  <td>{a.tier}</td>
                  <td>
                    <div className="cp-budget-usage">
                      <span>
                        {money(a.spent)} <small>/ {money(a.budget)}</small>
                      </span>
                      <div>
                        <i
                          style={{
                            width: `${Math.min(100, (a.spent / a.budget) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </td>
                  <td>{money(Math.max(0, a.budget - a.spent))}</td>
                  <td>
                    <button
                      className="cp-text-button"
                      onClick={() => open({ kind: "budget", id: a.id })}
                    >
                      Edit limit
                      <ArrowUpRight size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="cp-note">
        <Code2 size={17} />
        <p>
          This screen brings the Python gateway’s identity, model-tier, and
          budget concepts into the shared workspace. No live gateway requests
          are made from this product tour.
        </p>
      </div>
    </>
  );
}

function Outputs() {
  const { state, send, notify } = useControl();
  const [text, setText] = useState(
    "Your renewal is ready. Contact alex@example.com for next steps.",
  );
  return (
    <>
      <PageTitle
        eyebrow="BEFORE A RESULT IS RELEASED"
        title="Output controls"
        description="Inspect what agents release, catch sensitive patterns, and keep a record of the decision."
      />
      <div className="cp-output-layout">
        <section className="cp-panel">
          <PanelHead
            title="Check an output"
            sub="Local pattern checks on synthetic sample text"
          />
          <div className="cp-output-playground">
            <label htmlFor="output-sample">Proposed agent output</label>
            <textarea
              id="output-sample"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              maxLength={10000}
            />
            <div className="cp-preset-row">
              <span>Try a sample:</span>
              <button
                onClick={() =>
                  setText(
                    "Your renewal is ready. Contact alex@example.com for next steps.",
                  )
                }
              >
                Email address
              </button>
              <button
                onClick={() =>
                  setText("The test record includes SSN 123-45-6789.")
                }
              >
                Sensitive identifier
              </button>
              <button
                onClick={() =>
                  setText(
                    "Your onboarding checklist is ready in the approved knowledge base.",
                  )
                }
              >
                Clean output
              </button>
            </div>
            <button
              className="cp-button cp-button-dark"
              disabled={!text.trim()}
              onClick={() => {
                send({ type: "output", text, agentId: "agt_004" });
                notify("Output checked. Review the release decision below.");
                setText("");
              }}
            >
              <ShieldCheck size={15} />
              Evaluate output
            </button>
            <p className="cp-fineprint">
              This demo checks email and SSN-shaped patterns only. It is not
              a comprehensive DLP or semantic safety detector. Sensitive input
              is not saved.
            </p>
          </div>
        </section>
        <section className="cp-output-principles">
          <span className="cp-eyebrow">A RELEASE DECISION, EVERY TIME</span>
          {[
            [
              CheckCircle2,
              "Pass",
              "Release output when configured checks pass.",
            ],
            [
              FileCheck2,
              "Redact",
              "Remove email addresses, then release the sanitized result.",
            ],
            [
              Ban,
              "Block",
              "Withhold the entire output when a sensitive identifier is detected.",
            ],
          ].map(([Icon, title, detail]) => {
            const I = Icon as typeof CheckCircle2;
            return (
              <div key={String(title)}>
                <I size={18} />
                <section>
                  <h3>{String(title)}</h3>
                  <p>{String(detail)}</p>
                </section>
              </div>
            );
          })}
        </section>
      </div>
      <section className="cp-panel cp-output-history">
        <PanelHead
          title="Recent output decisions"
          action={
            <span className="cp-table-count">
              {state.outputs.length} checked outputs
            </span>
          }
        />
        {state.outputs.map((o) => (
          <article key={o.id} className="cp-output-row">
            <div>
              <span className="cp-run-icon">
                <FileCheck2 size={17} />
              </span>
              <span>
                <strong>{o.target}</strong>
                <small>
                  {state.agents.find((a) => a.id === o.agentId)?.name} ·{" "}
                  {o.runId}
                </small>
              </span>
              <Status value={o.status} />
            </div>
            <pre>
              {o.released ||
                "[Output withheld — sensitive identifier detected]"}
            </pre>
            <p>
              <Check size={12} />
              {o.checks.join(" · ")}
            </p>
          </article>
        ))}
      </section>
    </>
  );
}

function Reconciliation() {
  const { state } = useControl();
  return (
    <>
      <PageTitle
        eyebrow="STATE RECOVERY"
        title="Review and restore affected records"
        description="Stop the agent, review what changed, and restore permitted fields if the record still matches the reviewed version."
      />
      <div className="cp-recovery-steps">
        {[
          "Detect drift",
          "Isolate agent",
          "Preview recovery",
          "Verify & restore",
        ].map((s, i) => (
          <div key={s}>
            <span>0{i + 1}</span>
            {s}
            {i < 3 && <ArrowRight size={16} />}
          </div>
        ))}
      </div>
      {state.incidents.map((i) => (
        <section className="cp-panel cp-recovery-panel" key={i.id}>
          <PanelHead
            title={i.title}
            sub={`${i.recordId} · ${i.runId}`}
            action={<Status value={i.status} />}
          />
          <Recovery incident={i} />
        </section>
      ))}
      <div className="cp-note">
        <ShieldAlert size={17} />
        <p>
          <strong>Recovery is a verified compensating action.</strong> Restoring
          a record creates a new version; it does not erase history.
          Irreversible actions and records changed by another actor require
          manual review.
        </p>
      </div>
    </>
  );
}

function Recovery({ incident }: { incident: Incident }) {
  const { state, send, notify } = useControl();
  if (!incident) return null;
  const current = state.records[incident.recordId];
  const resolved = incident.status === "resolved";
  return (
    <div className="cp-recovery-content">
      <div className="cp-recovery-description">
        <span className="cp-attention-icon rust">
          <Undo2 size={20} />
        </span>
        <p>
          {resolved
            ? "The approved field values have been restored in a new record version. The original execution remains stopped, and the agent stays paused for review."
            : "The observed CRM record differs from the approved plan. The run is contained. Isolate the agent before preparing a recovery operation."}
        </p>
      </div>
      <div className="cp-table-scroll">
        <table className="cp-table cp-diff-table">
          <thead>
            <tr>
              <th>FIELD</th>
              <th>APPROVED STATE</th>
              <th>{resolved ? "RESTORED STATE" : "CURRENT STATE"}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Discount</td>
              <td>{incident.expected.discount}%</td>
              <td className={resolved ? "cp-green-text" : "cp-rust-text"}>
                {current.discount}%
              </td>
              <td>
                {resolved ? (
                  <Check size={15} />
                ) : (
                  <span className="cp-diff-chip">Changed</span>
                )}
              </td>
            </tr>
            <tr>
              <td>Account stage</td>
              <td>{incident.expected.stage}</td>
              <td className={resolved ? "cp-green-text" : "cp-rust-text"}>
                {current.stage}
              </td>
              <td>
                {resolved ? (
                  <Check size={15} />
                ) : (
                  <span className="cp-diff-chip">Changed</span>
                )}
              </td>
            </tr>
            <tr>
              <td>Record version</td>
              <td>v{incident.expected.version}</td>
              <td>v{current.version}</td>
              <td>
                <span className="cp-subtle">
                  {resolved ? "New version" : "Compared before restore"}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {incident.status === "planned" && (
        <div className="cp-recovery-plan">
          <div>
            <Code2 size={15} />
            <strong>Recovery plan</strong>
            <span className="cp-outline-label">Dry run</span>
          </div>
          <pre>{`IF current.version == ${incident.observed.version}\nAND current fields match the observed snapshot\nTHEN restore discount = ${incident.expected.discount}, stage = "${incident.expected.stage}"\nAND increment version to ${incident.observed.version + 1}\nELSE stop for manual review`}</pre>
          <p>No state has been changed by this preview.</p>
        </div>
      )}
      {incident.status === "conflict" && (
        <div className="cp-warning">
          <ShieldAlert size={17} />
          The current record no longer matches the observed snapshot. Recovery
          stopped; manual investigation is required.
        </div>
      )}
      <div className="cp-recovery-footer">
        <span>
          <LockKeyhole size={14} />
          {resolved
            ? "State verified. Agent remains paused for review."
            : "Version-checked recovery · demo record only"}
        </span>
        {incident.status === "open" && (
          <button
            className="cp-button cp-button-dark"
            onClick={() => {
              send({ type: "contain", incidentId: incident.id });
              notify(
                "Agent isolated. Pending executions and approvals stopped.",
              );
            }}
          >
            <Pause size={14} />
            Isolate agent
          </button>
        )}
        {incident.status === "contained" && (
          <button
            className="cp-button cp-button-dark"
            onClick={() => send({ type: "plan", incidentId: incident.id })}
          >
            <Code2 size={15} />
            Preview recovery plan
          </button>
        )}
        {incident.status === "planned" && (
          <button
            className="cp-button cp-button-dark"
            onClick={() => {
              send({ type: "reconcile", incidentId: incident.id });
              notify(
                "Recovery evaluated. Review the resulting state and audit event.",
              );
            }}
          >
            <Undo2 size={15} />
            Verify & restore state
          </button>
        )}
        {resolved && <Status value="resolved" />}
      </div>
    </div>
  );
}

function Audit({ open }: { open: Open }) {
  const { state } = useControl();
  const [query, setQuery] = useState("");
  const rows = state.audit.filter((a) =>
    `${a.actor} ${a.action} ${a.target} ${a.runId || ""} ${a.outcome}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <PageTitle
        eyebrow="EVIDENCE & ACCOUNTABILITY"
        title="Every decision has a history."
        description="A shared trail across identity, model access, agent actions, and recovery."
        action={
          <button
            className="cp-button"
            onClick={() =>
              exportJson("looplabs-demo-audit.json", {
                environment: "demo",
                exportedAt: new Date().toISOString(),
                events: rows,
              })
            }
          >
            <Download size={15} />
            Export audit trail
          </button>
        }
      />
      <section className="cp-panel">
        <SearchFilter
          query={query}
          setQuery={setQuery}
          placeholder="Search actors, decisions, or run IDs…"
        >
          <span className="cp-table-count">{rows.length} events</span>
        </SearchFilter>
        <div className="cp-table-scroll">
          <table className="cp-table cp-audit-table">
            <thead>
              <tr>
                <th>TIME</th>
                <th>ACTOR</th>
                <th>DECISION / TARGET</th>
                <th>OUTCOME</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="cp-mono cp-nowrap">
                    {new Date(a.at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                    <small className="cp-cell-secondary">
                      {new Date(a.at).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                      })}
                    </small>
                  </td>
                  <td>{a.actor}</td>
                  <td>
                    <strong className="cp-cell-primary">{a.action}</strong>
                    <small className="cp-cell-secondary">{a.target}</small>
                  </td>
                  <td>
                    <Status value={a.outcome} />
                  </td>
                  <td>
                    {a.runId && (
                      <button
                        className="cp-icon-button"
                        aria-label={`Inspect ${a.runId}`}
                        onClick={() => open({ kind: "run", id: a.runId! })}
                      >
                        <ArrowUpRight size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <Empty
            title="No matching events"
            text="Try another actor, decision, or execution ID."
          />
        )}
      </section>
      <div className="cp-note">
        <History size={17} />
        <p>
          Demo events are persisted in this browser. Production requires a
          server-side append-only audit store and cryptographically verifiable
          receipts.
        </p>
      </div>
    </>
  );
}

function Settings({ open }: { open: Open }) {
  return (
    <>
      <PageTitle
        eyebrow="WORKSPACE SETTINGS"
        title="Workspace settings"
        description="Workspace identity, integration status, and the path from demo to production."
      />
      <section className="cp-panel cp-settings-panel">
        <PanelHead title="Workspace" />
        <dl className="cp-detail-list">
          <div>
            <dt>Organization</dt>
            <dd>Meridian workspace</dd>
          </div>
          <div>
            <dt>Product</dt>
            <dd>LoopLabs</dd>
          </div>
          <div>
            <dt>Environment</dt>
            <dd>
              <span className="cp-outline-label">Interactive demo</span>
            </dd>
          </div>
          <div>
            <dt>Data persistence</dt>
            <dd>This browser · localStorage</dd>
          </div>
          <div>
            <dt>Operator identity</dt>
            <dd>Simulated workspace admin</dd>
          </div>
        </dl>
      </section>
      <section className="cp-panel cp-settings-panel">
        <PanelHead
          title="Integration boundaries"
          sub="Designed to connect to the existing gateway-poc services"
        />
        {[
          [
            Fingerprint,
            "Identity provider",
            "Cognito / Teleport JWT validation",
            "Not connected",
          ],
          [
            Network,
            "Central LLM gateway",
            "LiteLLM model routing, entitlements, and budgets",
            "Not connected",
          ],
          [
            Database,
            "Business system executor",
            "Credential broker, idempotency, and verified effects",
            "Simulated",
          ],
          [
            History,
            "Audit persistence",
            "Postgres metadata and redacted S3 objects",
            "Browser only",
          ],
        ].map(([Icon, title, sub, status]) => {
          const I = Icon as typeof Fingerprint;
          return (
            <div className="cp-integration-row" key={String(title)}>
              <I size={20} />
              <span>
                <strong>{String(title)}</strong>
                <small>{String(sub)}</small>
              </span>
              <span className="cp-outline-label">{String(status)}</span>
            </div>
          );
        })}
      </section>
      <section className="cp-panel cp-settings-panel">
        <PanelHead
          title="Demo data"
          sub="Restore the sample fleet, runs, approvals, and CRM state."
          action={
            <button
              className="cp-button"
              onClick={() => open({ kind: "reset" })}
            >
              <RotateCcw size={14} />
              Reset demo
            </button>
          }
        />
        <div className="cp-settings-copy">
          Use synthetic data here. Resetting removes local demo changes and
          starts a fresh sample workspace.
        </div>
      </section>
    </>
  );
}

function Onboard({ onClose }: { onClose: () => void }) {
  const { state, send, notify } = useControl();
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [team, setTeam] = useState("Operations");
  const [role, setRole] = useState("Operator");
  const [tier, setTier] = useState<Tier>("Standard");
  const [budget, setBudget] = useState(30);
  const [parentId, setParentId] = useState("");
  const [tools, setTools] = useState<string[]>([
    "CRM · read",
    "Knowledge · read",
  ]);
  const parent = state.agents.find((a) => a.id === parentId);
  const allowedTools = ROLE_TOOLS[role].filter(
    (t) => !parent || parent.tools.includes(t),
  );
  const allowedTiers = ROLE_TIERS[role].filter(
    (t) =>
      !parent ||
      ROLE_TIERS.Coordinator.indexOf(t) <=
        ROLE_TIERS.Coordinator.indexOf(parent.tier),
  );
  const valid =
    name.trim() &&
    owner.trim() &&
    budget > 0 &&
    allowedTiers.includes(tier) &&
    tools.every((t) => allowedTools.includes(t));
  return (
    <Modal
      title="Give your agent an identity."
      subtitle="Start with an owner and the minimum access the work needs."
      wide
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          const id = `agt_${crypto.randomUUID().slice(0, 8)}`;
          send({
            type: "onboard",
            agent: {
              id,
              name: name.trim(),
              description: `${role} agent for ${team.toLowerCase()}.`,
              initials: name
                .trim()
                .split(/\s+/)
                .map((s) => s[0])
                .join("")
                .slice(0, 2)
                .toUpperCase(),
              color: "sage",
              owner: owner.trim(),
              team,
              role,
              status: "active",
              tier,
              tools,
              budget,
              spent: 0,
              ...(parentId ? { parentId } : {}),
            },
          });
          notify(`${name.trim()} is registered in the demo workspace.`);
          onClose();
        }}
      >
        <div className="cp-form-grid">
          <label>
            Agent name
            <input
              required
              maxLength={60}
              placeholder="e.g. Procurement assistant"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Accountable owner
            <input
              required
              maxLength={80}
              placeholder="Full name"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            />
          </label>
          <label>
            Team
            <select value={team} onChange={(e) => setTeam(e.target.value)}>
              {[
                "Operations",
                "Revenue",
                "Support",
                "Finance",
                "Engineering",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Role
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setTier("Utility");
                setTools(["Knowledge · read"]);
              }}
            >
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Parent agent
            <select
              value={parentId}
              onChange={(e) => {
                setParentId(e.target.value);
                setTier("Utility");
                setTools([]);
              }}
            >
              <option value="">Independent agent</option>
              {state.agents
                .filter(
                  (a) =>
                    a.status === "active" &&
                    a.tools.includes("Agents · delegate"),
                )
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Model tier
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as Tier)}
            >
              {allowedTiers.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Model budget (USD)
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              max="100000"
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
            />
          </label>
        </div>
        <fieldset className="cp-permissions">
          <legend>Tool permissions</legend>
          <p>Explicit grants only. Unlisted tools are denied.</p>
          <div>
            {allowedTools.map((t) => (
              <label key={t}>
                <input
                  type="checkbox"
                  checked={tools.includes(t)}
                  onChange={(e) =>
                    setTools(
                      e.target.checked
                        ? [...tools, t]
                        : tools.filter((x) => x !== t),
                    )
                  }
                />
                {t}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="cp-note">
          <Fingerprint size={17} />
          <p>
            A unique agent ID will be created. This demo does not issue
            production credentials.
          </p>
        </div>
        <div className="cp-modal-footer">
          <button type="button" className="cp-button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="cp-button cp-button-dark"
            type="submit"
            disabled={!valid}
          >
            <Plus size={15} />
            Register agent
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Simulate({ onClose }: { onClose: () => void }) {
  const { state, send, notify } = useControl();
  const [agentId, setAgentId] = useState("agt_003");
  const [discount, setDiscount] = useState(25);
  const [sourceAge, setSourceAge] = useState(2);
  return (
    <Modal
      title="Test an action policy"
      subtitle="A real policy evaluation. A simulated business action."
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send({ type: "simulate", agentId, discount, sourceAge });
          notify(
            "Run evaluated. Open Execution controls to inspect every decision.",
          );
          onClose();
        }}
      >
        <div className="cp-simulation-task">
          <Mail size={21} />
          <span>
            <strong>Prepare an Acme renewal offer</strong>
            <small>Read the CRM record and propose a customer email.</small>
          </span>
        </div>
        <div className="cp-form-grid one-column">
          <label>
            Executing agent
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            >
              {state.agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Proposed discount <strong>{discount}%</strong>
            <input
              type="range"
              min={0}
              max={50}
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
            />
          </label>
          <label>
            Age of source record <strong>{sourceAge} days</strong>
            <input
              type="range"
              min={0}
              max={60}
              value={sourceAge}
              onChange={(e) => setSourceAge(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="cp-note">
          <ShieldCheck size={17} />
          <p>
            Policy allows up to{" "}
            {state.policies.find((p) => p.id === "discount")?.threshold}%
            discount on records at most{" "}
            {state.policies.find((p) => p.id === "freshness")?.threshold} days
            old. The agent must also be active, have send permission, and be
            within budget.
          </p>
        </div>
        <div className="cp-modal-footer">
          <span className="cp-fineprint">No external model call or email.</span>
          <button className="cp-button cp-button-dark" type="submit">
            <Play size={14} />
            Evaluate & run
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AgentDetail({
  agentId,
  open,
  onClose,
}: {
  agentId: string;
  open: Open;
  onClose: () => void;
}) {
  const { state, send, notify } = useControl();
  const a = state.agents.find((a) => a.id === agentId);
  if (!a)
    return (
      <Modal title="Agent not found" onClose={onClose}>
        <Empty
          title="This agent is unavailable"
          text="It may have been removed when the demo was reset."
        />
      </Modal>
    );
  return (
    <Modal title={a.name} subtitle={a.description} drawer onClose={onClose}>
      <div className="cp-detail-hero">
        <Avatar agent={a} />
        <span>
          <strong>{a.name}</strong>
          <small className="cp-mono">{a.id}</small>
        </span>
        <Status value={a.status} />
      </div>
      <dl className="cp-detail-list">
        <div>
          <dt>Accountable owner</dt>
          <dd>{a.owner}</dd>
        </div>
        <div>
          <dt>Team</dt>
          <dd>{a.team}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{a.role}</dd>
        </div>
        <div>
          <dt>Model tier</dt>
          <dd>{a.tier}</dd>
        </div>
        <div>
          <dt>Delegated by</dt>
          <dd>
            {state.agents.find((p) => p.id === a.parentId)?.name ||
              "Workspace admin"}
          </dd>
        </div>
        <div>
          <dt>Model spend / budget</dt>
          <dd>
            {money(a.spent)} / {money(a.budget)}
          </dd>
        </div>
      </dl>
      <h3 className="cp-detail-heading">Granted permissions</h3>
      <div className="cp-granted-tools">
        {a.tools.map((t) => (
          <span key={t}>
            <Check size={13} />
            {t}
          </span>
        ))}
        {!a.tools.length && <p>No tool permissions granted.</p>}
      </div>
      <h3 className="cp-detail-heading">Recent executions</h3>
      <div className="cp-detail-runs">
        {state.runs
          .filter((r) => r.agentIds.includes(a.id))
          .map((r) => (
            <button key={r.id} onClick={() => open({ kind: "run", id: r.id })}>
              <GitBranch size={15} />
              <span>{r.name}</span>
              <Status value={r.status} />
              <ChevronRight size={13} />
            </button>
          ))}
      </div>
      <div className="cp-note">
        <KeyRound size={17} />
        <p>
          Access is evaluated on every simulated request. Suspending this
          identity also stops pending delegated work.
        </p>
      </div>
      <div className="cp-modal-footer">
        <button
          className="cp-button"
          onClick={() => open({ kind: "budget", id: a.id })}
        >
          <Wallet size={14} />
          Edit budget
        </button>
        <button
          className={`cp-button ${a.status === "active" ? "cp-button-danger" : "cp-button-dark"}`}
          onClick={() => {
            send({
              type: "agent_status",
              agentId: a.id,
              status: a.status === "active" ? "paused" : "active",
            });
            notify(
              a.status === "active"
                ? "Agent suspended. Pending runs and approvals stopped."
                : "Agent access restored. Terminated runs remain stopped.",
            );
          }}
        >
          {a.status === "active" ? <Pause size={14} /> : <Play size={14} />}
          {a.status === "active" ? "Suspend agent" : "Restore access"}
        </button>
      </div>
    </Modal>
  );
}

function RunDetail({
  runId,
  open,
  onClose,
}: {
  runId: string;
  open: Open;
  onClose: () => void;
}) {
  const { state, send, notify } = useControl();
  const run = state.runs.find((r) => r.id === runId);
  if (!run)
    return (
      <Modal title="Execution not found" onClose={onClose}>
        <Empty
          title="This execution is unavailable"
          text="The demo may have been reset."
        />
      </Modal>
    );
  const approval = state.approvals.find(
    (a) => a.runId === run.id && a.status === "pending",
  );
  return (
    <Modal title={run.name} subtitle={run.id} drawer onClose={onClose}>
      <div className="cp-run-detail-summary">
        <Status value={run.status} />
        <span>{run.agentIds.length} assigned agents</span>
        <span>${run.cost.toFixed(3)} model cost</span>
      </div>
      <h3 className="cp-detail-heading">Execution trace</h3>
      <ol className="cp-timeline">
        {run.steps.map((step, i) => {
          const a = state.agents.find((a) => a.id === step.agent)!;
          return (
            <li className={`cp-step-${step.status}`} key={i}>
              <span className="cp-step-symbol">
                {step.status === "passed" ? (
                  <Check size={14} />
                ) : step.status === "blocked" ? (
                  <X size={14} />
                ) : step.status === "held" ? (
                  <Pause size={12} />
                ) : (
                  <span>{i + 1}</span>
                )}
              </span>
              <div>
                <div className="cp-step-meta">
                  <span>{a.name}</span>
                  <span>STEP 0{i + 1}</span>
                </div>
                <h4>{step.action}</h4>
                <p>{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {approval && (
        <div className="cp-warning">
          <ShieldAlert size={19} />
          <div>
            <strong>This execution needs a human decision.</strong>
            <p>Review the exact proposal before any further action.</p>
          </div>
          <button
            className="cp-text-button"
            onClick={() => open({ kind: "approval", id: approval.id })}
          >
            Review
            <ArrowRight size={14} />
          </button>
        </div>
      )}
      <div className="cp-note">
        <FileCheck2 size={17} />
        <p>
          The record includes the proposal, policy decisions, and simulated
          outcome. It is a demo record, not a signed production receipt.
        </p>
      </div>
      <div className="cp-modal-footer">
        <button
          className="cp-button"
          onClick={() =>
            exportJson(`${run.id}.json`, {
              environment: "demo",
              run,
              approvals: state.approvals.filter((a) => a.runId === run.id),
              audit: state.audit.filter((a) => a.runId === run.id),
            })
          }
        >
          <Download size={14} />
          Export record
        </button>
        {["awaiting_approval", "contained"].includes(run.status) && (
          <button
            className="cp-button cp-button-danger"
            onClick={() => {
              send({ type: "terminate", runId: run.id });
              notify("Run terminated. Pending approvals are no longer valid.");
            }}
          >
            <Square size={12} />
            Terminate run
          </button>
        )}
      </div>
    </Modal>
  );
}

function ApprovalDetail({
  approvalId,
  onClose,
}: {
  approvalId: string;
  onClose: () => void;
}) {
  const { state, send, notify } = useControl();
  const a = state.approvals.find((a) => a.id === approvalId);
  if (!a) return null;
  const agent = state.agents.find((x) => x.id === a.agentId)!;
  return (
    <Modal
      title="Review the proposed action."
      subtitle="Approve this exact proposal, or stop it before execution."
      onClose={onClose}
    >
      <div className="cp-detail-hero">
        <Avatar agent={agent} />
        <span>
          <strong>{agent.name}</strong>
          <small>
            {agent.owner} · {agent.role}
          </small>
        </span>
        <Status value={a.status} />
      </div>
      <dl className="cp-detail-list">
        <div>
          <dt>Action</dt>
          <dd>Send a renewal offer</dd>
        </div>
        <div>
          <dt>Target</dt>
          <dd>{a.target}</dd>
        </div>
        <div>
          <dt>Requested discount</dt>
          <dd className="cp-rust-text">{a.amount}%</dd>
        </div>
        <div>
          <dt>Delegated authority</dt>
          <dd>{a.limit}%</dd>
        </div>
        <div>
          <dt>Policy version</dt>
          <dd>Discount authority · v{a.policyVersion}</dd>
        </div>
        <div>
          <dt>Execution</dt>
          <dd className="cp-mono">{a.runId}</dd>
        </div>
      </dl>
      <div className="cp-note">
        <Fingerprint size={17} />
        <p>
          The demo admin approves a single exception. A policy change,
          suspension, or terminated run invalidates this approval.
        </p>
      </div>
      {a.status === "pending" && (
        <div className="cp-modal-footer">
          <button
            className="cp-button cp-button-danger"
            onClick={() => {
              send({ type: "approval", approvalId: a.id, decision: "reject" });
              notify("Proposal rejected. No action executed.");
            }}
          >
            <X size={14} />
            Reject proposal
          </button>
          <button
            className="cp-button cp-button-dark"
            onClick={() => {
              send({ type: "approval", approvalId: a.id, decision: "approve" });
              notify(
                "Decision evaluated and recorded. Check the updated proposal status.",
              );
            }}
          >
            <Check size={15} />
            Approve this action
          </button>
        </div>
      )}
    </Modal>
  );
}

function PolicyDetail({
  policyId,
  onClose,
}: {
  policyId: string;
  onClose: () => void;
}) {
  const { state, send, notify } = useControl();
  const policy = state.policies.find((p) => p.id === policyId)!;
  const [threshold, setThreshold] = useState(policy.threshold ?? 0);
  return (
    <Modal
      title={policy.name}
      subtitle={`${policy.stage} boundary · version ${policy.version}`}
      onClose={onClose}
    >
      <p className="cp-modal-description">{policy.description}</p>
      <div className="cp-note">
        <ShieldCheck size={17} />
        <p>
          Enforced outside the agent. Prompt instructions cannot override this
          control.
        </p>
      </div>
      {policy.threshold !== undefined ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send({ type: "policy", policyId, threshold });
            notify(
              "Policy version updated. Pending proposals must be evaluated again.",
            );
            onClose();
          }}
        >
          <div className="cp-form-grid one-column">
            <label>
              Threshold ({policy.unit})
              <input
                type="number"
                required
                min="0"
                max={policy.id === "discount" ? 100 : 365}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
              />
            </label>
          </div>
          <p className="cp-fineprint">
            Saving invalidates pending approvals so they cannot execute under an
            outdated policy.
          </p>
          <div className="cp-modal-footer">
            <button type="button" className="cp-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="cp-button cp-button-dark">
              Save policy version
              <ArrowRight size={14} />
            </button>
          </div>
        </form>
      ) : (
        <>
          <dl className="cp-detail-list">
            <div>
              <dt>Enforcement</dt>
              <dd>Always on in this demo</dd>
            </div>
            <div>
              <dt>Failure behavior</dt>
              <dd>
                {policy.id === "pii"
                  ? "Redact email patterns; block SSN patterns"
                  : "Deny the action or stop execution"}
              </dd>
            </div>
            <div>
              <dt>Audit</dt>
              <dd>Record the decision and actor</dd>
            </div>
          </dl>
          <button className="cp-button cp-button-dark" onClick={onClose}>
            Done
            <Check size={14} />
          </button>
        </>
      )}
    </Modal>
  );
}

function Budget({
  agentId,
  onClose,
}: {
  agentId: string;
  onClose: () => void;
}) {
  const { state, send, notify } = useControl();
  const a = state.agents.find((a) => a.id === agentId)!;
  const [budget, setBudget] = useState(a.budget);
  return (
    <Modal
      title="Set an agent model budget"
      subtitle={a.name}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send({ type: "budget", agentId, budget });
          notify(
            "Budget updated. The new ceiling applies to the next simulated request.",
          );
          onClose();
        }}
      >
        <div className="cp-form-grid one-column">
          <label>
            Agent model budget (USD)
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="cp-note">
          <Wallet size={17} />
          <p>
            Current spend: {money(a.spent)}. If the new limit is below current
            spend, future simulated calls will be refused. Demo budgets do
            not reset automatically.
          </p>
        </div>
        <div className="cp-modal-footer">
          <button type="button" className="cp-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="cp-button cp-button-dark">
            Save budget
            <Check size={14} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Reset({ onClose }: { onClose: () => void }) {
  const { reset } = useControl();
  return (
    <Modal
      title="Reset this demo?"
      subtitle="Restore the starting sample data."
      onClose={onClose}
    >
      <p className="cp-modal-description">
        Locally registered agents, changed policies, approvals, and recovery
        actions will be replaced with a fresh sample workspace.
      </p>
      <div className="cp-modal-footer">
        <button className="cp-button" onClick={onClose}>
          Keep my changes
        </button>
        <button
          className="cp-button cp-button-danger"
          onClick={() => {
            reset();
            onClose();
          }}
        >
          <RotateCcw size={14} />
          Reset sample data
        </button>
      </div>
    </Modal>
  );
}
