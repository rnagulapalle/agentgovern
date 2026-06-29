"use client";

import { ListTree } from "lucide-react";
import type { Decision, Phase } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AuditTimeline({
  phase,
  decision,
  timestamp,
  overCap,
  discount,
}: {
  phase: Phase;
  decision: Decision;
  timestamp: string | null;
  overCap: boolean;
  discount: number;
}) {
  if (phase === "idle") {
    return (
      <div className="card flex flex-col items-center justify-center gap-1.5 px-6 py-9 text-center">
        <ListTree className="h-4 w-4 text-white/25" />
        <p className="text-[13px] font-medium text-white/55">Audit trail empty</p>
        <p className="max-w-xs text-[12px] text-white/35">
          Every step is recorded to an immutable log the moment the agent runs.
        </p>
      </div>
    );
  }

  const reached = (p: Phase) => {
    const order: Phase[] = ["idle", "planning", "policy", "review", "resolved"];
    return order.indexOf(phase) >= order.indexOf(p);
  };
  const resolvedTime = timestamp ? timestamp.split(", ")[1] ?? "—" : "—";

  type Ev = { title: string; detail: string; time: string; tone: string; show: boolean; pending?: boolean };
  const events: Ev[] = [
    { title: "Human issued task", detail: "raj → SDR-Agent-17", time: "23:41:02", tone: "neutral", show: true },
    { title: "Agent generated plan", detail: "4 tool calls", time: "23:41:03", tone: "neutral", show: true },
    { title: "AgentGovernance intercepted calls", detail: "identity + delegation verified", time: "23:41:03", tone: "accent", show: reached("policy") },
    { title: "CRM update auto-approved", detail: "calendar + delegation cleared", time: "23:41:03", tone: "ok", show: reached("policy") },
    {
      title: overCap ? "Email action blocked" : "Email within authority",
      detail: overCap ? `${discount}% > 10% policy cap` : `${discount}% ≤ 10% cap`,
      time: "23:41:04",
      tone: overCap ? "bad" : "ok",
      show: reached("policy"),
    },
    {
      title: decision
        ? decision === "rejected"
          ? "Human rejected exception"
          : decision === "exception"
            ? "Human approved exception"
            : decision === "edited"
              ? "Human edited to 10%"
              : "Cleared — no approval needed"
        : overCap
          ? "Awaiting human review"
          : "No approval required",
      detail: decision ? "resolved by raj" : overCap ? "needs decision" : "within authority",
      time: decision ? resolvedTime : "—",
      tone: decision ? (decision === "rejected" ? "bad" : "accent") : overCap ? "wait" : "ok",
      show: reached("review"),
      pending: !decision && reached("review"),
    },
    {
      title: "Action receipt generated",
      detail: decision ? "act_9281 · signed" : "pending resolution",
      time: decision ? resolvedTime : "—",
      tone: decision ? "ok" : "neutral",
      show: reached("resolved"),
    },
  ];

  const dotTone: Record<string, string> = {
    neutral: "bg-white/25",
    accent: "bg-indigo-400",
    ok: "bg-emerald-400",
    bad: "bg-red-400",
    wait: "bg-amber-400",
  };

  const visible = events.filter((e) => e.show);

  return (
    <div className="card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold tracking-tight text-white/90">
          Audit timeline
        </h3>
        <span className="chip font-mono border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300">
          immutable
        </span>
      </div>

      <ol className="relative">
        <span className="absolute left-[3.5px] top-1.5 bottom-1.5 w-px bg-white/[0.07]" />
        {visible.map((e, i) => (
          <li
            key={`${e.title}-${i}`}
            style={{ animationDelay: `${0.04 * i}s` }}
            className="animate-fade-in relative flex items-start gap-3 pb-3.5 last:pb-0"
          >
            <span
              className={cn(
                "relative z-10 mt-1 h-2 w-2 shrink-0 rounded-full ring-4 ring-surface",
                dotTone[e.tone],
                e.pending && "animate-pulse"
              )}
            />
            <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-white/80">{e.title}</div>
                <div className="font-mono text-[11px] text-white/35">{e.detail}</div>
              </div>
              <span className="shrink-0 font-mono text-[10px] text-white/30">{e.time}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
