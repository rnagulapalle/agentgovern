"use client";

import { FileBarChart, Download, RotateCcw } from "lucide-react";
import { Button } from "./ui";

export function FinalCTA({ onReset }: { onReset: () => void }) {
  return (
    <div className="card relative overflow-hidden p-6 sm:p-8">
      {/* faint corner hairline accent — not a glow */}
      <div className="pointer-events-none absolute right-0 top-0 h-px w-1/2 bg-gradient-to-l from-indigo-500/30 to-transparent" />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <div className="label mb-3">The thesis</div>
          <h2 className="text-balance text-[22px] font-semibold leading-[1.25] tracking-tight text-white sm:text-[26px]">
            Before agents touch production, every action needs{" "}
            <span className="text-indigo-300">identity</span>,{" "}
            <span className="text-indigo-300">permission</span>,{" "}
            <span className="text-indigo-300">approval</span>, and{" "}
            <span className="text-indigo-300">proof</span>.
          </h2>
          <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-white/45">
            AI agents are moving from chat to action. AgentGovernance is the control
            plane that gives every agent a verifiable identity, scoped authority,
            human approvals, and a replayable audit trail.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2.5 sm:flex-row lg:flex-col">
          <Button variant="primary" icon={FileBarChart}>
            Generate Trust Report
          </Button>
          <Button variant="secondary" icon={Download}>
            Export Audit Receipt
          </Button>
          <Button variant="ghost" icon={RotateCcw} onClick={onReset}>
            Run another simulation
          </Button>
        </div>
      </div>
    </div>
  );
}
