"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatTime } from "./utils";
import type { Decision, Phase } from "./types";
import type { Scenario } from "./scenarios";
import { evaluate } from "./engine";

/**
 * Playback pacing (ms). Tuned slow + cinematic so each beat is readable on a
 * screen recording. Bump these down for a snappier feel, up for slower.
 */
const TIMING = {
  startDelay: 900, // beat before the first action streams in
  actionStep: 850, // gap between planned actions appearing
  toPolicy: 700, // pause after the plan, before policy evaluation
  policyStep: 750, // gap between policy rules resolving
  toReview: 650, // pause after policy, before the approval is live
};

/**
 * Drives the staged "live agent run" for one Scenario:
 *   idle → planning (actions stream in) → policy (rules evaluate) → review → resolved
 *
 * The single control (discount / record-age slider) builds a real ActionRequest
 * and runs it through the engine, so the verdict, risk, evidence and receipt are
 * all genuine — not scripted.
 */
export function useSimulation(scenario: Scenario) {
  const actionCount = scenario.plannedActions.length;
  // reveal each context row + the one governed row
  const policyCount = scenario.policyRows.length + 1;

  const [phase, setPhase] = useState<Phase>("idle");
  const [revealedActions, setRevealedActions] = useState(0);
  const [revealedPolicies, setRevealedPolicies] = useState(0);
  const [controlValue, setControlValue] = useState(scenario.control.default);
  const [decision, setDecision] = useState<Decision>(null);
  const [timestamp, setTimestamp] = useState<string | null>(null);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const at = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const run = useCallback(() => {
    clearTimers();
    setDecision(null);
    setTimestamp(null);
    setRevealedActions(0);
    setRevealedPolicies(0);
    setPhase("planning");

    let t = TIMING.startDelay;
    for (let i = 1; i <= actionCount; i++) {
      const n = i;
      at(t, () => setRevealedActions(n));
      t += TIMING.actionStep;
    }
    t += TIMING.toPolicy;
    at(t, () => setPhase("policy"));
    t += TIMING.policyStep;
    for (let i = 1; i <= policyCount; i++) {
      const n = i;
      at(t, () => setRevealedPolicies(n));
      t += TIMING.policyStep;
    }
    t += TIMING.toReview;
    at(t, () => setPhase("review"));
  }, [actionCount, policyCount]);

  const reset = useCallback(() => {
    clearTimers();
    setPhase("idle");
    setRevealedActions(0);
    setRevealedPolicies(0);
    setControlValue(scenario.control.default);
    setDecision(null);
    setTimestamp(null);
  }, [scenario]);

  const decide = useCallback((d: Exclude<Decision, null>) => {
    clearTimers();
    setDecision(d);
    setTimestamp(formatTime(new Date()));
    setPhase("resolved");
  }, []);

  // tidy up any in-flight timers on unmount / scenario switch
  useEffect(() => () => clearTimers(), []);

  // ── The slider drives the REAL engine ──────────────────────────────────
  const evaluation = useMemo(() => {
    const request = scenario.buildRequest(controlValue);
    return evaluate(request, { agent: scenario.agent, now: scenario.now });
  }, [scenario, controlValue]);

  const decision3 = evaluation.decision; // "allow" | "require_approval" | "block"
  const over = decision3 !== "allow";
  const needsHuman = decision3 === "require_approval";
  const blocked = decision3 === "block";

  return {
    phase,
    revealedActions,
    revealedPolicies,
    controlValue,
    setControlValue,
    decision,
    timestamp,
    over,
    needsHuman,
    blocked,
    decision3,
    evaluation,
    run,
    reset,
    decide,
  };
}
