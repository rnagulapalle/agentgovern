"use client";

import { Check, Gauge } from "lucide-react";
import { TRUST_SCORE, TRUST_PASSED, TRUST_MISSING } from "@/lib/mock-data";

function ScoreRing({ score }: { score: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const off = c * (1 - score / 100);
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="#818cf8"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          className="ring-draw"
          style={{ ["--ring-c" as string]: `${c}`, ["--ring-off" as string]: `${off}` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold tabular-nums tracking-tight text-white">
          {score}
        </span>
        <span className="font-mono text-[10px] text-white/30">/100</span>
      </div>
    </div>
  );
}

export function TrustScoreCard({ active }: { active: boolean }) {
  if (!active) {
    return (
      <div className="card flex flex-col items-center justify-center gap-1.5 px-6 py-9 text-center">
        <Gauge className="h-4 w-4 text-white/25" />
        <p className="text-[13px] font-medium text-white/55">Trust score pending</p>
        <p className="max-w-xs text-[12px] text-white/35">
          Computed from this run&apos;s identity, scoping, approval, and audit signals.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold tracking-tight text-white/90">
          Agent Trust Score
        </h3>
        <span className="chip font-mono border-amber-500/25 bg-amber-500/[0.07] text-amber-300">
          needs work
        </span>
      </div>

      <div className="flex items-center gap-4">
        <ScoreRing score={TRUST_SCORE} />
        <p className="text-[12px] leading-relaxed text-white/45">
          5 of 8 trust controls satisfied. Three production gaps remain before
          this agent is cleared for autonomous execution.
        </p>
      </div>

      <div className="mt-4 space-y-3 border-t border-white/[0.06] pt-3.5">
        <div>
          <div className="label mb-2 text-emerald-300/70">
            Passed · {TRUST_PASSED.length}
          </div>
          <ul className="space-y-1.5">
            {TRUST_PASSED.map((p) => (
              <li key={p} className="flex items-center gap-2 text-[12px] text-white/70">
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={2.4} />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="label mb-2 text-amber-300/70">
            Missing · {TRUST_MISSING.length}
          </div>
          <ul className="space-y-1.5">
            {TRUST_MISSING.map((m) => (
              <li key={m} className="flex items-center gap-2 text-[12px] text-white/45">
                <span className="ml-0.5 mr-0.5 h-1 w-2.5 shrink-0 rounded-full bg-amber-500/50" />
                {m}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
