"use client";

import { useEffect, useState } from "react";
import { Play, RotateCcw, Loader2, ArrowRight, Check } from "lucide-react";
import { HUMAN_TASK, AGENT, REASONING_LINES, RUN_STEPS } from "@/lib/mock-data";
import type { Phase } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Streams a string in character-by-character — the "agent is thinking" feel. */
function TypingLine({ text, speed = 20 }: { text: string; speed?: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  return (
    <span>
      {text.slice(0, count)}
      <span className="ml-px inline-block h-3 w-[6px] translate-y-px animate-blink bg-indigo-400/80 align-middle" />
    </span>
  );
}

const CURRENT_INDEX: Record<Phase, number> = {
  idle: -1,
  planning: 0,
  policy: 2,
  review: 3,
  resolved: 5,
};

const STATUS: Record<Phase, { label: string; tone: string }> = {
  idle: { label: "ready", tone: "text-white/40" },
  planning: { label: "planning", tone: "text-indigo-300" },
  policy: { label: "intercepting", tone: "text-indigo-300" },
  review: { label: "awaiting approval", tone: "text-amber-300" },
  resolved: { label: "sealed", tone: "text-emerald-300" },
};

function Stepper({ phase }: { phase: Phase }) {
  const current = CURRENT_INDEX[phase];
  return (
    <div className="flex items-center gap-1.5">
      {RUN_STEPS.map((step, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        return (
          <div key={step.key} className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] transition-colors",
                state === "done" && "border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-300",
                state === "active" && "border-indigo-400/30 bg-indigo-500/[0.08] text-indigo-200",
                state === "todo" && "border-white/[0.07] bg-white/[0.01] text-white/30"
              )}
            >
              {state === "done" ? (
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              ) : (
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    state === "active" ? "animate-pulse bg-indigo-400" : "bg-white/20"
                  )}
                />
              )}
              {step.label}
            </span>
            {i < RUN_STEPS.length - 1 && (
              <span className="h-px w-2.5 bg-white/[0.08]" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function RunConsole({
  phase,
  revealedActions,
  onRun,
  onReset,
}: {
  phase: Phase;
  revealedActions: number;
  onRun: () => void;
  onReset: () => void;
}) {
  const running = phase === "planning" || phase === "policy";
  const status = STATUS[phase];

  // reasoning lines stream in while the agent plans
  const reasoningShown =
    phase === "planning"
      ? REASONING_LINES.slice(0, Math.min(revealedActions + 1, REASONING_LINES.length))
      : [];

  return (
    <section className="animate-fade-in mb-6 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0b0b0d] shadow-2xl shadow-black/40">
      {/* chrome bar */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <div className="dots">
          <span className="bg-[#ff5f57]" />
          <span className="bg-[#febc2e]" />
          <span className="bg-[#28c840]" />
        </div>
        <span className="ml-2 font-mono text-[11px] text-white/40">
          agent-console · SDR-Agent-17
        </span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px]">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              phase === "idle" ? "bg-white/25" : "animate-pulse bg-current",
              status.tone
            )}
          />
          <span className={status.tone}>{status.label}</span>
        </span>
      </div>

      <div className="p-5 sm:p-6">
        <div className="label mb-3">Human instruction → intercepted</div>

        <div className="flex items-start gap-3">
          <span className="mt-1 select-none font-mono text-[13px] text-indigo-400">›</span>
          <p className="text-pretty text-[17px] font-medium leading-snug text-white sm:text-[19px]">
            {HUMAN_TASK}
          </p>
        </div>

        {/* live reasoning stream (only while planning) — last line types out */}
        {reasoningShown.length > 0 && (
          <div className="mt-4 space-y-1 rounded-lg border border-white/[0.06] bg-white/[0.015] p-3 font-mono text-[11px]">
            {reasoningShown.map((line, i) => {
              const last = i === reasoningShown.length - 1;
              return (
                <div key={i} className="flex items-start gap-2 text-white/55">
                  <span className="mt-px text-indigo-400/70">{last ? "▸" : "✓"}</span>
                  {last ? <TypingLine text={line} /> : <span>{line}</span>}
                </div>
              );
            })}
          </div>
        )}

        {/* controls */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-4">
          {phase === "idle" ? (
            <button
              onClick={onRun}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-500/40 bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white transition-all hover:bg-indigo-500 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
            >
              <Play className="h-4 w-4 fill-current" strokeWidth={2} />
              Run agent
              <span className="kbd ml-1 border-white/20 text-white/70">Space</span>
            </button>
          ) : running ? (
            <button
              disabled
              className="inline-flex items-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-white/60"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              {phase === "planning" ? "Generating plan…" : "Checking policy…"}
            </button>
          ) : (
            <button
              onClick={onReset}
              className="inline-flex items-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.02] px-3.5 py-2 text-[13px] font-medium text-white/75 transition-all hover:bg-white/[0.05] hover:text-white active:scale-[0.98]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Run again
            </button>
          )}

          {/* routing chip */}
          <div className="flex items-center gap-2 font-mono text-[12px] text-white/40">
            <span>routed_to</span>
            <ArrowRight className="h-3.5 w-3.5 text-white/25" />
            <span className="rounded border border-indigo-400/25 bg-indigo-500/[0.08] px-2 py-0.5 text-indigo-200">
              {AGENT.name}
            </span>
          </div>

          {/* stepper — hide on small screens */}
          <div className="ml-auto hidden lg:block">
            <Stepper phase={phase} />
          </div>
        </div>
      </div>
    </section>
  );
}
