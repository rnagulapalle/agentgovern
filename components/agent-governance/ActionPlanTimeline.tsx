"use client";

import { Loader2, Sparkles } from "lucide-react";
import { PLANNED_ACTIONS, type ActionId, type ActionStatus } from "@/lib/mock-data";
import { StatusBadge } from "./ui";
import { cn } from "@/lib/utils";

export function ActionPlanTimeline({
  statuses,
  revealed,
  generating,
}: {
  statuses: Record<ActionId, ActionStatus>;
  revealed: number;
  generating: boolean;
}) {
  // Idle: nothing run yet
  if (revealed === 0 && !generating) {
    return (
      <div className="card flex flex-col items-center justify-center gap-1.5 px-6 py-9 text-center">
        <Sparkles className="h-4 w-4 text-white/25" />
        <p className="text-[13px] font-medium text-white/55">No plan yet</p>
        <p className="max-w-xs text-[12px] text-white/35">
          Run the agent to generate and intercept its action plan.
        </p>
      </div>
    );
  }

  const visible = PLANNED_ACTIONS.slice(0, revealed);
  const stillGenerating = generating && revealed < PLANNED_ACTIONS.length;

  return (
    <div className="card">
      <div className="card-head">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-semibold tracking-tight text-white/90">
            Planned actions
          </h3>
          <span className="font-mono text-[11px] text-white/30">
            {revealed}/{PLANNED_ACTIONS.length} tool calls
          </span>
        </div>
        <span className="label">pre-execution</span>
      </div>

      <ol className="divide-y divide-white/[0.05]">
        {visible.map((action, i) => {
          const Icon = action.icon;
          const status = statuses[action.id];
          const flagged =
            status === "blocked" ||
            status === "requires-approval" ||
            status === "rejected";
          return (
            <li
              key={action.id}
              style={{ animationDelay: `${0.04 * i}s` }}
              className="animate-fade-in flex items-center gap-3.5 px-4 py-3"
            >
              <span className="w-5 shrink-0 font-mono text-[11px] text-white/25">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                  flagged
                    ? "border-amber-500/30 bg-amber-500/[0.06] text-amber-300"
                    : "border-white/[0.07] bg-white/[0.02] text-white/60"
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.8} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-white/85">
                    {action.title}
                  </span>
                  <span className="hidden shrink-0 rounded border border-white/[0.07] bg-white/[0.02] px-1.5 py-0.5 font-mono text-[10px] text-white/45 sm:inline">
                    {action.tool}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[12px] text-white/40">
                  {action.detail}
                </p>
              </div>

              <StatusBadge status={status} className="shrink-0" />
            </li>
          );
        })}

        {stillGenerating && (
          <li className="flex items-center gap-3.5 px-4 py-3">
            <span className="w-5 shrink-0 font-mono text-[11px] text-white/20">
              {String(revealed + 1).padStart(2, "0")}
            </span>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.01]">
              <Loader2 className="h-4 w-4 animate-spin text-white/30" />
            </div>
            <div className="h-2.5 w-40 animate-pulse rounded-full bg-white/[0.06]" />
          </li>
        )}
      </ol>
    </div>
  );
}
