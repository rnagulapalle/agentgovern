"use client";

import { useEffect, useState } from "react";
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
import { SCENARIOS, getScenario, type Scenario } from "@/lib/scenarios";
import type { Decision, Phase } from "@/lib/types";
import { useSimulation } from "@/lib/use-simulation";
import { cn } from "@/lib/utils";

/** Derive each action's live status from the run phase + human decision. */
function deriveStatuses(
  scenario: Scenario,
  phase: Phase,
  decision: Decision,
  over: boolean,
  blocked: boolean
): Record<ActionId, ActionStatus> {
  const statuses = {} as Record<ActionId, ActionStatus>;
  for (const a of scenario.plannedActions) {
    statuses[a.id] = phase === "resolved" ? "executed" : "auto-approved";
  }
  const gid = scenario.governedActionId;
  if (phase === "resolved") {
    statuses[gid] =
      decision === "rejected"
        ? "rejected"
        : decision === "exception"
          ? "executed-exception"
          : "executed"; // approved | edited
  } else {
    statuses[gid] = over ? (blocked ? "blocked" : "requires-approval") : "auto-approved";
  }
  return statuses;
}

/** Tabs to switch between governance scenarios. */
function ScenarioSwitcher({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <span className="label mr-1">Scenario</span>
      {SCENARIOS.map((s, i) => {
        const selected = s.id === active;
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            aria-pressed={selected}
            className={cn(
              "group flex items-center gap-2 rounded-lg border px-3 py-1.5 text-left transition-colors",
              selected
                ? "border-indigo-400/30 bg-indigo-500/[0.1]"
                : "border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05]"
            )}
          >
            <span
              className={cn(
                "font-mono text-[10px]",
                selected ? "text-indigo-300" : "text-white/30"
              )}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  "block text-[13px] font-medium leading-tight",
                  selected ? "text-white" : "text-white/75"
                )}
              >
                {s.tab}
              </span>
              <span className="block font-mono text-[10px] text-white/35">{s.tabHint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** One scenario run — remounted (via key) when the scenario changes. */
function DemoRun({ scenario }: { scenario: Scenario }) {
  const sim = useSimulation(scenario);
  const { phase, decision, timestamp, controlValue, over, blocked, evaluation } = sim;
  const ev = evaluation.receipt.evidence;
  const freshnessLabel = ev.sourceSystem
    ? `${ev.sourceSystem} · synced ${ev.freshnessAgeDays}d ago`
    : "—";

  const statuses = deriveStatuses(scenario, phase, decision, over, blocked);
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
      {/* ---------- Run console (window-chrome hero) ---------- */}
      <RunConsole
        scenario={scenario}
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
              actions={scenario.plannedActions}
              statuses={statuses}
              revealed={sim.revealedActions}
              generating={phase === "planning"}
            />
          </section>

          <section>
            <SectionLabel index="C" title="Policy engine" hint="authority checks" />
            <PolicyCheckPanel
              rows={scenario.policyRows}
              control={scenario.control}
              revealed={sim.revealedPolicies}
              value={controlValue}
              setValue={sim.setControlValue}
              over={over}
              interactive={phase === "review"}
              evalMs={sim.evalMs}
            />
          </section>

          <section>
            <SectionLabel index="D" title="Approval" hint="human-in-the-loop" />
            <ApprovalRequestCard
              scenario={scenario}
              active={approvalActive}
              value={controlValue}
              over={over}
              riskScore={evaluation.riskScore}
              decision={decision}
              onDecide={sim.decide}
            />
          </section>

          <section>
            <SectionLabel index="E" title="Action receipt" hint="signed artifact" />
            {decision && timestamp ? (
              <ActionReceipt
                scenario={scenario}
                decision={decision}
                timestamp={timestamp}
                value={controlValue}
                evidenceHash={evaluation.receipt.evidenceHash}
                signature={evaluation.receipt.signature}
                riskScore={evaluation.receipt.riskScore}
                freshness={freshnessLabel}
              />
            ) : (
              <div className="card flex flex-col items-center justify-center gap-1.5 px-6 py-9 text-center">
                <ReceiptText className="h-4 w-4 text-white/25" />
                <p className="text-[13px] font-medium text-white/55">No receipt yet</p>
                <p className="max-w-xs text-[12px] text-white/35">
                  A signed, replayable receipt is minted the moment the action is resolved.
                </p>
              </div>
            )}
          </section>
        </div>

        {/* Right: identity + trust + audit context */}
        <div className="min-w-0 space-y-6">
          <section>
            <SectionLabel index="A" title="Agent identity" hint="verified" />
            <AgentIdentityCard agent={scenario.agentCard} />
          </section>

          <section>
            <SectionLabel index="F" title="Trust report" />
            <TrustScoreCard active={phase === "resolved"} />
          </section>

          <section>
            <SectionLabel index="G" title="Audit trail" />
            <AuditTimeline
              scenario={scenario}
              phase={phase}
              decision={decision}
              startedAt={sim.startedAt}
              resolvedAt={sim.resolvedAt}
              over={over}
              value={controlValue}
            />
          </section>
        </div>
      </div>

      {/* ---------- Final CTA ---------- */}
      <section className="mt-6">
        <FinalCTA onReset={sim.reset} receipt={evaluation.receipt} />
      </section>
    </>
  );
}

export default function AgentGovernanceDemoPage() {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const scenario = getScenario(scenarioId);

  return (
    <>
      <TopHeader crumbs={["audit", scenario.runId]} title="Agent Action Review" live />

      <main className="mx-auto w-full max-w-[1180px] flex-1 px-5 py-6 sm:px-7 sm:py-8">
        <ScenarioSwitcher active={scenarioId} onSelect={setScenarioId} />

        <DemoRun key={scenario.id} scenario={scenario} />

        <footer className="mt-8 flex flex-col items-start justify-between gap-2 border-t border-white/[0.06] pt-5 font-mono text-[11px] text-white/30 sm:flex-row sm:items-center">
          <span>AgentGovernance — control plane for agentic actions</span>
          <span>Sample data · your policies run in production</span>
        </footer>
      </main>
    </>
  );
}
