/** Proposed read-only onboarding metadata, never atomic-write conformance or authority. */
export interface QuoteContractBinding {
  origin: string; sandboxId: string; workspaceId: string; quoteId: string;
  quoteBinding: string; emailBinding: string; contractVersion: number;
}
export interface QuoteContractAdvertisement {
  contract: "quote-provider-advertisement-1"; contractVersion: number;
  workspaceId: string; quoteId: string; quoteBinding: string; emailBinding: string;
  quoteWrite: "quote-conditional-write-1"; quoteLookup: "quote-effect-lookup-1";
  quoteReadback: "quote-effect-readback-1"; emailRequest: "quote-email-request-1";
}
export interface QuoteContractProbe {
  status: "advertised" | "unsupported" | "unavailable";
  conformanceEstablished: false; executionEligible: false;
}
const result = (status: QuoteContractProbe["status"]): QuoteContractProbe =>
  Object.freeze({ status, conformanceEstablished: false, executionEligible: false });
const id = /^[A-Za-z0-9_-]{1,64}$/, hash = /^[a-f0-9]{64}$/;
const keys = ["origin", "sandboxId", "workspaceId", "quoteId", "quoteBinding", "emailBinding", "contractVersion"];
function plain(value: unknown, names: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(value).length === names.length && names.every(key => {
    const d = descriptors[key]; return d && Object.hasOwn(d, "value") && d.enumerable;
  });
}
function version(value: unknown): boolean { return Number.isSafeInteger(value) && (value as number) >= 1; }
function binding(value: unknown): Readonly<QuoteContractBinding> | null {
  if (!plain(value, keys) || !["https://fetchsandbox.com", "https://stage.fetchsandbox.com", "http://127.0.0.1:8019"].includes(value.origin as string) ||
    typeof value.sandboxId !== "string" || !/^[a-f0-9]{10}$/.test(value.sandboxId) ||
    ![value.workspaceId, value.quoteId].every(v => typeof v === "string" && id.test(v)) ||
    ![value.quoteBinding, value.emailBinding].every(v => typeof v === "string" && hash.test(v)) ||
    value.quoteBinding === value.emailBinding || !version(value.contractVersion)) return null;
  return Object.freeze({ ...value }) as unknown as Readonly<QuoteContractBinding>;
}
/** Exact match is an advertisement only. A declaration cannot prove atomicity/durability. */
export function inspectQuoteContractAdvertisement(value: unknown, expected: unknown): QuoteContractProbe {
  const b = binding(expected);
  const names = ["contract", "contractVersion", "workspaceId", "quoteId", "quoteBinding", "emailBinding", "quoteWrite", "quoteLookup", "quoteReadback", "emailRequest"];
  if (!b || !plain(value, names) || value.contract !== "quote-provider-advertisement-1" ||
    value.quoteWrite !== "quote-conditional-write-1" || value.quoteLookup !== "quote-effect-lookup-1" ||
    value.quoteReadback !== "quote-effect-readback-1" || value.emailRequest !== "quote-email-request-1" ||
    ["contractVersion", "workspaceId", "quoteId", "quoteBinding", "emailBinding"].some(k => value[k] !== b[k as keyof QuoteContractBinding]))
    return result("unsupported");
  return result("advertised");
}
/**
 * Trusted server use only; never pass browser/model settings or credentials here.
 * The route is proposed and currently unsupported by the contacts-only provider.
 * GET only: no quote mutation, enrollment, approval, action retry or dispatch.
 * Snapshot configuration before awaiting credentials; recheck enrolled versions
 * independently before any later submission. Tokens/bodies/errors are never returned.
 */
export async function probeQuoteContract(configured: unknown, credential: () => Promise<string>, timeoutMs = 1500): Promise<QuoteContractProbe> {
  const b = binding(configured);
  if (!b || typeof credential !== "function" || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000)
    return result("unsupported");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(Error("Quote metadata unavailable")); }, timeoutMs);
  });
  try {
    const token = await Promise.race([credential(), deadline]);
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{16,256}$/.test(token)) return result("unsupported");
    const response = await Promise.race([fetch(`${b.origin}/sandbox/${b.sandboxId}/.well-known/looplabs-quote-contract`, {
      method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      redirect: "error", credentials: "omit", cache: "no-store", signal: controller.signal,
    }), deadline]);
    if ([404, 405, 501].includes(response.status)) return result("unsupported");
    if (!response.ok || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") || "")) return result("unavailable");
    const length = response.headers.get("content-length");
    if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > 16_384)) return result("unavailable");
    const reader = response.body?.getReader();
    if (!reader) return result("unavailable");
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await Promise.race([reader.read(), deadline]);
        if (done) break;
        size += value.byteLength;
        if (size > 16_384) { controller.abort(); return result("unavailable"); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    return inspectQuoteContractAdvertisement(JSON.parse(Buffer.concat(chunks).toString("utf8")), b);
  } catch { return result("unavailable"); }
  finally { clearTimeout(timer); controller.abort(); }
}
