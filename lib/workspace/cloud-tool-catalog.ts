import { createHash } from "node:crypto";
import { preserveRuntimeInventory, type DiscoveredRuntime } from "./cloud-discovery";

/** Trusted server transport only. This interface cannot invoke tools or grant authority. */
export interface ToolCatalogApi {
  listTools(input: { cursor?: string }): Promise<unknown>;
}
export interface DeclaredTool {
  name: string;
  title: string | null;
  description: string | null;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown> | null;
  descriptorHash: string;
}
export interface ToolCatalogSnapshot {
  runtimeArn: string;
  runtimeVersion: string;
  observedAt: string;
  sourceBinding: string;
  completeness: "complete-api-traversal" | "partial";
  tools: DeclaredTool[];
  failures: ("unavailable" | "invalid-page" | "invalid-tool" | "duplicate-tool" | "pagination-cycle" | "page-limit")[];
  authority: "not-established";
  activity: "not-observed";
  schemaConformance: "not-established";
}
const plain = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const label = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (plain(v)) return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
function schema(v: unknown): Record<string, unknown> | null {
  // JSON transport snapshots only; no evaluation, $ref fetching or schema authority.
  if (!plain(v) || v.type !== "object" || Buffer.byteLength(JSON.stringify(v)) > 65_536) return null;
  const pending: { value: unknown; depth: number }[] = [{ value: v, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (++nodes > 2000 || depth > 16) return null;
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) pending.push({ value: child, depth: depth + 1 });
    }
  }
  return v;
}
function tool(v: unknown): DeclaredTool | null {
  if (!plain(v) || typeof v.name !== "string" || !/^[a-zA-Z0-9_.-]{1,128}$/.test(v.name)
    || (v.title !== undefined && !label(v.title, 256))
    || (v.description !== undefined && !label(v.description, 4096))) return null;
  const inputSchema = schema(v.inputSchema), outputSchema = v.outputSchema === undefined ? null : schema(v.outputSchema);
  if (!inputSchema || (v.outputSchema !== undefined && !outputSchema)) return null;
  // Annotations, icons, headers and arbitrary extension data are not imported.
  const descriptor = { name: v.name, title: typeof v.title === "string" ? v.title : null,
    description: typeof v.description === "string" ? v.description : null, inputSchema, outputSchema };
  return { ...descriptor, descriptorHash: createHash("sha256").update(canonical(descriptor)).digest("hex") };
}
/** Binding is a reviewed source reference, not an endpoint supplied by the model. */
export async function collectToolCatalog(api: ToolCatalogApi, runtime: DiscoveredRuntime, sourceBinding: string, at: string, timeoutMs = 1500): Promise<ToolCatalogSnapshot> {
  // Existing inventory validation copies the exact scope/version; its evidence grants no rights.
  const checked = preserveRuntimeInventory(null, { scope: runtime.scope, observedAt: at, completeness: "partial", records: [runtime], failures: [] });
  const pinned = checked.records[0].record;
  if (!/^[a-f0-9]{64}$/.test(sourceBinding)) throw Error("Reviewed tool source binding required");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15_000) throw Error("Bounded discovery timeout required");
  const result: ToolCatalogSnapshot = { runtimeArn: pinned.resourceArn, runtimeVersion: pinned.version, observedAt: at,
    sourceBinding, completeness: "partial", tools: [], failures: [], authority: "not-established", activity: "not-observed", schemaConformance: "not-established" };
  const names = new Set<string>(), cursors = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    let value: unknown;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Bound and snapshot native JSON before retaining any metadata.
      const raw = JSON.stringify(await Promise.race([
        api.listTools(cursor ? { cursor } : {}),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("Discovery timeout")), timeoutMs); }),
      ]));
      if (typeof raw !== "string" || Buffer.byteLength(raw) > 1_048_576) throw Error();
      value = JSON.parse(raw);
    } catch { result.failures.push("unavailable"); return result; }
    finally { clearTimeout(timer); }
    if (!plain(value) || !Array.isArray(value.tools) || value.tools.length > 100) {
      result.failures.push("invalid-page"); return result;
    }
    for (const raw of value.tools) {
      const parsed = tool(raw);
      if (!parsed) { result.failures.push("invalid-tool"); continue; }
      if (names.has(parsed.name)) { result.failures.push("duplicate-tool"); continue; }
      names.add(parsed.name); result.tools.push(parsed);
    }
    if (value.nextCursor === undefined) {
      if (!result.failures.length) result.completeness = "complete-api-traversal";
      return result;
    }
    if (typeof value.nextCursor !== "string" || !/^\S{1,2048}$/.test(value.nextCursor)) {
      result.failures.push("invalid-page"); return result;
    }
    if (cursors.has(value.nextCursor)) { result.failures.push("pagination-cycle"); return result; }
    cursors.add(value.nextCursor); cursor = value.nextCursor;
  }
  result.failures.push("page-limit"); return result;
}
