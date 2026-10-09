export interface ProjectReadSession { token: string; expiresAt: string }
export function projectReadSession(value: unknown, at: number): ProjectReadSession {
  const v = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const remaining = typeof v?.expiresAt === "string" ? Date.parse(v.expiresAt) - at : NaN;
  if (!v || Object.keys(v).sort().join() !== "expiresAt,token" || typeof v.token !== "string"
    || !/^[a-zA-Z0-9_.~+/-]{16,16384}={0,2}$/.test(v.token) || !Number.isFinite(remaining) || remaining < 30_000 || remaining > 3_600_000)
    throw Error("Discovery credential unavailable");
  return { token: v.token, expiresAt: v.expiresAt as string };
}
export async function projectCredential<T>(acquire: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(Error("Discovery credential deadline reached"));
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve().then(() => acquire(signal)).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
// Internal GET/JSON transport. Provider adapters must first bind a fixed native
// destination and validate the scoped short-lived credential. No redirect or
// response URL can choose a new destination; no raw provider errors are exposed.
export async function boundedProjectJson(url: string, token: string, signal: AbortSignal, transport: typeof fetch = fetch): Promise<Record<string, unknown>> {
    let response: Response | undefined;
    try {
      signal.throwIfAborted();
      response = await transport(url, { method: "GET", redirect: "manual", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal });
      if (response.status !== 200 || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) throw Error();
      const length = response.headers.get("content-length");
      if (length !== null && (!/^[0-9]{1,10}$/.test(length) || Number(length) > 1_048_576)) throw Error();
      if (!response.body) throw Error();
      const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
      try {
        for (;;) {
          const part = await reader.read(); if (part.done) break;
          bytes += part.value.length;
          if (bytes > 1_048_576 || signal.aborted) throw Error();
          chunks.push(part.value);
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw Error();
      return value;
    } catch {
      if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {});
      throw Error("Read-only cloud response unavailable"); // No raw error, body, URL or token.
    }
  }
