"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  controlReducer,
  initialState,
  outputCheck,
  type ControlAction,
  type ControlState,
} from "@/lib/control-plane/model";
import { track } from "@/lib/analytics";

const KEY = "looplabs.control-plane.v1";
const LEGACY_KEY = "agentgovern.control-plane.v1";
type InputAction = ControlAction extends infer A
  ? A extends ControlAction
    ? Omit<A, "at" | "id">
    : never
  : never;
interface ContextValue {
  state: ControlState;
  ready: boolean;
  send: (action: InputAction) => void;
  toast: string;
  notify: (text: string) => void;
  reset: () => void;
}
const Context = createContext<ContextValue | null>(null);
export function ControlProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ControlState>(() =>
    initialState("2026-09-29T16:30:00Z"),
  );
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const notify = useCallback((text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  }, []);
  useEffect(() => {
    try {
      // Carry existing demo work forward when the product name changes.
      const saved = JSON.parse(
        localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY) ?? "null",
      );
      if (
        saved?.schema === 1 &&
        [
          "agents",
          "runs",
          "approvals",
          "policies",
          "incidents",
          "audit",
          "outputs",
        ].every((k) => Array.isArray(saved[k])) &&
        saved.records
      )
        setState(saved);
      else setState(initialState());
    } catch {
      setState(initialState());
    }
    setReady(true);
    return () => clearTimeout(toastTimer.current);
  }, []);
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch {
        notify(
          "Browser storage is unavailable. Changes will last for this session.",
        );
      }
    }
  }, [state, ready, notify]);
  const send = useCallback((action: InputAction) => {
    if (action.type === "onboard") {
      track("agent_onboarded", {
        role: action.agent.role,
        team: action.agent.team,
        model_tier: action.agent.tier,
        delegated: Boolean(action.agent.parentId),
        tool_count: action.agent.tools.length,
      });
    } else if (action.type === "simulate") {
      const policy = state.policies.find((item) => item.id === "discount");
      const outcome =
        action.sourceAge > 14
          ? "blocked"
          : action.discount > (policy?.threshold ?? 10)
            ? "held"
            : "allowed";
      track("run_simulated", {
        outcome,
        discount: action.discount,
        source_age_days: action.sourceAge,
      });
    } else if (action.type === "approval") {
      track("approval_decided", { decision: action.decision });
    } else if (action.type === "output") {
      track("output_evaluated", {
        outcome: outputCheck(action.text).status,
        character_count: action.text.length,
      });
    } else if (["contain", "plan", "reconcile"].includes(action.type)) {
      track("recovery_step_completed", { step: action.type });
      if (action.type === "reconcile") track("activation_milestone_reached", { milestone: "state_recovered" });
    } else if (action.type === "agent_status") {
      track("agent_status_changed", { status: action.status });
    } else if (action.type === "terminate") {
      track("run_terminated", {});
    } else if (action.type === "policy") {
      track("policy_updated", { policy_id: action.policyId });
    } else if (action.type === "budget") {
      track("agent_budget_updated", { budget: action.budget });
    }
    setState((s) =>
      controlReducer(s, {
        ...action,
        at: new Date().toISOString(),
        id: crypto.randomUUID().slice(0, 8),
      } as ControlAction),
    );
  }, [state.policies]);
  const reset = () => {
    track("demo_reset", {});
    setState(initialState());
    notify("Demo workspace restored to its starting state.");
  };
  return (
    <Context.Provider value={{ state, ready, send, toast, notify, reset }}>
      {children}
    </Context.Provider>
  );
}
export function useControl() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("ControlProvider is required");
  return ctx;
}
