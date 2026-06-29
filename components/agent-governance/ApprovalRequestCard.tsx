"use client";

import {
  Pencil,
  ShieldCheck,
  XCircle,
  CheckCircle2,
  CornerUpRight,
  Send,
  CheckSquare,
} from "lucide-react";
import { Button } from "./ui";
import type { Decision } from "@/lib/types";
import { cn } from "@/lib/utils";

const RESOLVED_COPY: Record<
  Exclude<Decision, null>,
  { title: string; tone: string; icon: React.ElementType; line: (d: number) => string }
> = {
  approved: {
    title: "Approved & executed",
    tone: "emerald",
    icon: CheckCircle2,
    line: (d) =>
      `Within delegated authority — the agent sent the email with a ${d}% discount autonomously. No human approval was required.`,
  },
  edited: {
    title: "Edited to 10% & executed",
    tone: "emerald",
    icon: CheckCircle2,
    line: () =>
      "Discount auto-corrected to the 10% policy cap. Email sent within delegated authority — no exception logged.",
  },
  exception: {
    title: "Approved with exception",
    tone: "indigo",
    icon: CornerUpRight,
    line: (d) =>
      `Raj approved a one-time exception for the ${d}% discount. A signed override is attached to the audit receipt.`,
  },
  rejected: {
    title: "Rejected",
    tone: "red",
    icon: XCircle,
    line: () =>
      "Action rejected. The agent was instructed to revise the offer and resubmit for review.",
  },
};

const TONE: Record<string, string> = {
  emerald: "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-200",
  indigo: "border-indigo-400/25 bg-indigo-500/[0.07] text-indigo-200",
  red: "border-red-500/25 bg-red-500/[0.06] text-red-200",
};

export function ApprovalRequestCard({
  active,
  discount,
  overCap,
  decision,
  onApprove,
  onEdit,
  onException,
  onReject,
}: {
  active: boolean;
  discount: number;
  overCap: boolean;
  decision: Decision;
  onApprove: () => void;
  onEdit: () => void;
  onException: () => void;
  onReject: () => void;
}) {
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

  return (
    <div className="card overflow-hidden">
      <div className="card-head">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              decision
                ? "bg-emerald-400"
                : overCap
                  ? "animate-pulse bg-amber-400"
                  : "bg-emerald-400"
            )}
          />
          <h3 className="text-[13px] font-semibold tracking-tight text-white/90">
            {overCap ? "Approval required" : "Authority check"}
          </h3>
        </div>
        <span
          className={cn(
            "chip font-mono",
            decision
              ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"
              : overCap
                ? "border-amber-500/25 bg-amber-500/[0.07] text-amber-300"
                : "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"
          )}
        >
          {decision ? "resolved · raj" : overCap ? "awaiting · raj" : "auto · cleared"}
        </span>
      </div>

      <div className="p-4">
        {/* Request summary */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {[
            { l: "Action", v: `Send email · ${discount}% off`, mono: false },
            { l: "Risk", v: overCap ? "Medium" : "Low", mono: false },
            { l: "Tool", v: "Gmail", mono: false },
            { l: "Policy", v: "POL-SDR-002", mono: true },
          ].map((f) => (
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
            {overCap ? (
              <>
                Discount of {discount}% is above delegated authority.{" "}
                <span className="text-white/45">
                  Recommended — edit to 10% or request manager approval.
                </span>
              </>
            ) : (
              <>
                Discount of {discount}% is within the 10% cap.{" "}
                <span className="text-white/45">
                  The agent is cleared to execute autonomously.
                </span>
              </>
            )}
          </p>
        </div>

        {/* Actions / resolved state */}
        {decision ? (
          <div
            className={cn(
              "animate-fade-in flex items-start gap-2.5 rounded-lg border p-3",
              TONE[RESOLVED_COPY[decision].tone]
            )}
          >
            {(() => {
              const Icon = RESOLVED_COPY[decision].icon;
              return <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} />;
            })()}
            <div>
              <div className="text-[13px] font-semibold">
                {RESOLVED_COPY[decision].title}
              </div>
              <p className="mt-0.5 text-[12px] leading-relaxed opacity-75">
                {RESOLVED_COPY[decision].line(discount)}
              </p>
            </div>
          </div>
        ) : overCap ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="primary" icon={Pencil} onClick={onEdit} className="flex-1">
              Edit to 10%
            </Button>
            <Button variant="secondary" icon={ShieldCheck} onClick={onException} className="flex-1">
              Approve exception
            </Button>
            <Button variant="danger" icon={XCircle} onClick={onReject} className="flex-1">
              Reject
            </Button>
          </div>
        ) : (
          <Button variant="primary" icon={Send} onClick={onApprove} className="w-full">
            Execute &amp; sign receipt
          </Button>
        )}
      </div>
    </div>
  );
}
