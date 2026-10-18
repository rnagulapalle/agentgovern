import type { PoolClient } from "pg";
import { ControlError, type Actor } from "../durable/contracts";

// Trusted server composition only. Scheduling never grants connector authority.
export interface OrchestrationAdmission {
  assertReady(client: PoolClient): Promise<void>;
  transfer(actor: Actor, runId: string): Promise<string>;
}
export function requireAdmission(admission?: OrchestrationAdmission): OrchestrationAdmission {
  if (!admission) throw new ControlError(409, "Record-scoped background execution needs a compatible worker contract. No new work was submitted.");
  return admission;
}
