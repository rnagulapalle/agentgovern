import { ControlError } from "../durable/contracts";
// Server-enrolled fixture capability. It is never accepted from a chat/tool payload.
// Only isolated .test recipients are supported; this is not a live connector grant.
export interface RecordScope {
  version: "record-scope-1";
  workspaceId: string;
  contactId: string;
  recipient: string;
}
export function recordScope(value: unknown): Readonly<RecordScope> {
  const s = value as RecordScope;
  if (!s || typeof s !== "object" || Array.isArray(s)
    || Object.keys(s).sort().join(",") !== "contactId,recipient,version,workspaceId"
    || s.version !== "record-scope-1"
    || typeof s.workspaceId !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(s.workspaceId)
    || typeof s.contactId !== "string" || (!/^[0-9]{1,24}$/.test(s.contactId) || s.contactId === "1001")
    || typeof s.recipient !== "string" || s.recipient.length > 254
    || !/^[a-z0-9][a-z0-9._+-]*@[a-z0-9]+(?:[.-][a-z0-9]+)*\.test$/.test(s.recipient))
    throw new ControlError(409,"A server-enrolled test record and recipient are required.");
  return Object.freeze({version:s.version,workspaceId:s.workspaceId,contactId:s.contactId,recipient:s.recipient});
}
