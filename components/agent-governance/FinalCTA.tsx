"use client";

import Link from "next/link";
import { FileBarChart, Download, RotateCcw } from "lucide-react";
import { Button } from "./ui";

export function FinalCTA({
  onReset,
  receipt,
}: {
  onReset: () => void;
  receipt: unknown;
}) {
  function exportReceipt() {
    const blob = new Blob([JSON.stringify(receipt, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "agent-action-receipt.json";
    a.click();
    URL.revokeObjectURL(url);
  }

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
            AI agents are moving from chat to action. LoopLabs is the control
            plane that gives every agent a verifiable identity, scoped authority,
            human approvals, and a replayable audit trail.
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2.5 sm:flex-row lg:flex-col">
          <Link
            href="/agent-governance-demo/trust-reports"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-500/40 bg-indigo-600 px-3.5 py-2 text-[13px] font-medium text-white transition-all duration-150 hover:bg-indigo-500 active:scale-[0.98]"
          >
            <FileBarChart className="h-3.5 w-3.5" strokeWidth={2.2} />
            Generate Trust Report
          </Link>
          <Button variant="secondary" icon={Download} onClick={exportReceipt}>
            Export Audit Receipt
          </Button>
          <Button variant="ghost" icon={RotateCcw} onClick={onReset}>
            Run another action
          </Button>
        </div>
      </div>
    </div>
  );
}
