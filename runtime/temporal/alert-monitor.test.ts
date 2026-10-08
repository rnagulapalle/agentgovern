import { expect, it } from "vitest";
import { AlertMonitor, endpoint, initialState, observation, parseState } from "./alert-monitor";
it("sanitizes restored state and refuses malformed or unbounded journals", () => {
  const state = initialState();
  expect(parseState({ ...state, secret: "never-forward" })).toEqual(state);
  for (const bad of [null, {}, { ...state, version: 2 }, { ...state, roles: {} }, { ...state, pending: [{}] }, { ...state, pending: Array(1001).fill({}) }, { ...state, roles: { ...state.roles, worker: { failures: 4 } } }]) expect(() => parseState(bad)).toThrow();
});
it("requires HTTPS and only explicitly permits credential-free loopback HTTP", () => {
  expect(endpoint("https://alerts.example/receiver", false)).toBe("https://alerts.example/receiver");
  expect(endpoint("http://127.0.0.1:9320/health/ready", true)).toContain("9320");
  for (const url of ["http://remote.example", "https://u:p@remote.example", "https://remote.example/#x", "file:///tmp/x", "garbage"]) expect(() => endpoint(url, true)).toThrow();
  expect(() => endpoint("http://localhost:9320", false)).toThrow();
});
it("treats missing, wrong-role and invented health evidence as unavailable", () => {
  expect(observation({ role: "worker", ready: true, alerts: [] }, "worker")).toEqual({ ready: true, backlog: false });
  expect(observation({ role: "scheduler", ready: true, alerts: ["dispatch_backlog_older_than_60s"] }, "scheduler").backlog).toBe(true);
  expect(observation({ role: "worker", ready: true, alerts: ["dependency_unavailable"] }, "worker").ready).toBe(false);
  for (const bad of [null, {}, { role: "scheduler", ready: true, alerts: [] }, { role: "worker", ready: "yes", alerts: [] }, { role: "worker", ready: true, alerts: ["fake"] }]) expect(() => observation(bad, "worker")).toThrow();
});
it("opens after three failures, preserves pending IDs across restart, then resolves once", async () => {
  let saved = initialState();
  const persist = async (s: typeof saved) => { saved = parseState(JSON.parse(JSON.stringify(s))); };
  let m = new AlertMonitor(initialState(), persist);
  await m.observe("worker", null, 1); await m.observe("worker", null, 2); expect(saved.pending).toHaveLength(0);
  await m.observe("worker", null, 3); expect(saved.pending).toHaveLength(1);
  const id = saved.pending[0].id;
  await expect(m.deliver(async () => { throw Error("lost response"); }, "x".repeat(32))).rejects.toThrow();
  m = new AlertMonitor(parseState(saved), persist);
  await m.observe("worker", { ready: false, backlog: false }, 4);
  expect(saved.pending.map(a => a.id)).toEqual([id]);
  const sent: string[] = [];
  await m.deliver(async (a, signature) => { expect(signature).toMatch(/^[a-f0-9]{64}$/); sent.push(a.id); }, "x".repeat(32));
  expect(sent).toEqual([id]); expect(saved.pending).toHaveLength(0);
  await m.observe("worker", { ready: true, backlog: false }, 5);
  await m.observe("worker", { ready: true, backlog: false }, 6);
  expect(saved.pending).toMatchObject([{ transition: "resolved", role: "worker", condition: "unavailable" }]);
  await expect(m.deliver(async () => {}, "short")).rejects.toThrow("32");
});
it("does not announce backlog recovery while dependencies are unavailable", async () => {
  const m = new AlertMonitor(initialState(), async () => {});
  await m.observe("scheduler", { ready: true, backlog: true }, 1);
  await m.observe("scheduler", null, 2); await m.observe("scheduler", null, 3); await m.observe("scheduler", null, 4);
  expect(m.state.pending.map(a => a.condition)).toEqual(["backlog", "unavailable"]);
  await m.observe("scheduler", { ready: true, backlog: false }, 5);
  expect(m.state.pending.slice(2)).toMatchObject([{ condition: "unavailable", transition: "resolved" }, { condition: "backlog", transition: "resolved" }]);
});
it("fails closed on persistence failure or a full queue and bounds one delivery batch", async () => {
  const m = new AlertMonitor(initialState(), async () => { throw Error("disk unavailable"); });
  await expect(m.observe("worker", null, 1)).rejects.toThrow("disk");
  const state = initialState(); state.roles.worker.failures = 2;
  state.pending = Array.from({ length: 1000 }, () => ({ id: "00000000-0000-4000-8000-000000000000", role: "worker", condition: "unavailable", transition: "opened", at: 1 }));
  const full = new AlertMonitor(state, async () => {});
  await expect(full.observe("worker", null, 3)).rejects.toThrow("queue full");
  await full.deliver(async () => {}, "x".repeat(32)); expect(state.pending).toHaveLength(980);
});
