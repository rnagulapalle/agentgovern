/** Provider declarations only: never company membership, ownership authority or permissions. */
export interface CloudRuntimeMetadata {
  schemaVersion: "1" | "2";
  source: "aws-runtime-declaration";
  metadataVersion: string | null;
  organization: string | null;
  ownerOrganization: string | null;
  ownerTeam: string | null;
  environment: "production" | "staging" | "sandbox" | "development" | "test" | null;
  onCallStatus: "assigned" | "unassigned" | null;
  owner?: string | null;
  department?: string | null;
  purpose?: string | null;
}
const plain = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
function label(v: unknown): string | null {
  return typeof v === "string" && v.length <= 160 && /^[A-Za-z0-9][A-Za-z0-9 /&().,_-]*$/.test(v)
    && !/(?:AKIA|ASIA)[A-Z0-9]{16}|Bearer|xox[baprs]-|secret|password|token|private.key/i.test(v) ? v : null;
}
/** Called only after the detail's account, ARN and version match the discovered runtime. */
export function projectRuntimeMetadata(value: unknown): CloudRuntimeMetadata | null {
  if (!plain(value) || Object.keys(value).some(k => !["metadataVersion", "organization", "ownerOrganization", "ownerTeam", "environment", "onCallStatus", "owner", "department", "purpose"].includes(k))) return null;
  const extended = ["owner", "department", "purpose"].some(k => Object.hasOwn(value,k));
  const projected: CloudRuntimeMetadata = {
    schemaVersion: extended ? "2" : "1", source: "aws-runtime-declaration",
    metadataVersion: typeof value.metadataVersion === "string" && /^[1-9][0-9]{0,3}$/.test(value.metadataVersion) ? value.metadataVersion : null,
    organization: label(value.organization), ownerOrganization: label(value.ownerOrganization), ownerTeam: label(value.ownerTeam),
    environment: ["production", "staging", "sandbox", "development", "test"].includes(value.environment as string) ? value.environment as CloudRuntimeMetadata["environment"] : null,
    onCallStatus: ["assigned", "unassigned"].includes(value.onCallStatus as string) ? value.onCallStatus as CloudRuntimeMetadata["onCallStatus"] : null,
    ...(extended ? {owner:label(value.owner),department:label(value.department),purpose:label(value.purpose)} : {}),
  };
  return Object.entries(projected).some(([k,v]) => k !== "schemaVersion" && k !== "source" && v !== null) ? projected : null;
}
export function validStoredRuntimeMetadata(value: unknown): value is CloudRuntimeMetadata | null {
  if (value === null) return true;
  if (!plain(value) || !["1","2"].includes(String(value.schemaVersion)) || value.source !== "aws-runtime-declaration") return false;
  const fields = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "schemaVersion" && key !== "source"));
  const projected = projectRuntimeMetadata(fields);
  return projected !== null && Object.keys(value).length === Object.keys(projected).length
    && Object.entries(projected).every(([key, field]) => value[key] === field);
}
