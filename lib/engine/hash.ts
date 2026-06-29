/**
 * Deterministic hashing + demo signing for receipts.
 *
 * Uses FNV-1a (no crypto dependency, identical in Node and the browser) so the
 * engine is fully deterministic and testable. In production this is where a real
 * sha-256 + ed25519 signature would go — the receipt shape stays the same.
 */

function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Stable JSON: object keys sorted, so equal evidence always hashes equal. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

function hex(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}

/** Deterministic 0x… evidence hash (16 hex chars). */
export function evidenceHash(evidence: unknown): string {
  const json = stableStringify(evidence);
  return "0x" + hex(fnv1a(json)) + hex(fnv1a("at:" + json));
}

/** Deterministic demo signature derived from the hash + signer. */
export function signEvidence(hash: string, signer: string): string {
  const a = hex(fnv1a("sig:" + hash + ":" + signer));
  const b = hex(fnv1a("sig2:" + signer + ":" + hash));
  return "ed25519:" + a + b;
}

/** Short, stable receipt id from the action id. */
export function receiptId(actionId: string): string {
  return "rcpt_" + hex(fnv1a("rcpt:" + actionId)).slice(0, 6);
}
