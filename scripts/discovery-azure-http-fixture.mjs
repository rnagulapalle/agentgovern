// Isolated browser proof only. These native-shaped responses are not cloud reads.
// Never import this fixture into an application, worker or production command.
if (process.env.LOOPLABS_DISCOVERY_BROWSER_PROOF !== "isolated") throw Error("Explicit isolated discovery fixture required");
const nativeFetch = globalThis.fetch, endpoint = "https://company.services.ai.azure.com/api/projects/ops";
const agent = { object: "agent", id: "agent-one", name: "customer-ops" };
const version = { object: "agent.version", id: "version-one", name: "customer-ops", version: "1" };
const results = new Map([
  [`${endpoint}/agents?api-version=v1&limit=1`, { data: [agent], has_more: false }],
  [`${endpoint}/agents?api-version=v1&limit=100`, { data: [agent], has_more: false }],
  [`${endpoint}/agents/customer-ops/versions?api-version=v1&limit=100&include_drafts=false`, { data: [version], has_more: false }],
  [`${endpoint}/agents/customer-ops/versions/1?api-version=v1`, { ...version, definition: { instructions: "PRIVATE_FIXTURE_PROMPT", tools: [{ token: "PRIVATE_FIXTURE_TOKEN" }] } }],
]);
globalThis.fetch = async (input, init) => {
  const target = typeof input === "string" || input instanceof URL ? String(input) : input.url;
  const url = new URL(target);
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return nativeFetch(input, init);
  init?.signal?.throwIfAborted();
  if (init?.method !== "GET" || init?.redirect !== "manual" || init?.headers?.Authorization !== "Bearer DUMMY_AZURE_BROWSER_READ_TOKEN_123456"
    || !results.has(target)) throw Error("Isolated discovery HTTP request refused");
  return Response.json(results.get(target));
};
