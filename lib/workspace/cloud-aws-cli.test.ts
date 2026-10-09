import { beforeEach, expect, it, vi } from "vitest";
const execute = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFile: execute }));
import { awsCliInventoryApi, type DiscoverySession } from "./cloud-aws-cli";
import { collectAwsRuntimeInventory } from "./cloud-discovery";
const time = Date.parse("2026-10-09T13:30:00.000Z");
const session = (): DiscoverySession => ({ accessKeyId: "ASIA" + "A".repeat(16), secretAccessKey: "a".repeat(40), sessionToken: "b".repeat(40), expiresAt: new Date(time + 300_000).toISOString() });
const config = () => ({ executable: "/usr/local/bin/aws", region: "us-west-2", session: vi.fn(async () => session()), now: () => time });
const id = "service-1234567890", arn = `arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/${id}`;
beforeEach(() => { execute.mockReset(); });
it("only exposes signed read commands with exact inputs, stripped outputs and isolated bounded process environment", async () => {
  execute.mockImplementation((_path, _args, _options, callback) => callback(null, '{"Account":"123456789012"}'));
  const api = awsCliInventoryApi(config());
  await api.callerIdentity(); await api.listRuntimes({ maxResults: 100, nextToken: "opaque+/=" }); await api.getRuntime({ agentRuntimeId: id, agentRuntimeVersion: "2" });
  expect(execute.mock.calls.map(c => c[1].slice(0, 2))).toEqual([["sts", "get-caller-identity"], ["bedrock-agentcore-control", "list-agent-runtimes"], ["bedrock-agentcore-control", "get-agent-runtime"]]);
  for (const [path, args, opts] of execute.mock.calls) {
    expect(path).toBe("/usr/local/bin/aws"); expect(args).toContain("--no-paginate"); expect(args).not.toContain("--no-sign-request"); expect(args).not.toContain("--endpoint-url");
    expect(opts).toMatchObject({ timeout: 15000, maxBuffer: 1048576, killSignal: "SIGKILL" });
    expect(Object.keys(opts.env).sort()).toEqual(["PATH", "HOME", "LANG", "NODE_ENV", "AWS_CONFIG_FILE", "AWS_SHARED_CREDENTIALS_FILE", "AWS_EC2_METADATA_DISABLED", "AWS_IGNORE_CONFIGURED_ENDPOINT_URLS", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_MAX_ATTEMPTS", "AWS_PAGER"].sort());
    expect(opts.env.AWS_CONFIG_FILE).toBe("/dev/null"); expect(JSON.stringify(args)).not.toContain(session().secretAccessKey);
    expect(args.at(-1)).not.toMatch(/environmentVariables|description/);
  }
  expect(JSON.parse(execute.mock.calls[1][1][execute.mock.calls[1][1].indexOf("--cli-input-json") + 1])).toEqual({ maxResults: 100, nextToken: "opaque+/=" });
});
it("rejects untrusted transport and hostile requests before acquiring credentials or starting processes", async () => {
  for (const executable of ["aws", "/bin/../aws", "/aws;echo", "/aws\n"]) expect(() => awsCliInventoryApi({ ...config(), executable })).toThrow();
  expect(() => awsCliInventoryApi({ ...config(), region: "us-west-2 --debug" })).toThrow();
  const cfg = config(), api = awsCliInventoryApi(cfg);
  for (const request of [{ maxResults: 0 }, { maxResults: 101 }, { maxResults: 1, nextToken: " " }, { maxResults: 1, endpoint: "evil" }, null])
    await expect(api.listRuntimes(request as never)).rejects.toThrow();
  for (const request of [{ agentRuntimeId: "--debug", agentRuntimeVersion: "2" }, { agentRuntimeId: id, agentRuntimeVersion: "0" }, { agentRuntimeId: id, agentRuntimeVersion: "1", extra: "evil" }, null])
    await expect(api.getRuntime(request as never)).rejects.toThrow();
  expect(cfg.session).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
});
it("rejects missing, permanent, expired, imminent or overlong sessions without leaking secrets", async () => {
  const changes = [null, { ...session(), extra: "raw" }, { ...session(), accessKeyId: "AKIA" + "A".repeat(16) }, { ...session(), secretAccessKey: "secret" }, { ...session(), sessionToken: "" }, { ...session(), expiresAt: "invalid" }, ...[0, 29_999, 3_600_001].map(delta => ({ ...session(), expiresAt: new Date(time + delta).toISOString() }))];
  for (const value of changes) await expect(awsCliInventoryApi({ ...config(), session: async () => value as DiscoverySession }).callerIdentity()).rejects.toThrow("Current short-lived discovery session required");
  await expect(awsCliInventoryApi({ ...config(), session: async () => { throw new Error("secret"); } }).callerIdentity()).rejects.toThrow("Discovery credentials unavailable");
  expect(execute).not.toHaveBeenCalled();
});
it("sanitizes process failures and malformed outputs; collector never calls detail after identity failure", async () => {
  execute.mockImplementation((_p, _a, _o, cb) => cb(new Error("credential and endpoint secret"), "secret", "secret"));
  await expect(awsCliInventoryApi(config()).callerIdentity()).rejects.toThrow(/^Discovery read unavailable$/);
  execute.mockImplementation((_p, _a, _o, cb) => cb(null, "secret"));
  await expect(awsCliInventoryApi(config()).callerIdentity()).rejects.toThrow(/^Discovery response invalid$/);
  execute.mockClear(); execute.mockImplementation((_p, _a, _o, cb) => cb(null, '{"Account":"999999999999"}'));
  await expect(collectAwsRuntimeInventory(awsCliInventoryApi(config()), { tenantId: "tenant", connectionId: "connection", accountId: "123456789012", region: "us-west-2" }, new Date(time).toISOString())).rejects.toThrow("account differs");
  expect(execute).toHaveBeenCalledTimes(1);
});
it("composes exact-version collection and preserves explicit unknown coverage", async () => {
  execute.mockImplementation((_p, args, _o, cb) => cb(null, JSON.stringify(args[0] === "sts" ? { Account: "123456789012" } : args[1] === "list-agent-runtimes" ? { agentRuntimes: [{ agentRuntimeId: id, agentRuntimeArn: arn, agentRuntimeVersion: "2" }], nextToken: null } : { agentRuntimeId: id, agentRuntimeArn: arn, agentRuntimeVersion: "2", roleArn: "arn:aws:iam::123456789012:role/runtime", workloadIdentityDetails: { workloadIdentityArn: "arn:aws:bedrock-agentcore:us-west-2:123456789012:workload-identity-directory/default/identity/service" } })));
  const result = await collectAwsRuntimeInventory(awsCliInventoryApi(config()), { tenantId: "tenant", connectionId: "connection", accountId: "123456789012", region: "us-west-2" }, new Date(time).toISOString());
  expect(result.completeness).toBe("complete-api-traversal"); expect(result.records[0].coverage.enforcement).toBe("unverified"); expect(result.records[0].gaps).toEqual(["effective-permissions-unknown", "declared-tools-unknown"]);
});
