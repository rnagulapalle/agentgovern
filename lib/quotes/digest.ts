import { ControlError } from "../durable/contracts";
import { digest } from "../workspace/identity";

function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${Array.from(value).map(canonical).join(",")}]`;
  if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
      Reflect.ownKeys(value).every(k => typeof k === "string") &&
      Object.values(Object.getOwnPropertyDescriptors(value)).every(d => Object.hasOwn(d, "value") && d.enumerable)) {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(k => `${JSON.stringify(k)}:${canonical(object[k])}`).join(",")}}`;
  }
  throw new ControlError(409, "Exact JSON proposal content is required.");
}
export function quotePlanDigest(value: unknown): string {
  const text = canonical(value);
  if (Buffer.byteLength(text) > 65_536) throw new ControlError(409, "Quote proposal exceeds the bounded content limit.");
  return digest(`looplabs-quote-proposal-1\n${text}`);
}
