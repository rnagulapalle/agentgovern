"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatTime } from "./utils";
import type { Decision, Phase } from "./types";
import {
  DISCOUNT_POLICY,
  PLANNED_ACTIONS,
  POLICY_CHECKS,
  RUN_NOW,
  JOHN_SOURCE,
} from "./mock-data";
import { evaluate, SDR_AGENT_17, type ActionRequest } from "./engine";

const ACTION_COUNT = PLANNED_ACTIONS.length;
const POLICY_COUNT = POLICY_CHECKS.length;

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
 * Drives the staged "live agent run" used by the demo:
 *   idle → planning (actions stream in) → policy (rules evaluate) → review → resolved
 *
 * Built for screen-recording: one `run()` choreographs the whole sequence with
 * realistic pacing, while the discount slider + approval buttons stay interactive.
 */
export function useSimulation() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [revealedActions, setRevealedActions] = useState(0);
  const [revealedPolicies, setRevealedPolicies] = useState(0);
  const [discount, setDiscount] = useState(DISCOUNT_POLICY.requested);
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
    for (let i = 1; i <= ACTION_COUNT; i++) {
      const n = i;
      at(t, () => setRevealedActions(n));
      t += TIMING.actionStep;
    }
    t += TIMING.toPolicy;
    at(t, () => setPhase("policy"));
    t += TIMING.policyStep;
    for (let i = 1; i <= POLICY_COUNT; i++) {
      const n = i;
      at(t, () => setRevealedPolicies(n));
      t += TIMING.policyStep;
    }
    t += TIMING.toReview;
    at(t, () => setPhase("review"));
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    setPhase("idle");
    setRevealedActions(0);
    setRevealedPolicies(0);
    setDiscount(DISCOUNT_POLICY.requested);
    setDecision(null);
    setTimestamp(null);
  }, []);

  const decide = useCallback((d: Exclude<Decision, null>) => {
    clearTimers();
    setDecision(d);
    setTimestamp(formatTime(new Date()));
    setPhase("resolved");
  }, []);

  // tidy up any in-flight timers on unmount
  useEffect(() => () => clearTimers(), []);

  // ── The slider drives the REAL engine ──────────────────────────────────
  // Build the agent's proposed action from the current discount and evaluate it.
  const emailRequest: ActionRequest = {
    id: "act_9281",
    agentId: SDR_AGENT_17.id,
    capability: "email.send",
    tool: "Gmail",
    summary: `Send follow-up email · ${discount}% discount`,
    target: "john@acme.com",
    params: { discountPct: discount },
    sourceRecord: JOHN_SOURCE,
    at: RUN_NOW,
  };
  const evaluation = evaluate(emailRequest, { agent: SDR_AGENT_17, now: RUN_NOW });
  const overCap = evaluation.decision === "require_approval";

  return {
    phase,
    revealedActions,
    revealedPolicies,
    discount,
    setDiscount,
    decision,
    timestamp,
    overCap,
    evaluation,
    run,
    reset,
    decide,
  };
}
