"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import { LoopMark } from "@/components/brand/loop-mark";

const metricDefinitions = [
  {
    label: "Actions evaluated",
    note: "Across prepared workflows",
    href: "/control-plane/runs",
  },
  {
    label: "Held for approval",
    note: "Stopped before execution",
    href: "/control-plane/approvals",
  },
  {
    label: "Blocked before effect",
    note: "Policy prevented the action",
    href: "/control-plane/policies",
  },
  {
    label: "Need reconciliation",
    note: "Verify state before retry",
    href: "/control-plane/reconciliation",
  },
];

const outcomeDefinitions = [
  { key: "verified", label: "Verified" },
  { key: "held", label: "Held" },
  { key: "blocked", label: "Blocked" },
  { key: "uncertain", label: "Uncertain" },
] as const;

const frames = [
  {
    metrics: [1284, 96, 31, 4],
    outcomes: {
      verified: [112, 138, 126, 151, 144, 167, 158],
      held: [8, 13, 10, 15, 17, 11, 22],
      blocked: [3, 5, 4, 7, 3, 2, 7],
      uncertain: [1, 0, 1, 0, 1, 0, 1],
    },
  },
  {
    metrics: [1291, 97, 31, 4],
    outcomes: {
      verified: [118, 134, 129, 149, 153, 162, 164],
      held: [9, 12, 11, 14, 18, 12, 21],
      blocked: [4, 5, 3, 7, 4, 2, 6],
      uncertain: [1, 0, 1, 1, 0, 0, 1],
    },
  },
  {
    metrics: [1298, 99, 32, 4],
    outcomes: {
      verified: [121, 140, 132, 155, 148, 169, 162],
      held: [10, 13, 12, 16, 17, 13, 18],
      blocked: [4, 6, 4, 7, 3, 2, 6],
      uncertain: [1, 0, 1, 0, 1, 0, 1],
    },
  },
];

