import { isDeepStrictEqual } from "node:util";
import { ControlError } from "../durable/contracts";
import type { Connector, ConnectorAction, ConnectorProvider, Payload } from "./contracts";
import { acknowledgementV1 } from "./content";
import { recordScope, type RecordScope } from "./record-scope";
export interface ConnectorBody {
  properties?: { lifecyclestage: "lead" | "customer" };
  from?: string; to?: string[]; subject?: string; text?: string;
}
export interface RequestSnapshot {
  version: "prepared-request-1" | "prepared-request-2";
  scope?: Readonly<RecordScope>;
  method: "PATCH" | "POST";
  resource: string;
  sourceVersion: string | null;
  body: ConnectorBody;
}
// Source may be absent only in a not-yet-submitted preview. This creates no authority.
export function preparedRequest(connector: Connector, payload: Payload, contactId = "1001", enrolledScope?: Readonly<RecordScope>): RequestSnapshot {
  const scope = enrolledScope === undefined ? undefined : recordScope(enrolledScope);
  if (scope && scope.contactId !== contactId) throw new ControlError(409,"Request target differs from its enrolled record.");
  const representation = scope ? {version:"prepared-request-2" as const,scope} : {version:"prepared-request-1" as const};
  if (typeof contactId !== "string" || !/^[0-9]{1,24}$/.test(contactId) || !payload || typeof payload !== "object" || Array.isArray(payload))
    throw new ControlError(409, "A trusted request target is required.");
  if (connector === "crm") {
    const p = payload as { lifecycle: string; sourceVersion?: string };
    if (!["lead","customer"].includes(p.lifecycle) || (p.sourceVersion !== undefined && (typeof p.sourceVersion !== "string" || !p.sourceVersion || p.sourceVersion.length > 256)))
      throw new ControlError(409, "A trusted contact request is required.");
    return { ...representation, method:"PATCH", resource:`/crm/v3/objects/contacts/${contactId}`, sourceVersion:p.sourceVersion ?? null, body:{properties:{lifecyclestage:p.lifecycle as "lead" | "customer"}} };
  }
  if (connector !== "email" || (payload as {template:string}).template !== "case_received")
    throw new ControlError(409, "A supported message request is required.");
  return { ...representation, method:"POST", resource:"/emails", sourceVersion:null, body:{from:acknowledgementV1.from,to:[scope?.recipient ?? acknowledgementV1.recipient],subject:acknowledgementV1.subject,text:acknowledgementV1.text} };
}
export function sameRequestSnapshot(a: unknown, b: unknown) { return isDeepStrictEqual(a,b); }
export function requestMatches(provider: Pick<ConnectorProvider,"contactId" | "recordScope">, action: Pick<ConnectorAction,"connector" | "payload">) {
  try {
    if (action.connector === "crm" && !(action.payload as {sourceVersion?:string}).sourceVersion) return false;
    return sameRequestSnapshot(action.payload.request,preparedRequest(action.connector,action.payload,provider.contactId ?? "1001",provider.recordScope));
  } catch { return false; }
}
// Historical display/read-back uses the stored request, never a template fallback.
// Dispatch separately matches the enrolled provider's actual contact ID.
export function savedRequest(action: Pick<ConnectorAction,"connector" | "payload">): RequestSnapshot {
  const snapshot = action.payload?.request;
  const id = action.connector === "crm" && typeof snapshot?.resource === "string" ? /^\/crm\/v3\/objects\/contacts\/([0-9]{1,24})$/.exec(snapshot.resource)?.[1] : "1001";
  const scope = snapshot?.version === "prepared-request-2" ? snapshot.scope : undefined;
  if ((snapshot?.version === "prepared-request-2" && !scope) || !id || !requestMatches({contactId:scope?.contactId ?? id,recordScope:scope},action))
    throw new ControlError(409,"The original connector request is unavailable or unsupported. Prepare fresh work; no request was sent.");
  return structuredClone(snapshot!);
}

export function requestForDisplay(action: Pick<ConnectorAction,"connector" | "payload">) {
  try { return savedRequest(action); }
  catch (error) { if (error instanceof ControlError) return null; throw error; }
}
