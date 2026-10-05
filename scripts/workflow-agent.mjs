// External agent example: talks to LoopLabs HTTP only; never receives provider credentials.
const base = process.env.LOOPLABS_AGENT_ORIGIN || "http://localhost:3007";
if (
  !/^https:\/\/looplabs\.run$|^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(
    base,
  )
)
  throw Error("Use the local or canonical LoopLabs origin.");
const key = process.env.LOOPLABS_AGENT_KEY,
  run = process.env.LOOPLABS_RUN_ID;
if (!key || !run)
  throw Error(
    "Set LOOPLABS_AGENT_KEY and LOOPLABS_RUN_ID privately in your environment.",
  );
const headers = {
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};
async function request(path, options = {}) {
  const r = await fetch(base + path, { headers, ...options });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Request refused");
  return data;
}
const plan = await request(
  `/api/durable/workflows?run=${encodeURIComponent(run)}`,
);
for (const s of plan.steps) {
  const result = await request("/api/durable/connectors", {
    method: "POST",
    body: JSON.stringify({
      operation: "propose",
      actionId: s.action_id,
      agentId: s.agent_id,
      connector: s.connector,
      payload: s.payload,
    }),
  });
  console.log(
    JSON.stringify({
      runId: run,
      step: s.ordinal,
      state: result.state,
      actionId: result.id,
    }),
  );
}
