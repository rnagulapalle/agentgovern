"use client";

import {
  Pencil,
  ShieldCheck,
  XCircle,
  CheckCircle2,
  CornerUpRight,
  Send,
  CheckSquare,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "./ui";
import type { Decision } from "@/lib/types";
import type { Scenario } from "@/lib/scenarios";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  emerald: "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-200",
  indigo: "border-indigo-400/25 bg-indigo-500/[0.07] text-indigo-200",
  red: "border-red-500/25 bg-red-500/[0.06] text-red-200",
};

const RESOLVED_ICON: Record<Exclude<Decision, null>, LucideIcon> = {
  approved: CheckCircle2,
  edited: CheckCircle2,
  exception: CornerUpRight,
  rejected: XCircle,
};

const BTN_ICON: Record<string, LucideIcon> = {
  edit: Pencil,
  shield: ShieldCheck,
  override: AlertTriangle,
  reject: XCircle,
};

export function ApprovalRequestCard({
  scenario,
  active,
  value,
  over,
  riskScore,
  decision,
  onDecide,
}: {
  scenario: Scenario;
  active: boolean;
  value: number;
  /** Engine decision is not "allow" — the governed action needs a human. */
  over: boolean;
  riskScore: number;
  decision: Decision;
  onDecide: (d: Exclude<Decision, null>) => void;
}) {
  const { approval, resolved } = scenario;

  // Idle — policy hasn't reached review yet
  if (!active) {
    return (
      <div className="card flex flex-col items-center justify-center gap-1.5 px-6 py-9 text-center">
        <CheckSquare className="h-4 w-4 text-white/25" />
        <p className="text-[13px] font-medium text-white/55">No approval pending</p>
        <p className="max-w-xs text-[12px] text-white/35">
          If an action exceeds the agent&apos;s authority, it surfaces here for a human decision.
        </p>
      </div>
    );
  }

  const fields = approval.summary(value, riskScore);

  return (
    <div className="card overflow-hidden">
      <div className="card-head">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              decision ? "bg-emerald-400" : over ? "animate-pulse bg-amber-400" : "bg-emerald-400"
            )}
          />
          <h3 className="text-[13px] font-semibold tracking-tight text-white/90">
            {over ? approval.headerNeedsDecision : approval.headerOk}
          </h3>
        </div>
        <span
          className={cn(
            "chip font-mono",
            decision
              ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"
              : over
                ? "border-amber-500/25 bg-amber-500/[0.07] text-amber-300"
                : "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"
          )}
        >
          {decision ? "resolved · raj" : over ? "awaiting · raj" : "auto · cleared"}
        </span>
      </div>

      <div className="p-4">
        {/* Request summary */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {fields.map((f) => (
            <div key={f.l} className="min-w-0">
              <div className="label mb-1">{f.l}</div>
              <div
                className={cn(
                  "truncate text-[13px] text-white/85",
                  f.mono && "font-mono text-[12px] text-white/65"
                )}
              >
                {f.v}
              </div>
            </div>
          ))}
        </div>

        <div className="my-3.5 inset p-3">
          <div className="label mb-1">Reason</div>
          <p className="text-[13px] text-white/70">
            {over ? approval.reasonBad(value) : approval.reasonOk(value)}
          </p>
        </div>

        {/* Actions / resolved state */}
        {decision ? (
          (() => {
            const r = resolved[decision];
            const Icon = RESOLVED_ICON[decision];
            return (
              <div
                className={cn(
                  "animate-fade-in flex items-start gap-2.5 rounded-lg border p-3",
                  TONE[r.tone]
                )}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} />
                <div>
                  <div className="text-[13px] font-semibold">{r.approvalTitle}</div>
                  <p className="mt-0.5 text-[12px] leading-relaxed opacity-75">
                    {r.approvalLine(value)}
                  </p>
                </div>
              </div>
            );
          })()
        ) : over ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            {approval.buttons.map((b) => (
              <Button
                key={b.decision}
                variant={b.variant}
                icon={BTN_ICON[b.icon]}
                onClick={() => onDecide(b.decision)}
                className="flex-1"
              >
                {b.label}
              </Button>
            ))}
          </div>
        ) : (
          <Button
            variant="primary"
            icon={Send}
            onClick={() => onDecide("approved")}
            className="w-full"
          >
            Execute &amp; sign receipt
          </Button>
        )}
      </div>
    </div>
  );
}
