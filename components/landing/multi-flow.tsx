"use client";

import { useId, useState, type CSSProperties } from "react";
import {
  Headset,
  Landmark,
  Package,
  ContactRound,
  Mail,
  CreditCard,
  Warehouse,
  ArrowUpRight,
} from "lucide-react";

const systemIcons = {
  crm: ContactRound,
  email: Mail,
  credit: CreditCard,
  vendor: Warehouse,
};
const diagramCaptions: Record<string, string> = {
  "Awaiting approval": "Needs approval",
  "Executing approved update": "Updating",
  "Outcome uncertain": "Uncertain",
  "Effect verified": "Verified",
  "Separate approval required": "Needs approval",
  "Held · verify CRM first": "Waiting on CRM",
  "Blocked · above limit": "Limit exceeded",
  "Held · named review": "Needs review",
};

export const multiFlowScenes = [
  {
    title: "Multiple workflows. Separate authority.",
    detail:
      "Customer, finance and vendor agents bring different requests. Each action keeps its own owner, permissions and approval.",
    gate: "Evaluate each action",
    tone: "neutral",
  },
  {
    title: "One boundary. Different decisions.",
    detail:
      "A CRM update needs approval. A credit exceeds its limit. A vendor change waits for review. None may borrow another action’s permission.",
    gate: "Approve · hold · block",
    tone: "held",
  },
  {
    title: "Only permitted actions flow out.",
    detail:
      "The reviewed CRM update crosses the boundary. The credit and vendor change stay stopped. The customer message still waits for its prerequisite.",
    gate: "CRM action permitted",
    tone: "verified",
  },
  {
    title: "One timeout holds its dependent work.",
    detail:
      "The CRM response is lost. Its customer message stays held. The other workflows retain their own decisions.",
    gate: "CRM outcome uncertain",
    tone: "held",
  },
  {
    title: "Evidence flows back, too.",
    detail:
      "Read back the CRM effect. A missing response does not authorize another write, or release a dependent message.",
    gate: "Read back the effect",
    tone: "held",
  },
  {
    title: "A verified write is not an email approval.",
    detail:
      "Confirm the CRM change without resending it. The customer message needs its own exact approval before it can proceed.",
    gate: "Dependency verified",
    tone: "verified",
  },
  {
    title: "Each branch keeps its own outcome.",
    detail:
      "The customer handoff is verified. The credit remains blocked and the vendor change remains held. One completed flow does not clear the others.",
    gate: "Customer handoff verified",
    tone: "verified",
  },
] as const;

export function multiFlowBranches(step: number) {
  return [
    {
      id: "crm",
      system: "CRM",
      action: "Update customer record",
      owner: "Customer operations",
      status:
        step < 2
          ? "Awaiting approval"
          : step < 3
            ? "Executing approved update"
            : step < 5
              ? "Outcome uncertain"
              : "Effect verified",
      tone: step < 2 || (step >= 3 && step < 5) ? "held" : "verified",
      dispatch: step === 2,
    },
    {
      id: "email",
      system: "Messaging",
      action: "Send acknowledgement",
      owner: "Customer operations",
      status:
        step === 6
          ? "Effect verified"
          : step === 5
            ? "Separate approval required"
            : "Held · verify CRM first",
      tone: step === 6 ? "verified" : "held",
      dispatch: step === 6,
    },
    {
      id: "credit",
      system: "Billing",
      action: "Issue a customer credit",
      owner: "Finance operations",
      status: "Blocked · above limit",
      tone: "blocked",
      dispatch: false,
    },
    {
      id: "vendor",
      system: "ERP",
      action: "Change supplier details",
      owner: "Vendor operations",
      status: "Held · named review",
      tone: "held",
      dispatch: false,
    },
  ] as const;
}

