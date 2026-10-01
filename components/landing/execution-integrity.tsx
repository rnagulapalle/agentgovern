"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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

const frames = [
  {
    metrics: [1284, 96, 31, 4],
  },
  {
    metrics: [1291, 97, 31, 4],
  },
  {
    metrics: [1298, 99, 32, 4],
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
  const video = useRef<HTMLVideoElement>(null);
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

  useEffect(() => {
    const playback = video.current;
    if (!playback) return;
    if (paused || !visible || reduced.current) {
      playback.pause();
      return;
    }
    void playback.play().catch(() => {
      // The poster remains visible if the browser declines autoplay.
    });
  }, [paused, visible]);

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
            aria-label={paused ? "Play execution story" : "Pause execution story"}
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

      <figure className="ll-integrity-story">
        <video
          ref={video}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/landing/execution-integrity-poster.png"
          aria-label="Illustrative supplier onboarding workflow. A proposed ERP write passes identity and authority checks, waits for named approval, becomes uncertain after a lost response, and is reconciled before LoopLabs prevents a duplicate retry."
        >
          <source src="/landing/execution-integrity.webm" type="video/webm" />
          <track
            kind="captions"
            src="data:text/vtt,WEBVTT%0A%0A"
            srcLang="en"
            label="English"
          />
        </video>
        <figcaption>
          <span>
            Follow one action from delegated authority through observed effect
            and recovery.
          </span>
          <Link href="/control-plane/reconciliation">
            Explore this run <ArrowUpRight size={13} />
          </Link>
        </figcaption>
        <details className="ll-integrity-transcript">
          <summary>Read the execution story</summary>
          <ol>
            <li><strong>Propose and verify.</strong> The Vendor Ops agent requests a supplier bank-detail update. The illustrative run checks its identity, role, and delegated authority.</li>
            <li><strong>Hold for approval.</strong> The supplier banking policy requires a named approver before the ERP write proceeds.</li>
            <li><strong>Contain uncertainty.</strong> The write is sent with an action ID, but the response is lost. The sample run blocks a blind retry.</li>
            <li><strong>Reconcile before retry.</strong> The story checks the represented ERP record and its version, confirms the change already exists, and prevents a duplicate retry.</li>
          </ol>
        </details>
      </figure>

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
