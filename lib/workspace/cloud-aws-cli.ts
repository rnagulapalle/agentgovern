import { execFile } from "node:child_process";
import type { AwsRuntimeInventoryApi } from "./cloud-discovery";
import type { AwsInvocationLogsApi } from "./cloud-invocation-reader";

export interface DiscoverySession {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiresAt: string;
}
const runtimeId = /^[a-zA-Z][a-zA-Z0-9_]{0,47}-[a-zA-Z0-9]{10}$/;
export function discoverySession(value: unknown, now = Date.now()): DiscoverySession {
  const credentials = value as DiscoverySession;
  const remaining = typeof credentials?.expiresAt === "string" ? Date.parse(credentials.expiresAt) - now : NaN;
  if (!credentials || Object.keys(credentials).sort().join() !== "accessKeyId,expiresAt,secretAccessKey,sessionToken"
    || typeof credentials.accessKeyId !== "string" || !/^ASIA[A-Z0-9]{16}$/.test(credentials.accessKeyId)
    || typeof credentials.secretAccessKey !== "string" || !/^[A-Za-z0-9/+=]{40}$/.test(credentials.secretAccessKey)
    || typeof credentials.sessionToken !== "string" || !/^[A-Za-z0-9/+=]{16,16384}$/.test(credentials.sessionToken)
    || !Number.isFinite(remaining) || remaining < 30_000 || remaining > 3_600_000)
    throw new Error("Current short-lived discovery session required");
  return { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey, sessionToken: credentials.sessionToken, expiresAt: credentials.expiresAt };
}
// An administrator-owned AWS CLI v2 signs requests. Never accept a client-supplied
// executable, endpoint, profile or command. This bridge does not acquire authority.
export interface AwsReadOptions {
  executable: string;
  region: string;
  accountId?: string;
  session: () => Promise<DiscoverySession>;
  now?: () => number;
}
function signedRead(options: AwsReadOptions) {
  const { executable, region, session } = options, now = options.now ?? Date.now;
  if (!/^\/[a-zA-Z0-9_./-]{1,512}$/.test(executable) || executable.split("/").includes("..")
    || !/^[a-z]{2}-[a-z]+-[1-9]$/.test(region) || typeof session !== "function")
    throw new Error("Explicit trusted discovery transport required");
  async function read(service: string, operation: string, input: object, query: string): Promise<unknown> {
    let credentials: DiscoverySession;
    try { credentials = await session(); } catch { throw new Error("Discovery credentials unavailable"); }
    credentials = discoverySession(credentials, now());
    // No ambient credentials, custom endpoints/proxies, credential-process, CLI
    // history or AWS config inheritance. Credentials exist only in the child env.
    const env = {
      PATH: "/usr/bin:/bin", HOME: "/nonexistent", LANG: "C.UTF-8", NODE_ENV: "production" as const,
      AWS_CONFIG_FILE: "/dev/null", AWS_SHARED_CREDENTIALS_FILE: "/dev/null",
      AWS_EC2_METADATA_DISABLED: "true", AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: "true",
      AWS_ACCESS_KEY_ID: credentials.accessKeyId, AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
      AWS_SESSION_TOKEN: credentials.sessionToken, AWS_MAX_ATTEMPTS: "1", AWS_PAGER: "",
    };
    const args = [service, operation, "--region", region, "--output", "json", "--no-paginate",
      "--no-cli-pager", "--no-cli-auto-prompt", "--cli-connect-timeout", "5", "--cli-read-timeout", "10",
      "--cli-input-json", JSON.stringify(input), "--query", query];
    return new Promise((resolve, reject) => {
      execFile(executable, args, { env, timeout: 15_000, maxBuffer: 1_048_576, killSignal: "SIGKILL", encoding: "utf8" }, (error, stdout) => {
        // Never forward stderr, raw process errors, endpoints or credential values.
        if (error) { reject(new Error("Discovery read unavailable")); return; }
        try { resolve(JSON.parse(stdout)); } catch { reject(new Error("Discovery response invalid")); }
      });
    });
  }
  return read;
}
export function awsCliInventoryApi(options: AwsReadOptions): AwsRuntimeInventoryApi {
  const read = signedRead(options);
  return {
    callerIdentity: () => read("sts", "get-caller-identity", {}, "{Account:Account}"),
    listRuntimes: input => {
      if (!input || Object.keys(input).some(k => !["maxResults", "nextToken"].includes(k))
        || !Number.isInteger(input.maxResults) || input.maxResults < 1 || input.maxResults > 100
        || (input.nextToken !== undefined && (typeof input.nextToken !== "string" || !/^\S{1,2048}$/.test(input.nextToken))))
        return Promise.reject(new Error("Invalid discovery page request"));
      return read("bedrock-agentcore-control", "list-agent-runtimes", { ...input },
        "{agentRuntimes:agentRuntimes[].{agentRuntimeId:agentRuntimeId,agentRuntimeArn:agentRuntimeArn,agentRuntimeVersion:agentRuntimeVersion},nextToken:nextToken}");
    },
    getRuntime: input => {
      if (!input || Object.keys(input).sort().join() !== "agentRuntimeId,agentRuntimeVersion"
        || typeof input.agentRuntimeId !== "string" || !runtimeId.test(input.agentRuntimeId)
        || typeof input.agentRuntimeVersion !== "string" || !/^[1-9][0-9]{0,4}$/.test(input.agentRuntimeVersion))
        return Promise.reject(new Error("Invalid discovery runtime request"));
      return read("bedrock-agentcore-control", "get-agent-runtime", { ...input },
        "{agentRuntimeId:agentRuntimeId,agentRuntimeArn:agentRuntimeArn,agentRuntimeVersion:agentRuntimeVersion,roleArn:roleArn,workflowMetadata:{metadataVersion:environmentVariables.WORKFLOW_METADATA_VERSION,organization:environmentVariables.WORKFLOW_ORGANIZATION,ownerOrganization:environmentVariables.WORKFLOW_OWNER_ORGANIZATION,ownerTeam:environmentVariables.WORKFLOW_OWNER_TEAM,environment:environmentVariables.WORKFLOW_ENVIRONMENT,onCallStatus:environmentVariables.WORKFLOW_ONCALL_STATUS},workloadIdentityDetails:{workloadIdentityArn:workloadIdentityDetails.workloadIdentityArn}}");
    },
  };
}