const interventionReasons = [
  ["Discount exceeded authority", "42", "42%"],
  ["Source record was stale", "24", "24%"],
  ["Tool permission missing", "18", "18%"],
  ["Sensitive output detected", "11", "11%"],
  ["Conflicting or duplicate write", "07", "7%"],
];

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ExecutionIntegrityDashboard() {
  const root = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(false);
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(false);
  const [frame, setFrame] = useState(0);
  // Keep useful values in the server-rendered page, then count into the
  // current sample once the dashboard enters the viewport.
  const [displayMetrics, setDisplayMetrics] = useState([1204, 83, 24, 2]);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = prefersReducedMotion();
    const node = root.current;
    if (!node) return;
    const checkInitialPosition = () => {
      const bounds = node.getBoundingClientRect();
      const initiallyVisible = bounds.top < window.innerHeight && bounds.bottom > 0;
      setVisible(initiallyVisible);
      if (initiallyVisible) setEntered(true);
    };
    checkInitialPosition();
    const initialCheck = window.setTimeout(checkInitialPosition, 180);
    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
        if (entry.isIntersecting) setEntered(true);
      },
      { threshold: 0.01 },
    );
    observer.observe(node);
    return () => {
      window.clearTimeout(initialCheck);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!entered) return;
    if (reduced.current) {
      setDisplayMetrics(frames[0].metrics);
      return;
    }
    const target = frames[frame].metrics;
    const start = [...displayMetrics];
    const startedAt = performance.now();
    let request = 0;
    const update = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 850);
      const eased = 1 - Math.pow(1 - progress, 4);
      setDisplayMetrics(
        target.map((value, index) =>
          Math.round(start[index] + (value - start[index]) * eased),
        ),
      );
      if (progress < 1) request = requestAnimationFrame(update);
    };
    request = requestAnimationFrame(update);
    return () => cancelAnimationFrame(request);
    // The current rendered values intentionally seed the next count-up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered, frame]);

  useEffect(() => {
    if (!entered || !visible || paused || reduced.current) return;
    const timer = window.setInterval(
      () => setFrame((current) => (current + 1) % frames.length),
      3600,
    );
    return () => window.clearInterval(timer);
  }, [entered, visible, paused]);

  const outcomeRows = useMemo(
    () =>
      outcomeDefinitions.map((outcome) => {
        const values = frames[frame].outcomes[outcome.key];
        return {
          ...outcome,
          values,
          total: values.reduce((sum, value) => sum + value, 0),
          max: Math.max(...values),
        };
      }),
    [frame],
  );

  return (
    <div className="ll-integrity-dashboard" ref={root}>
      <div className="ll-integrity-toolbar">
        <div>
          <LoopMark />
          <span>Execution integrity</span>
        </div>
        <div className="ll-integrity-toolbar-actions">
          <span className="ll-sample-badge">
            <i /> Illustrative sample data · Last 7 days
          </span>
          <button
            type="button"
            className="ll-integrity-pause"
            aria-label={paused ? "Play analytics animation" : "Pause analytics animation"}
            aria-pressed={paused}
            onClick={() => setPaused((current) => !current)}
          >
            {paused ? <Play size={11} /> : <Pause size={11} />}
          </button>
        </div>
      </div>

      <div className="ll-integrity-metrics">
        {metricDefinitions.map((metric, index) => (
          <Link href={metric.href} key={metric.label}>
            <strong>
              {index === 3
                ? String(displayMetrics[index]).padStart(2, "0")
                : displayMetrics[index].toLocaleString("en-US")}
            </strong>
            <span>{metric.label}</span>
            <small>{metric.note}</small>
            <ArrowUpRight size={14} />
          </Link>
        ))}
      </div>

      <div className="ll-integrity-main">
        <div className="ll-outcome-panel">
          <div className="ll-dashboard-head">
            <div>
              <strong>Action outcomes</strong>
              <span>Each status uses its own scale so low-volume risk stays visible</span>
            </div>
            <div className="ll-stream-state">
              <i className={paused ? "is-paused" : ""} />
              {paused ? "Paused" : "Sample stream"}
            </div>
          </div>
          <div
            className={`ll-outcome-trends ${entered ? "is-entered" : ""}`}
            role="img"
            aria-label="Illustrative seven-day trends for verified, held, blocked, and uncertain action outcomes. Each outcome uses its own scale."
          >
            {outcomeRows.map((outcome) => (
              <div className="ll-trend-row" key={outcome.key}>
                <div className="ll-trend-label">
                  <i className={outcome.key} />
                  <span>{outcome.label}</span>
                  <strong>{outcome.total.toLocaleString("en-US")}</strong>
                </div>
                <div className="ll-trend-bars" aria-hidden="true">
                  {outcome.values.map((value, index) => (
                    <span key={index}>
                      <i
                        className={outcome.key}
                        style={{
                          height: entered
                            ? `${Math.max(14, (value / outcome.max) * 100)}%`
                            : "0%",
                        }}
                      />
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <div className="ll-trend-days" aria-hidden="true">
              <span>M</span><span>T</span><span>W</span><span>T</span>
              <span>F</span><span>S</span><span>S</span>
            </div>
          </div>
        </div>

        <aside className="ll-attention-panel" aria-labelledby="attention-title">
          <div className="ll-dashboard-head">
            <div>
              <strong id="attention-title">Needs attention</strong>
              <span>Uncertain outcomes awaiting a decision</span>
            </div>
            <span className="ll-attention-count">04</span>
          </div>
          <div className="ll-incident-card">
            <div>
              <span className="ll-eyebrow">ERP WRITE · OUTCOME UNCERTAIN</span>
              <span className="ll-status ll-status-hold">Review required</span>
            </div>
            <h3>Supplier bank details may already be updated.</h3>
            <dl>
              <div><dt>Workflow</dt><dd>Supplier onboarding</dd></div>
              <div><dt>Owner</dt><dd>Maya Chen · Finance</dd></div>
              <div><dt>Observed</dt><dd>Response lost after write</dd></div>
            </dl>
            <Link href="/control-plane/reconciliation">
              Review recovery <ArrowUpRight size={14} />
            </Link>
          </div>
          <p>
            Verify the current record before confirming, retrying, or preparing
            a compensating change.
          </p>
        </aside>
      </div>

      <div className="ll-interventions-panel">
        <div className="ll-dashboard-head">
          <div>
            <strong>Where control intervened</strong>
            <span>Why an action did not continue automatically</span>
          </div>
          <Link href="/control-plane/audit">
            Inspect decisions <ArrowUpRight size={13} />
          </Link>
        </div>
        <div className="ll-intervention-list">
          {interventionReasons.map(([reason, count, width]) => (
            <div key={reason}>
              <span>{reason}</span>
              <i><b style={{ width }} /></i>
              <strong>{count}</strong>
            </div>
          ))}
        </div>
      </div>
      <p className="ll-integrity-disclosure">
        This dashboard is an illustrative product view. The current tour uses
        deterministic sample data stored in your browser; it does not report
        activity from connected production systems.
      </p>
    </div>
  );
}
