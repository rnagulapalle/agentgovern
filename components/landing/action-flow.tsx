"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import {
  ArrowRight,
  Check,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

import { MultiFlowScene, multiFlowScenes } from "./multi-flow";

export const actionFlowScenes = [
  {
    title: "One request. A clear boundary.",
    detail:
      "A scoped agent proposes a customer-record update. Nothing has changed yet.",
    gate: "Identity checked",
    crm: "Not executed",
    tone: "neutral",
  },
  {
    title: "Risky changes wait for a person.",
    detail:
      "The update needs a named reviewer. The requester cannot approve their own action.",
    gate: "Approval required",
    crm: "On hold",
    tone: "held",
  },
  {
    title: "Approve the exact change.",
    detail:
      "A different team member approves the reviewed payload. Only that change may execute.",
    gate: "Exact change approved",
    crm: "Ready to execute",
    tone: "verified",
  },
  {
    title: "A timeout is not a failed write.",
    detail:
      "The CRM update executes, but its response is lost. The customer message stays on hold.",
    gate: "Retry held",
    crm: "Outcome uncertain",
    tone: "held",
  },
  {
    title: "Check the record before retrying.",
    detail:
      "Reconciliation reads the provider-twin record to find out whether the approved change exists.",
    gate: "Verifying effect",
    crm: "Checking the record",
    tone: "held",
  },
  {
    title: "The change exists. No second write.",
    detail:
      "The recorded effect is verified. The message can proceed after its separate approval.",
    gate: "Effect verified",
    crm: "Update confirmed",
    tone: "verified",
  },
  {
    title: "Release the next step with evidence.",
    detail:
      "The separately approved acknowledgement executes. Both effects are checked before the run completes.",
    gate: "Run verified",
    crm: "Update confirmed",
    tone: "verified",
  },
] as const;

