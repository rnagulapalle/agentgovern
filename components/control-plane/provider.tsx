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
  type ControlAction,
  type ControlState,
} from "@/lib/control-plane/model";

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
    setState((s) =>
      controlReducer(s, {
        ...action,
        at: new Date().toISOString(),
        id: crypto.randomUUID().slice(0, 8),
      } as ControlAction),
    );
  }, []);
  const reset = () => {
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
