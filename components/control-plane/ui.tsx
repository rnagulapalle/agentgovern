"use client";

import { useEffect, useId, useRef } from "react";
import { ArrowUpRight, Check, ChevronRight, X } from "lucide-react";
import type { Agent } from "@/lib/control-plane/model";

export function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={small ? "cp-mark cp-mark-small" : "cp-mark"}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M16 3 27 9.5v13L16 29 5 22.5v-13L16 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="m5 9.5 11 6.4 11-6.4M16 16v13M10.5 6.3l11 6.4v6.5L16 22.4l-5.5-3.2v-6.5l11-6.4"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
export function Avatar({
  agent,
  small = false,
}: {
  agent: Pick<Agent, "initials" | "color">;
  small?: boolean;
}) {
  return (
    <span className={`cp-avatar cp-${agent.color} ${small ? "is-small" : ""}`}>
      {agent.initials}
    </span>
  );
}
const LABELS: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  awaiting_approval: "Needs approval",
  contained: "Contained",
  terminated: "Terminated",
  blocked: "Blocked",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  invalidated: "Re-evaluate",
  passed: "Passed",
  redacted: "Redacted",
  open: "Needs attention",
  planned: "Ready to restore",
  resolved: "Reconciled",
  conflict: "Manual review",
};
export function Status({ value, label }: { value: string; label?: string }) {
  return (
    <span className={`cp-status cp-status-${value.toLowerCase()}`}>
      <i />
      {label || LABELS[value] || value}
    </span>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="cp-page-title">
      <div>
        <div className="cp-eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="cp-title-actions">{action}</div>}
    </div>
  );
}
export function PanelHead({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="cp-panel-head">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {action}
    </div>
  );
}
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="cp-empty">
      <span>
        <Check size={23} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
export function ArrowLink({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="cp-text-button" onClick={onClick}>
      {children}
      <ArrowUpRight size={14} />
    </button>
  );
}
export function timeAgo(at: string) {
  const diff = Math.max(
    0,
    Math.floor((Date.now() - new Date(at).getTime()) / 60000),
  );
  if (diff < 1) return "Just now";
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}
export const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
export function exportJson(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  drawer = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  drawer?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key !== "Tab") return;
      const els = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input, select, textarea, [tabindex="0"]',
        ) || [],
      );
      const first = els[0];
      const last = els[els.length - 1];
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === ref.current)
      ) {
        e.preventDefault();
        last?.focus();
      }
      if (
        !e.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === ref.current)
      ) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className={`cp-modal-overlay ${drawer ? "is-drawer" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`cp-modal ${wide ? "is-wide" : ""}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
      >
        <div className="cp-modal-heading">
          <div>
            <div className="cp-eyebrow">
              LOOPLABS <ChevronRight size={10} /> PRODUCT TOUR
            </div>
            <h2 id={id}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="cp-icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        <div className="cp-modal-body">{children}</div>
      </div>
    </div>
  );
}

export function SignalArt() {
  return (
    <svg
      className="cp-signal-art"
      viewBox="0 0 500 190"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="signal-fade"
          gradientUnits="userSpaceOnUse"
          x1="0"
          x2="500"
          y1="0"
          y2="0"
        >
          <stop stopColor="#b5afa2" stopOpacity="0" />
          <stop offset=".45" stopColor="#958b79" stopOpacity=".8" />
          <stop offset="1" stopColor="#958b79" stopOpacity=".05" />
        </linearGradient>
      </defs>
      {Array.from({ length: 88 }, (_, i) => {
        const x = 14 + i * 5.5;
        const left = Math.max(0, 1 - Math.abs(i - 33) / 31);
        const wave = Math.sin(i * 1.51) * Math.cos(i * 0.19);
        const h = 17 + left * (30 + Math.abs(wave) * 115);
        return (
          <path
            key={i}
            d={`M${x} ${95 - h / 2}V${95 + h / 2}`}
            stroke="url(#signal-fade)"
            strokeWidth={i % 4 === 0 ? 1.4 : 0.65}
          />
        );
      })}
      <rect
        x="216"
        y="63"
        width="64"
        height="64"
        fill="#f5f5f4"
        stroke="#c8c2b7"
      />
      <path
        d="m248 76 15 7v12c0 10-15 19-15 19s-15-9-15-19V83l15-7Z"
        stroke="#7f8065"
        strokeWidth="1.5"
      />
      <path d="m241 95 5 5 9-10" stroke="#72775a" strokeWidth="1.5" />
      <path d="M280 95h202" stroke="#c4c0b3" strokeDasharray="3 5" />
      <rect
        x="348"
        y="44"
        width="117"
        height="22"
        rx="11"
        fill="#f5f5f4"
        stroke="#d6d3d1"
      />
      <circle cx="360" cy="55" r="2.5" fill="#71805c" />
      <text x="369" y="59" fontSize="9" fill="#78716c" fontFamily="var(--font-geist-mono)">
        POLICY ENFORCED
      </text>
    </svg>
  );
}
