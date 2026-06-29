"use client";

import { ShieldX, ShieldCheck, ArrowRight, ScrollText } from "lucide-react";
import { POLICY_CHECKS, DISCOUNT_POLICY } from "@/lib/mock-data";
import { VerdictPill } from "./ui";
import { cn } from "@/lib/utils";

export function PolicyCheckPanel({
  revealed,
  discount,
  setDiscount,
  overCap,
  interactive,
}: {
  revealed: number;
  discount: number;
  setDiscount: (n: number) => void;
  overCap: boolean;
  interactive: boolean;
}) {
  // Idle
  if (revealed === 0) {
    return (
      <div className="card flex flex-col items-center justify-center gap-1.5 px-6 py-9 text-center">
        <ScrollText className="h-4 w-4 text-white/25" />
        <p className="text-[13px] font-medium text-white/55">Policy engine idle</p>
        <p className="max-w-xs text-[12px] text-white/35">
          Rules evaluate the moment AgentGovernance intercepts the agent&apos;s tool calls.
        </p>
      </div>
    );
  }

  const rows = POLICY_CHECKS.slice(0, revealed);
  const allShown = revealed >= POLICY_CHECKS.length;
  const capPct = (DISCOUNT_POLICY.cap / DISCOUNT_POLICY.max) * 100;

  return (
    <div className="card overflow-hidden">
      <div className="card-head">
        <h3 className="text-[13px] font-semibold tracking-tight text-white/90">
          Evaluated rules
        </h3>
        <span className="font-mono text-[11px] text-white/30">
          {revealed}/{POLICY_CHECKS.length} rules · 12ms
        </span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-white/[0.05]">
        {rows.map((check) => {
          // email row verdict is driven live by the discount slider
          const isEmail = check.id === "email";
          const verdict = isEmail
            ? overCap
              ? "blocked"
              : "allowed"
            : check.verdict;
          const detail = isEmail
            ? overCap
              ? `Discount of ${discount}% exceeds delegated authority.`
              : `Discount of ${discount}% is within the 10% cap.`
            : check.detail;
          return (
            <div
              key={check.id}
              className="animate-fade-in flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-white/85">
                  {isEmail ? `Email with ${discount}% discount` : check.label}
                </div>
                <div className="text-[12px] text-white/40">{detail}</div>
              </div>
              <VerdictPill verdict={verdict} />
            </div>
          );
        })}
      </div>

      {/* Interactive delegated-authority control */}
      {allShown && (
        <div
          className={cn(
            "animate-fade-in relative m-3 overflow-hidden rounded-lg border",
            overCap
              ? "border-red-500/20 bg-red-500/[0.035]"
              : "border-emerald-500/20 bg-emerald-500/[0.035]"
          )}
        >
          <span
            className={cn(
              "absolute inset-y-0 left-0 w-0.5",
              overCap ? "bg-red-400/70" : "bg-emerald-400/70"
            )}
          />
          <div className="p-3.5 pl-4">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                  overCap
                    ? "border-red-500/25 bg-red-500/[0.08]"
                    : "border-emerald-500/25 bg-emerald-500/[0.08]"
                )}
              >
                {overCap ? (
                  <ShieldX className="h-4 w-4 text-red-300" strokeWidth={2} />
                ) : (
                  <ShieldCheck className="h-4 w-4 text-emerald-300" strokeWidth={2} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h4
                  className={cn(
                    "text-[13px] font-semibold",
                    overCap ? "text-red-200" : "text-emerald-200"
                  )}
                >
                  {overCap
                    ? "Blocked — discount exceeds delegated authority"
                    : "Within delegated authority"}
                </h4>
                <p className="mt-1 text-[12px] leading-relaxed text-white/55">
                  {DISCOUNT_POLICY.text}
                </p>
              </div>
              <span className="hidden shrink-0 font-mono text-[10px] text-white/25 sm:block">
                {DISCOUNT_POLICY.id}
              </span>
            </div>

            {/* live slider */}
            <div className="mt-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="label">
                  {interactive ? "Drag — adjust the agent's offer" : "Agent's discount offer"}
                </span>
                <span
                  className={cn(
                    "font-mono text-[13px] font-semibold tabular-nums",
                    overCap ? "text-red-200" : "text-emerald-200"
                  )}
                >
                  {discount}%
                </span>
              </div>

              <div className="relative">
                <input
                  type="range"
                  min={0}
                  max={DISCOUNT_POLICY.max}
                  step={1}
                  value={discount}
                  disabled={!interactive}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  aria-label="Discount offer"
                  className={cn(
                    "at-range h-1.5 w-full appearance-none rounded-full bg-white/[0.08]",
                    interactive ? "cursor-pointer" : "cursor-default opacity-80"
                  )}
                  style={{ accentColor: overCap ? "#f87171" : "#34d399" }}
                />
                {/* cap marker */}
                <div
                  className="pointer-events-none absolute -top-1 bottom-3 flex flex-col items-center"
                  style={{ left: `${capPct}%` }}
                >
                  <span className="h-3 w-px bg-white/40" />
                </div>
                <span
                  className="pointer-events-none absolute -bottom-4 -translate-x-1/2 font-mono text-[9px] text-white/40"
                  style={{ left: `${capPct}%` }}
                >
                  cap 10%
                </span>
              </div>

              {/* presets — click-friendly for screen recording */}
              {interactive && (
                <div className="mt-6 flex items-center gap-2">
                  <span className="label">Presets</span>
                  {[10, 25, 40].map((v) => (
                    <button
                      key={v}
                      onClick={() => setDiscount(v)}
                      className={cn(
                        "rounded-md border px-2 py-1 font-mono text-[11px] transition-colors",
                        discount === v
                          ? "border-indigo-400/30 bg-indigo-500/[0.1] text-indigo-200"
                          : "border-white/[0.08] bg-white/[0.02] text-white/55 hover:bg-white/[0.05] hover:text-white"
                      )}
                    >
                      {v}%
                    </button>
                  ))}
                  <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] text-white/30">
                    requested {discount}%
                    <ArrowRight className="h-3 w-3" />
                    cap {DISCOUNT_POLICY.cap}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