export function MultiFlowScene({
  step,
  paused = false,
  onInspect,
}: {
  step: number;
  paused?: boolean;
  onInspect?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const id = useId().replace(/:/g, "");
  const current = Math.max(0, Math.min(6, step));
  const scene = multiFlowScenes[current];
  const branches = multiFlowBranches(current);
  const selected = branches.find((branch) => branch.id === selectedId);
  const reasons: Record<string, string> = {
    crm:
      current < 2
        ? "A named reviewer must approve this exact record change."
        : current < 5
          ? "Check the observed record before any retry. A timeout is not proof of failure."
          : "The record change is verified. Do not write it a second time.",
    email:
      current === 6
        ? "The message follows its own approval and a verified CRM prerequisite."
        : current === 5
          ? "The CRM prerequisite is satisfied, but message approval is still required."
          : "Keep the message unsent until the CRM effect is verified and its own approval is granted.",
    credit:
      "The requested credit exceeds this agent’s authority. Another workflow’s approval cannot authorize it.",
    vendor:
      "A supplier change needs a named reviewer. It stays held independently of the customer workflow.",
  };
  const inspect = (branchId: string) => {
    setSelectedId(branchId);
    onInspect?.();
  };
  return (
    <div
      className={`ll-action-scene ll-multi-scene ${paused ? "is-paused" : ""}`}
      data-step={current}
    >
      <div className="ll-multi-diagram" aria-hidden="true">
        <svg className="ll-multi-network" viewBox="0 0 680 380" fill="none">
          <defs>
            <marker
              id={`${id}-forward`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M0 0 10 5 0 10" fill="#8c9580" />
            </marker>
            <marker
              id={`${id}-return`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M0 0 10 5 0 10" fill="#b28b56" />
            </marker>
          </defs>
          <text x="25" y="26" className="ll-multi-column">
            WORKFLOW AGENTS
          </text>
          <text x="252" y="26" className="ll-multi-column">
            CONTROL
          </text>
          <text x="475" y="26" className="ll-multi-column">
            BUSINESS SYSTEMS
          </text>
          {["Customer", "Finance", "Vendor"].map((name, i) => {
            const AgentIcon = [Headset, Landmark, Package][i];
            const y = 90 + i * 100;
            const d = `M154 ${y} C205 ${y},210 190,250 190`;
            return (
              <g key={name}>
                {[-15, -10, -5, 0, 5, 10, 15].map((offset, lane) => {
                  const lanePath = `M154 ${y + offset} C196 ${y + offset},211 ${174 + i * 16 + offset / 3},250 ${174 + i * 16 + offset / 3}`;
                  return (
                    <g key={offset} className="ll-multi-request-lane">
                      <path
                        d={lanePath}
                        className={`ll-multi-thread ll-multi-thread-${i}`}
                      />
                      <path
                        d={lanePath}
                        pathLength="100"
                        className={`ll-action-pulse ll-multi-signal ll-action-team-${i}`}
                        style={
                          {
                            "--flow-delay": `${lane * -0.47 - i * 0.3}s`,
                          } as CSSProperties
                        }
                      />
                    </g>
                  );
                })}
                <path
                  d={d}
                  stroke="#c6cbbf"
                  strokeWidth="1.5"
                  markerEnd={`url(#${id}-forward)`}
                />
                <path
                  d={d}
                  pathLength="100"
                  className={`ll-action-pulse ll-action-team-${i}`}
                />
                <rect
                  x="23"
                  y={y - 23}
                  width="130"
                  height="46"
                  rx="5"
                  fill="#f3f4ed"
                  stroke="#d0d3c5"
                />
                <rect
                  x="31"
                  y={y - 15}
                  width="30"
                  height="30"
                  rx="7"
                  className={`ll-multi-icon-badge ll-multi-icon-${i}`}
                />
                <AgentIcon
                  x={37}
                  y={y - 9}
                  width={18}
                  height={18}
                  strokeWidth={1.7}
                  className={`ll-multi-agent-icon ll-multi-agent-icon-${i}`}
                />
                <text
                  x="69"
                  y={y + 5}
                  className="ll-multi-agent ll-multi-agent-name"
                >
                  {name}
                </text>
              </g>
            );
          })}
          <rect
            x="250"
            y="126"
            width="72"
            height="128"
            rx="35"
            fill="#edf0e4"
            stroke="#7e8a69"
            strokeWidth="1.5"
          />
          <path
            d="m286 166-15 6v13c0 11 8 18 15 22 7-4 15-11 15-22v-13l-15-6Z m-8 20 5 5 10-12"
            stroke="#596744"
            strokeWidth="1.6"
          />
          <text x="286" y="281" textAnchor="middle" className="ll-multi-agent">
            LoopLabs
          </text>
          <text x="286" y="304" textAnchor="middle">
            Per-action decisions
          </text>
          {branches.map((branch, index) => {
            const SystemIcon = systemIcons[branch.id];
            const y = 72 + index * 88;
            const d = `M322 190 C380 190,397 ${y},473 ${y}`;
            const stopX = 418;
            return (
              <g
                key={branch.id}
                data-branch={branch.id}
                data-dispatched={branch.dispatch}
              >
                {[-12, -8, -4, 4, 8, 12].map((offset, lane) => {
                  const endX = branch.dispatch ? 473 : 407;
                  const lanePath = `M322 ${190 + offset / 2} C373 ${190 + offset / 2},390 ${y + offset},${endX} ${y + offset}`;
                  return (
                    <g key={offset}>
                      <path
                        d={lanePath}
                        className={`ll-multi-thread ${branch.dispatch ? "ll-multi-permitted-thread" : "ll-multi-stopped-thread"}`}
                      />
                      {branch.dispatch && (
                        <path
                          d={lanePath}
                          pathLength="100"
                          className="ll-action-pulse ll-action-allowed ll-action-once ll-multi-outbound-signal"
                          style={
                            {
                              "--flow-delay": `${lane * 0.12}s`,
                            } as CSSProperties
                          }
                        />
                      )}
                    </g>
                  );
                })}
                <path
                  d={d}
                  stroke={branch.dispatch ? "#899777" : "#d4d5cd"}
                  strokeWidth="1.5"
                  strokeDasharray={branch.dispatch ? undefined : "4 5"}
                  markerEnd={
                    branch.dispatch ? `url(#${id}-forward)` : undefined
                  }
                />
                {branch.dispatch && (
                  <path
                    d={d}
                    pathLength="100"
                    className="ll-action-pulse ll-action-allowed ll-action-once"
                  />
                )}
                {!branch.dispatch && (
                  <g>
                    <circle
                      cx={stopX}
                      cy={y}
                      r="10"
                      fill={branch.tone === "blocked" ? "#f4e6e1" : "#f7eddf"}
                    />
                    <path
                      d={
                        branch.tone === "blocked"
                          ? `M${stopX - 4} ${y - 4}l8 8m0-8-8 8`
                          : `M${stopX - 3} ${y - 4}v8m6-8v8`
                      }
                      stroke={branch.tone === "blocked" ? "#a3624c" : "#997443"}
                      strokeWidth="1.6"
                    />
                  </g>
                )}
                <rect
                  x="474"
                  y={y - 30}
                  width="183"
                  height="65"
                  rx="5"
                  fill="#fafaf7"
                  stroke="#d2d4c9"
                />
                <rect
                  x="485"
                  y={y - 18}
                  width="29"
                  height="36"
                  rx="7"
                  className="ll-multi-system-badge"
                />
                <SystemIcon
                  x={490}
                  y={y - 9}
                  width={19}
                  height={19}
                  strokeWidth={1.7}
                  className="ll-multi-system-icon"
                />
                <text x="524" y={y - 8} className="ll-multi-agent">
                  {branch.system}
                </text>
                <text
                  x="524"
                  y={y + 16}
                  className={`ll-multi-status ll-action-tone-${branch.tone}`}
                >
                  {diagramCaptions[branch.status]}
                </text>
              </g>
            );
          })}
          {current >= 3 && (
            <g className="ll-multi-readback">
              {[-8, -4, 4, 8].map((offset) => (
                <path
                  key={offset}
                  d={`M473 ${108 + offset} C380 ${108 + offset},376 ${272 + offset},324 ${236 + offset / 2}`}
                  className="ll-multi-evidence-thread"
                />
              ))}
              <path
                d="M473 108 C380 108,376 272,324 236"
                stroke="#b28b56"
                strokeWidth="1.5"
                strokeDasharray="2 4"
                markerEnd={`url(#${id}-return)`}
              />
              {current === 4 && (
                <path
                  d="M473 108 C380 108,376 272,324 236"
                  pathLength="100"
                  className="ll-action-pulse ll-action-check"
                />
              )}
              <rect
                x="345"
                y="114"
                width="100"
                height="25"
                rx="12"
                fill="#fafaf7"
              />
              <text
                x="395"
                y="131"
                textAnchor="middle"
                className="ll-multi-readback-label"
              >
                Read back effect
              </text>
            </g>
          )}
        </svg>
      </div>
      <div className="ll-multi-mobile">
        <div className="ll-multi-mobile-inbound">
          {["Customer", "Finance", "Vendor"].map((name, index) => {
            const AgentIcon = [Headset, Landmark, Package][index];
            return (
              <div className="ll-multi-mobile-source" key={name}>
                <div className="ll-multi-mobile-agent">
                  <AgentIcon size={34} aria-hidden="true" />
                  <strong className="sr-only">{name}</strong>
                </div>
                <span aria-hidden="true" />
              </div>
            );
          })}
        </div>
        <div className="ll-multi-mobile-gate">
          <strong>LoopLabs · per-action control</strong>
          <span>{scene.gate}</span>
        </div>
        <div className="ll-multi-mobile-systems">
        {branches.map((branch) => {
          const SystemIcon = systemIcons[branch.id];
          return (
            <button
              type="button"
              onClick={() => inspect(branch.id)}
              aria-label={`${branch.system}: ${branch.action}. ${branch.status}. Explore decision`}
              key={branch.id}
              className="ll-multi-mobile-branch"
              data-branch={branch.id}
              data-dispatched={branch.dispatch}
            >
              <div className="ll-multi-mobile-route" aria-hidden="true">
                <span />
              </div>
              <strong className="ll-multi-mobile-system">
                <SystemIcon size={32} strokeWidth={1.7} aria-hidden="true" />
                <b>{branch.system}</b>
              </strong>
              <span className={`ll-action-tone-${branch.tone}`}>
                <i />
                {diagramCaptions[branch.status]}
              </span>
            </button>
          );
        })}
        </div>
      </div>
      <div
        className="ll-multi-inspector-controls"
        role="group"
        aria-label="Inspect a downstream action"
      >
        <span>Explore a decision</span>
        <div>
          {branches.map((branch) => {
            const SystemIcon = systemIcons[branch.id];
            return (
              <button
                key={branch.id}
                type="button"
                aria-label={`${branch.system} ↗`}
                aria-pressed={selectedId === branch.id}
                aria-controls={`${id}-inspection`}
                onClick={() => inspect(branch.id)}
              >
                <SystemIcon size={17} strokeWidth={1.7} aria-hidden="true" />
                {branch.system}
                <ArrowUpRight size={13} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
      {selected && (
        <section
          id={`${id}-inspection`}
          className="ll-multi-inspector"
          aria-label={`${selected.system} action decision`}
        >
          <div className="ll-multi-inspector-heading">
            <strong>{selected.action}</strong>
            <button
              type="button"
              aria-label="Close action details"
              onClick={() => setSelectedId(null)}
            >
              ×
            </button>
          </div>
          <p className={`ll-action-tone-${selected.tone}`}>{selected.status}</p>
          <p>{reasons[selected.id]}</p>
          <span>Accountable team · {selected.owner}</span>
          <small>
            Illustrative decision · no external action is performed.
          </small>
        </section>
      )}
      <div className="ll-action-status-grid">
        <div>
          <span>Control decision</span>
          <strong className={`ll-action-tone-${scene.tone}`}>
            <i />
            {scene.gate}
          </strong>
        </div>
        <div>
          <span>Evidence returns</span>
          <strong>
            {current >= 5
              ? "CRM effect verified"
              : current === 4
                ? "CRM readback"
                : "Awaiting verified effect"}
          </strong>
        </div>
      </div>
      <div className="ll-action-story">
        <span className="ll-action-step">
          {String(current + 1).padStart(2, "0")} / 07 · DESIGN ILLUSTRATION
        </span>
        <h3>{scene.title}</h3>
        <p>{scene.detail}</p>
      </div>
    </div>
  );
}
