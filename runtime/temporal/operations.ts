import { createHash } from "node:crypto";
export interface OperationsConfig {
  role: "worker" | "scheduler";
  address: string; namespace: string; taskQueue: string; buildId: string;
  healthPort: number; activitySlots: number; workflowSlots: number; pollMs: number;
  insecureLoopback: boolean; apiKey?: string; certPath?: string; keyPath?: string;
}
export function operationsConfig(env: Record<string, string | undefined>, role: string): OperationsConfig {
  if (role !== "worker" && role !== "scheduler") throw Error("Choose worker or scheduler role");
  const required = (key: string, regex: RegExp) => {
    const value = env[key]; if (!value || !regex.test(value)) throw Error(`Invalid ${key}`); return value;
  };
  const integer = (key: string, fallback: number, min: number, max: number) => {
    const raw = env[key]; const value = raw === undefined ? fallback : Number(raw);
    if ((raw !== undefined && !/^\d+$/.test(raw)) || !Number.isInteger(value) || value < min || value > max) throw Error(`Invalid ${key}`);
    return value;
  };
  const address = required("LOOPLABS_TEMPORAL_ADDRESS", /^[a-zA-Z0-9.-]+:\d{1,5}$/);
  const port = Number(address.split(":")[1]); if (port < 1 || port > 65535) throw Error("Invalid Temporal port");
  const insecureLoopback = env.LOOPLABS_TEMPORAL_ALLOW_INSECURE_LOOPBACK === "true";
  if (env.LOOPLABS_TEMPORAL_ALLOW_INSECURE_LOOPBACK && !["true", "false"].includes(env.LOOPLABS_TEMPORAL_ALLOW_INSECURE_LOOPBACK)) throw Error("Invalid loopback override");
  const local = /^(localhost|127\.0\.0\.1):/.test(address);
  const certPath = env.LOOPLABS_TEMPORAL_CERT_PATH, keyPath = env.LOOPLABS_TEMPORAL_KEY_PATH;
  const apiKey = env.LOOPLABS_TEMPORAL_API_KEY;
  if (Boolean(certPath) !== Boolean(keyPath)) throw Error("Both certificate and key paths required");
  if (insecureLoopback && (!local || apiKey || certPath)) throw Error("Insecure transport allowed only for credential-free loopback proof");
  if (!insecureLoopback && !apiKey && !certPath) throw Error("Authenticated TLS connection required");
  return {
    role, address, namespace: required("LOOPLABS_TEMPORAL_NAMESPACE", /^[a-zA-Z0-9_-]{1,128}$/),
    taskQueue: required("LOOPLABS_TEMPORAL_TASK_QUEUE", /^[a-zA-Z0-9_-]{1,128}$/),
    buildId: required("LOOPLABS_TEMPORAL_BUILD_ID", /^[a-zA-Z0-9_-]{1,128}$/),
    healthPort: integer("LOOPLABS_TEMPORAL_HEALTH_PORT", role === "worker" ? 9320 : 9321, 1024, 65535),
    activitySlots: integer("LOOPLABS_TEMPORAL_ACTIVITY_SLOTS", 5, 1, 20),
    workflowSlots: integer("LOOPLABS_TEMPORAL_WORKFLOW_SLOTS", 10, 1, 40),
    pollMs: integer("LOOPLABS_TEMPORAL_POLL_MS", 5000, 250, 30000),
    insecureLoopback, apiKey, certPath, keyPath,
  };
}
export class OperationsHealth {
  stopping = false; lastCheck = 0; healthy = false; failures = 0; started = 0;
  backlog = 0; oldestPendingSeconds = 0;
  constructor(readonly role: OperationsConfig["role"], readonly staleMs: number) {}
  success(now: number, started = 0, backlog = 0, oldestPendingSeconds = 0) {
    this.lastCheck=now; this.healthy=true; this.failures=0; this.started+=started;
    this.backlog=backlog; this.oldestPendingSeconds=oldestPendingSeconds;
  }
  failure(now: number) { this.lastCheck=now; this.healthy=false; this.failures++; }
  snapshot(now: number, running: boolean) {
    const alerts = [];
    if (!this.healthy) alerts.push("dependency_unavailable");
    if (!this.lastCheck || now-this.lastCheck > this.staleMs) alerts.push("health_check_stale");
    if (this.oldestPendingSeconds > 60) alerts.push("dispatch_backlog_older_than_60s");
    const ready = !this.stopping && running && this.healthy && !alerts.includes("health_check_stale");
    return { role:this.role, ready, stopping:this.stopping, consecutiveFailures:this.failures,
      scheduled:this.started, pending:this.backlog, oldestPendingSeconds:this.oldestPendingSeconds, alerts };
  }
}

export function verifyArtifacts(buildId: string, manifest: unknown, service: Buffer, workflow: Buffer, lockfile: Buffer) {
  const hash=createHash("sha256").update(service).update(workflow).update(lockfile).digest("hex");
  const value=manifest as { version?: unknown; artifactHash?: unknown; buildId?: unknown } | null;
  if (!value || value.version !== 1 || value.artifactHash !== hash || value.buildId !== `ack-${hash}` || buildId !== value.buildId)
    throw Error("Deployment build ID does not match packaged artifacts");
}