export function ActionFlowScene({
  step,
  paused = false,
}: {
  step: number;
  paused?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const current = Math.max(0, Math.min(actionFlowScenes.length - 1, step));
  const scene = actionFlowScenes[current];
  const released = current === 6;
  const uncertain = current === 3 || current === 4;
  return (
    <div
      className={`ll-action-scene ${paused ? "is-paused" : ""}`}
      data-step={current}
    >
      <div className="ll-action-diagram" aria-hidden="true">
        <svg viewBox="0 0 680 310" fill="none" className="ll-action-network">
          <defs>
            <radialGradient id={`${id}-glow`}>
              <stop stopColor="#879877" stopOpacity=".25" />
              <stop offset="1" stopColor="#879877" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse
            cx="292"
            cy="148"
            rx="85"
            ry="95"
            fill={`url(#${id}-glow)`}
          />
          {[56, 84, 112, 140, 168, 196, 224, 252].map((y, i) => {
            const d = `M50 ${y} C145 ${y},175 148,265 148`;
            return (
              <g
                key={y}
                style={{ "--flow-delay": `${-i * 0.43}s` } as CSSProperties}
              >
                <path d={d} stroke="#d7d8d0" strokeWidth="1.2" />
                <path
                  d={d}
                  pathLength="100"
                  className={`ll-action-pulse ll-action-team-${i % 3}`}
                />
                <circle cx="50" cy={y} r="4" fill="#fafaf7" stroke="#9b9e91" />
              </g>
            );
          })}
          <path
            d="M320 148 C365 148,375 104,421 104"
            stroke="#d7d8d0"
            strokeWidth="1.5"
          />
          {current === 3 && (
            <path
              d="M320 148 C365 148,375 104,421 104"
              pathLength="100"
              className="ll-action-pulse ll-action-allowed ll-action-once"
            />
          )}
          <path
            d="M320 155 C425 155,465 214,567 214"
            stroke="#d7d8d0"
            strokeWidth="1.5"
            strokeDasharray={released ? undefined : "4 5"}
          />
          {released && (
            <path
              d="M320 155 C425 155,465 214,567 214"
              pathLength="100"
              className="ll-action-pulse ll-action-allowed ll-action-once"
            />
          )}
          {uncertain && (
            <>
              <path
                d="M445 128 C445 256,315 254,292 177"
                stroke="#bc9060"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              {current === 4 && (
                <path
                  d="M445 128 C445 256,315 254,292 177"
                  pathLength="100"
                  className="ll-action-pulse ll-action-check"
                />
              )}
              <text x="351" y="264" textAnchor="middle">
                Verify before retry
              </text>
            </>
          )}
          <rect
            x="266"
            y="105"
            width="54"
            height="86"
            rx="27"
            fill="#f0f2e9"
            stroke="#7e8a69"
            strokeWidth="1.5"
          />
          <path
            d="m293 130-12 5v10c0 9 6 15 12 18 6-3 12-9 12-18v-10l-12-5Z"
            stroke="#596744"
            strokeWidth="1.5"
          />
          <path d="m287 145 4 4 8-9" stroke="#596744" strokeWidth="1.5" />
          <circle
            cx="445"
            cy="104"
            r="24"
            fill={uncertain ? "#f8eedf" : "#f0f2e9"}
            stroke={uncertain ? "#bc9060" : "#7e8a69"}
            strokeWidth="1.5"
          />
          <text
            x="445"
            y="110"
            textAnchor="middle"
            className="ll-action-node-label"
          >
            CRM
          </text>
          <rect
            x="568"
            y="190"
            width="48"
            height="48"
            rx="24"
            fill={released ? "#f0f2e9" : "#f5f4f0"}
            stroke={released ? "#7e8a69" : "#b8b5ad"}
            strokeWidth="1.5"
          />
          <path
            d="M581 207h22v15h-22z m0 0 11 8 11-8"
            stroke={released ? "#596744" : "#8a867d"}
            strokeWidth="1.4"
          />
          <text x="50" y="28">
            Scoped agents
          </text>
          <text x="293" y="83" textAnchor="middle">
            LoopLabs
          </text>
          <text x="445" y="60" textAnchor="middle">
            Record update
          </text>
          <text x="592" y="270" textAnchor="middle">
            Customer message
          </text>
          {!released && (
            <g>
              <rect
                x="505"
                y="143"
                width="70"
                height="27"
                rx="13"
                fill="#f8eedf"
              />
              <text
                x="540"
                y="162"
                textAnchor="middle"
                className="ll-action-hold-label"
              >
                Held
              </text>
            </g>
          )}
        </svg>
        <div className="ll-action-phone-flow">
          <div>
            <ShieldCheck size={23} />
            <span>LoopLabs</span>
            <small>{scene.gate}</small>
          </div>
          <i />
          <div>
            <span className="ll-action-phone-icon">CRM</span>
            <span>Record update</span>
            <small>{scene.crm}</small>
          </div>
          <i className={released ? "is-released" : ""} />
          <div>
            <span className="ll-action-phone-icon">↗</span>
            <span>Customer message</span>
            <small>{released ? "Effect verified" : "Held until safe"}</small>
          </div>
        </div>
      </div>
      <div className="ll-action-status-grid">
        <div>
          <span>Control decision</span>
          <strong className={`ll-action-tone-${scene.tone}`}>
            <i />
            {scene.gate}
          </strong>
        </div>
        <div>
          <span>Customer message</span>
          <strong
            className={
              released ? "ll-action-tone-verified" : "ll-action-tone-held"
            }
          >
            {released ? <Check size={15} /> : <Pause size={15} />}
            {released ? "Effect verified" : "Held"}
          </strong>
        </div>
      </div>
      <div className="ll-action-story">
        <span className="ll-action-step">
          {String(current + 1).padStart(2, "0")} / 07
        </span>
        <h3>{scene.title}</h3>
        <p>{scene.detail}</p>
      </div>
    </div>
  );
}

export function ActionFlowAnimation() {
  const [mode, setMode] = useState<"pattern" | "proof">("pattern");
  const scenes = mode === "pattern" ? multiFlowScenes : actionFlowScenes;
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [visible, setVisible] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(preference.matches);
    update();
    preference.addEventListener("change", update);
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.15 },
    );
    if (root.current) observer.observe(root.current);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", update);
    };
  }, []);
  useEffect(() => {
    if (paused || reduced || !visible) return;
    const timer = window.setTimeout(
      () => setStep((s) => (s + 1) % actionFlowScenes.length),
      step === 6 ? 6000 : 4500,
    );
    return () => window.clearTimeout(timer);
  }, [step, paused, reduced, visible]);
  return (
    <div ref={root} className={`ll-action-flow ${reduced ? "is-reduced" : ""}`}>
      <div className="ll-action-flow-heading">
        <span>
          <i /> Agents → controls → business systems
        </span>
        <button
          type="button"
          aria-label={
            paused ? "Play workflow animation" : "Pause workflow animation"
          }
          aria-pressed={paused}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? <Play size={17} /> : <Pause size={17} />}
        </button>
      </div>
      <div className="ll-action-modes" aria-label="Workflow illustration views">
        <button
          type="button"
          aria-pressed={mode === "pattern"}
          onClick={() => {
            setMode("pattern");
            setStep(0);
            setPaused(false);
          }}
        >
          Multiple workflows
        </button>
        <button
          type="button"
          aria-pressed={mode === "proof"}
          onClick={() => {
            setMode("proof");
            setStep(0);
            setPaused(false);
          }}
        >
          Tested CRM handoff
        </button>
      </div>
      {mode === "pattern" ? (
        <MultiFlowScene
          step={step}
          paused={paused || reduced || !visible}
          onInspect={() => setPaused(true)}
        />
      ) : (
        <ActionFlowScene step={step} paused={paused || reduced || !visible} />
      )}
      <div className="ll-action-controls">
        <div
          className="ll-action-progress"
          aria-label="Workflow illustration steps"
        >
          {scenes.map((scene, index) => (
            <button
              type="button"
              key={scene.title}
              aria-label={`Step ${index + 1}: ${scene.title}`}
              aria-current={index === step ? "step" : undefined}
              onClick={() => {
                setPaused(true);
                setStep(index);
              }}
            >
              <span />
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Restart workflow illustration"
          onClick={() => {
            setStep(0);
            setPaused(false);
          }}
        >
          <RotateCcw size={16} />
        </button>
        <button
          type="button"
          className="ll-action-next"
          onClick={() => {
            setPaused(true);
            setStep((s) => (s + 1) % actionFlowScenes.length);
          }}
        >
          Next <ArrowRight size={15} />
        </button>
      </div>
      <p className="ll-action-disclosure">
        {mode === "pattern"
          ? "Illustrative multi-system pattern, not a connected multi-branch workflow. CRM/email handoff is tested with provider twins; billing and ERP branches are conceptual."
          : "Illustrated provider-twin workflow. No live CRM or email delivery."}
      </p>
    </div>
  );
}
