"use client";

import { ShieldX, ShieldCheck, ArrowRight, ScrollText } from "lucide-react";
import type { PolicyCheck } from "@/lib/mock-data";
import type { ScenarioControl } from "@/lib/scenarios";
import { VerdictPill } from "./ui";
import { cn } from "@/lib/utils";

export function PolicyCheckPanel({
  rows,
  control,
  revealed,
  value,
  setValue,
  over,
  interactive,
  evalMs,
}: {
  /** Static context rows (evaluated before the governed action). */
  rows: PolicyCheck[];
  control: ScenarioControl;
  revealed: number;
  value: number;
  setValue: (n: number) => void;
  /** Engine decision is not "allow" — the governed action is over authority. */
  over: boolean;
  interactive: boolean;
  /** Measured engine evaluation time (ms). */
  evalMs: number;
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

  // The governed action is the final row; it's driven live by the control.
  const governedRow: PolicyCheck = {
    id: "__governed",
    label: control.rowLabel(value),
    detail: over ? control.rowDetailBad(value) : control.rowDetailOk(value),
    verdict: over ? "blocked" : "allowed",
  };
  const allRows = [...rows, governedRow];
  const shown = allRows.slice(0, revealed);
  const total = allRows.length;
  const allShown = revealed >= total;
  const capPct = (control.cap / control.max) * 100;

  return (
    <div className="card overflow-hidden">
      <div className="card-head">
        <h3 className="text-[13px] font-semibold tracking-tight text-white/90">
          Evaluated rules
        </h3>
        <span className="font-mono text-[11px] text-white/30">
          {revealed}/{total} rules · {evalMs}ms
        </span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-white/[0.05]">
        {shown.map((check) => (
          <div
            key={check.id}
            className="animate-fade-in flex items-center justify-between gap-4 px-4 py-3"
          >
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-white/85">{check.label}</div>
              <div className="text-[12px] text-white/40">{check.detail}</div>
            </div>
            <VerdictPill verdict={check.verdict} />
          </div>
        ))}
      </div>

      {/* Interactive delegated-authority control */}
      {allShown && (
        <div
          className={cn(
            "animate-fade-in relative m-3 overflow-hidden rounded-lg border",
            over
              ? "border-red-500/20 bg-red-500/[0.035]"
              : "border-emerald-500/20 bg-emerald-500/[0.035]"
          )}
        >
          <span
            className={cn(
              "absolute inset-y-0 left-0 w-0.5",
              over ? "bg-red-400/70" : "bg-emerald-400/70"
            )}
          />
          <div className="p-3.5 pl-4">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                  over
                    ? "border-red-500/25 bg-red-500/[0.08]"
                    : "border-emerald-500/25 bg-emerald-500/[0.08]"
                )}
              >
                {over ? (
                  <ShieldX className="h-4 w-4 text-red-300" strokeWidth={2} />
                ) : (
                  <ShieldCheck className="h-4 w-4 text-emerald-300" strokeWidth={2} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h4
                  className={cn(
                    "text-[13px] font-semibold",
                    over ? "text-red-200" : "text-emerald-200"
                  )}
                >
                  {over ? control.badBannerTitle : control.okBannerTitle}
                </h4>
                <p className="mt-1 text-[12px] leading-relaxed text-white/55">
                  {control.policyText}
                </p>
              </div>
              <span className="hidden shrink-0 font-mono text-[10px] text-white/25 sm:block">
                {control.policyId}
              </span>
            </div>

            {/* live slider */}
            <div className="mt-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="label">
                  {interactive ? control.interactiveLabel : control.staticLabel}
                </span>
                <span
                  className={cn(
                    "font-mono text-[13px] font-semibold tabular-nums",
                    over ? "text-red-200" : "text-emerald-200"
                  )}
                >
                  {value}
                  {control.unit}
                </span>
              </div>

              <div className="relative">
                <input
                  type="range"
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={value}
                  disabled={!interactive}
                  onChange={(e) => setValue(Number(e.target.value))}
                  aria-label={control.staticLabel}
                  className={cn(
                    "at-range h-1.5 w-full appearance-none rounded-full bg-white/[0.08]",
                    interactive ? "cursor-pointer" : "cursor-default opacity-80"
                  )}
                  style={{ accentColor: over ? "#f87171" : "#34d399" }}
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
                  {control.capMarkerLabel}
                </span>
              </div>

              {/* presets — click-friendly for screen recording */}
              {interactive && (
                <div className="mt-6 flex items-center gap-2">
                  <span className="label">Presets</span>
                  {control.presets.map((v) => (
                    <button
                      key={v}
                      onClick={() => setValue(v)}
                      className={cn(
                        "rounded-md border px-2 py-1 font-mono text-[11px] transition-colors",
                        value === v
                          ? "border-indigo-400/30 bg-indigo-500/[0.1] text-indigo-200"
                          : "border-white/[0.08] bg-white/[0.02] text-white/55 hover:bg-white/[0.05] hover:text-white"
                      )}
                    >
                      {v}
                      {control.unit}
                    </button>
                  ))}
                  <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] text-white/30">
                    now {value}
                    {control.unit}
                    <ArrowRight className="h-3 w-3" />
                    cap {control.cap}
                    {control.unit}
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
