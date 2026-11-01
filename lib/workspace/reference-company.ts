/** Synthetic business context only. This contract never creates login, grant,
 * approval, provider binding or execution authority. */
export type ReferenceEmployee = { id: string; name: string; title: string; email: string; teamId: string; managerId: string | null; status: "active" | "leave" | "departed" };
export type ReferenceTool = { id: string; name: string; ownerId: string; purpose: string; mode: "simulated"; binding: "unbound" };
export type ReferenceInfrastructure = { id: string; name: string; kind: "application" | "database" | "queue" | "storage" | "identity" | "monitoring"; environment: "sandbox"; ownerId: string };
export type ReferenceWorkflow = { id: string; name: string; purpose: string; teamId: string; ownerId: string; reviewerIds: string[]; toolIds: string[]; actions: string[]; state: "declared"; executionBinding: null };
export type ReferenceCompany = { version: "fetchsandbox-company-1"; provenance: "synthetic-reference-company"; controlPlanePartner: "LoopLabs"; employees: ReferenceEmployee[]; tools: ReferenceTool[]; infrastructure: ReferenceInfrastructure[]; workflows: ReferenceWorkflow[] };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> => record(v) && Object.keys(v).sort().join() === [...keys].sort().join();
const id = (v: unknown): v is string => typeof v === "string" && /^[a-z][a-z0-9_-]{0,63}$/.test(v);
const text = (v: unknown, max = 160): v is string => typeof v === "string" && v.trim() === v && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const unique = (items: { id: unknown }[]) => new Set(items.map(x => x.id)).size === items.length;
export function parseReferenceCompany(value: unknown, teamIds: readonly string[]): ReferenceCompany {
 const fail = (): never => { throw Error("Invalid synthetic company definition. Directory context cannot grant authority."); };
 if (!exact(value, ["version", "provenance", "controlPlanePartner", "employees", "tools", "infrastructure", "workflows"]) || value.version !== "fetchsandbox-company-1" || value.provenance !== "synthetic-reference-company" || value.controlPlanePartner !== "LoopLabs") return fail();
 const { employees, tools, infrastructure, workflows } = value;
 if (!Array.isArray(employees) || employees.length < 2 || employees.length > 500 || !Array.isArray(tools) || tools.length > 100 || !Array.isArray(infrastructure) || infrastructure.length > 100 || !Array.isArray(workflows) || workflows.length > 100) return fail();
 if (employees.some(e => !exact(e, ["id", "name", "title", "email", "teamId", "managerId", "status"]) || !id(e.id) || !text(e.name) || !text(e.title) || typeof e.email !== "string" || !/^[a-z0-9._-]+@fetchsandbox\.example$/.test(e.email) || !teamIds.includes(e.teamId as string) || !(e.managerId === null || id(e.managerId)) || !["active", "leave", "departed"].includes(String(e.status))) || !unique(employees) || new Set(employees.map(e => e.email)).size !== employees.length) return fail();
 const people = new Map<string, ReferenceEmployee>(employees.map(e => [e.id, e]));
 for (const person of employees) {
  const seen = new Set<string>([person.id]); let manager = person.managerId;
  while (manager !== null) { const current = people.get(manager); if (!current || seen.has(manager)) return fail(); seen.add(manager); manager = current.managerId; }
 }
 const active = (key: unknown) => typeof key === "string" && people.get(key)?.status === "active";
 if (tools.some(t => !exact(t, ["id", "name", "ownerId", "purpose", "mode", "binding"]) || !id(t.id) || !text(t.name) || !text(t.purpose, 500) || !active(t.ownerId) || t.mode !== "simulated" || t.binding !== "unbound") || !unique(tools)) return fail();
 if (infrastructure.some(r => !exact(r, ["id", "name", "kind", "environment", "ownerId"]) || !id(r.id) || !text(r.name) || !["application", "database", "queue", "storage", "identity", "monitoring"].includes(String(r.kind)) || r.environment !== "sandbox" || !active(r.ownerId)) || !unique(infrastructure)) return fail();
 const toolIds = new Set(tools.map(t => t.id));
 if (workflows.some(w => !exact(w, ["id", "name", "purpose", "teamId", "ownerId", "reviewerIds", "toolIds", "actions", "state", "executionBinding"]) || !id(w.id) || !text(w.name) || !text(w.purpose, 500) || !teamIds.includes(w.teamId as string) || !active(w.ownerId) || !Array.isArray(w.reviewerIds) || w.reviewerIds.length < 1 || w.reviewerIds.length > 10 || w.reviewerIds.some(r => !active(r) || r === w.ownerId) || new Set(w.reviewerIds).size !== w.reviewerIds.length || !Array.isArray(w.toolIds) || w.toolIds.length < 1 || w.toolIds.some(t => !toolIds.has(t)) || new Set(w.toolIds).size !== w.toolIds.length || !Array.isArray(w.actions) || w.actions.length < 1 || w.actions.length > 10 || w.actions.some(a => !text(a, 160)) || w.state !== "declared" || w.executionBinding !== null) || !unique(workflows)) return fail();
 return JSON.parse(JSON.stringify(value)) as ReferenceCompany;
}
