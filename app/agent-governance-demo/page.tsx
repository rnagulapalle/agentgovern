"use client";

import { useEffect } from "react";
import { ReceiptText } from "lucide-react";

import { TopHeader } from "@/components/agent-governance/TopHeader";
import { RunConsole } from "@/components/agent-governance/RunConsole";
import { AgentIdentityCard } from "@/components/agent-governance/AgentIdentityCard";
import { ActionPlanTimeline } from "@/components/agent-governance/ActionPlanTimeline";
import { PolicyCheckPanel } from "@/components/agent-governance/PolicyCheckPanel";
import { ApprovalRequestCard } from "@/components/agent-governance/ApprovalRequestCard";
import { ActionReceipt } from "@/components/agent-governance/ActionReceipt";
import { TrustScoreCard } from "@/components/agent-governance/TrustScoreCard";
import { AuditTimeline } from "@/components/agent-governance/AuditTimeline";
import { FinalCTA } from "@/components/agent-governance/FinalCTA";
import { SectionLabel } from "@/components/agent-governance/ui";

import { type ActionId, type ActionStatus } from "@/lib/mock-data";
import type { Decision, Phase } from "@/lib/types";
import { useSimulation } from "@/lib/use-simulation";

/** Derive each action's live status from the run phase + human decision. */
function deriveStatuses(
  phase: Phase,
  decision: Decision,
  overCap: boolean
): Record<ActionId, ActionStatus> {
  const others: ActionStatus = phase === "resolved" ? "executed" : "auto-approved";
  let email: ActionStatus;
  if (phase === "resolved") {
    email =
      decision === "rejected"
        ? "rejected"
        : decision === "exception"
          ? "executed-exception"
          : "executed"; // approved | edited
  } else {
    email = overCap ? "requires-approval" : "auto-approved";
  }
  return { crm: others, call: others, delegate: others, email };
}

export default function AgentGovernanceDemoPage() {
  const sim = useSimulation();
  const { phase, decision, timestamp, discount, overCap, evaluation } = sim;
  const ev = evaluation.receipt.evidence;
  const freshnessLabel = ev.sourceSystem
    ? `${ev.sourceSystem} · synced ${ev.freshnessAgeDays}d ago`
    : "—";

  const statuses = deriveStatuses(phase, decision, overCap);
  const approvalActive = phase === "review" || phase === "resolved";

  // Keyboard shortcuts for smooth live driving: Space = run, R = reset.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (phase === "idle") sim.run();
      } else if (e.key === "r" || e.key === "R") {
        sim.reset();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, sim]);

  return (
    <>
      <TopHeader
        crumbs={["audit", "run_a91f-2207"]}
        title="Agent Action Review"
        live
      />

      <main className="mx-auto w-full max-w-[1180px] flex-1 px-5 py-6 sm:px-7 sm:py-8">
          {/* ---------- Run console (window-chrome hero) ---------- */}
          <RunConsole
            phase={phase}
            revealedActions={sim.revealedActions}
            onRun={sim.run}
            onReset={sim.reset}
          />

          {/* ---------- Two-column workspace ---------- */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {/* Left: the action flow */}
            <div className="min-w-0 space-y-6 xl:col-span-2">
              <section>
                <SectionLabel index="B" title="Agent plan" hint="intended actions" />
                <ActionPlanTimeline
                  statuses={statuses}
                  revealed={sim.revealedActions}
                  generating={phase === "planning"}
                />
              </section>

              <section>
                <SectionLabel index="C" title="Policy engine" hint="authority checks" />
                <PolicyCheckPanel
                  revealed={sim.revealedPolicies}
                  discount={discount}
                  setDiscount={sim.setDiscount}
                  overCap={overCap}
                  interactive={phase === "review"}
                />
              </section>

              <section>
                <SectionLabel index="D" title="Approval" hint="human-in-the-loop" />
                <ApprovalRequestCard
                  active={approvalActive}
                  discount={discount}
                  overCap={overCap}
                  decision={decision}
                  onApprove={() => sim.decide("approved")}
                  onEdit={() => sim.decide("edited")}
                  onException={() => sim.decide("exception")}
                  onReject={() => sim.decide("rejected")}
                />
              </section>

              <section>
                <SectionLabel index="E" title="Action receipt" hint="signed artifact" />
                {decision && timestamp ? (
                  <ActionReceipt
                    decision={decision}
                    timestamp={timestamp}
                    discount={discount}
                    evidenceHash={evaluation.receipt.evidenceHash}
                    signature={evaluation.receipt.signature}
                    riskScore={evaluation.receipt.riskScore}
                    freshness={freshnessLabel}
                  />
                ) : (
                  <div className="card flex flex-col items-center justify-center gap-1.5 px-6 py-9 text-center">
                    <ReceiptText className="h-4 w-4 text-white/25" />
                    <p className="text-[13px] font-medium text-white/55">
                      No receipt yet
                    </p>
                    <p className="max-w-xs text-[12px] text-white/35">
                      A signed, replayable receipt is minted the moment the action
                      is resolved.
                    </p>
                  </div>
                )}
              </section>
            </div>

            {/* Right: identity + trust + audit context */}
            <div className="min-w-0 space-y-6">
              <section>
                <SectionLabel index="A" title="Agent identity" hint="verified" />
                <AgentIdentityCard />
              </section>

              <section>
                <SectionLabel index="F" title="Trust report" />
                <TrustScoreCard active={phase === "resolved"} />
              </section>

              <section>
                <SectionLabel index="G" title="Audit trail" />
                <AuditTimeline
                  phase={phase}
                  decision={decision}
                  timestamp={timestamp}
                  overCap={overCap}
                  discount={discount}
                />
              </section>
            </div>
          </div>

          {/* ---------- Final CTA ---------- */}
          <section className="mt-6">
            <FinalCTA onReset={sim.reset} />
          </section>

          <footer className="mt-8 flex flex-col items-start justify-between gap-2 border-t border-white/[0.06] pt-5 font-mono text-[11px] text-white/30 sm:flex-row sm:items-center">
            <span>AgentGovernance — control plane for agentic actions</span>
            <span>demo build · mock data · no external calls</span>
          </footer>
      </main>
    </>
  );
}