// Same isolated signing transport; no public arbitrary-command API is exposed.
export function awsCliInvocationApi(options: AwsReadOptions): AwsInvocationLogsApi {
  if (typeof options.accountId !== "string" || !/^[0-9]{12}$/.test(options.accountId)) throw Error("Explicit observation account required");
  const accountId = options.accountId, region = options.region, read = signedRead(options);
  return {
    callerIdentity: () => read("sts", "get-caller-identity", {}, "{Account:Account}"),
    listEvents: input => {
      if (!input || Object.keys(input).some(k => !["logGroupName", "startTime", "endTime", "limit", "nextToken"].includes(k))
        || typeof input.logGroupName !== "string" || !/^\/aws\/bedrock-agentcore\/runtimes\/[A-Za-z0-9_-]{1,220}$/.test(input.logGroupName)
        || !Number.isSafeInteger(input.startTime) || input.startTime < 0 || !Number.isSafeInteger(input.endTime)
        || input.endTime <= input.startTime || input.endTime - input.startTime > 900_000
        || input.limit !== 100
        || (input.nextToken !== undefined && (typeof input.nextToken !== "string" || !/^\S{1,2048}$/.test(input.nextToken))))
        return Promise.reject(Error("Invalid bounded observation request"));
      // Pin the AWS resource account in the signed request too. A rotated session
      // must not redirect the same log-group name into a different account.
      const { logGroupName, ...window } = input;
      return read("logs", "filter-log-events", { ...window, logGroupIdentifier: `arn:aws:logs:${region}:${accountId}:log-group:${logGroupName}` }, "{events:events[].{eventId:eventId,timestamp:timestamp,message:message},nextToken:nextToken}");
    },
  };
}
