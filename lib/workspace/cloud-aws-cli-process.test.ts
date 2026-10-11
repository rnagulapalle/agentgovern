import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { awsCliInventoryApi } from "./cloud-aws-cli";
const now = Date.now();
function options(executable: string) {
  return { executable, region: "us-west-2", now: () => now, session: async () => ({ accessKeyId: "ASIA" + "A".repeat(16), secretAccessKey: "a".repeat(40), sessionToken: "b".repeat(40), expiresAt: new Date(now + 300_000).toISOString() }) };
}
async function withExecutable(body: string, run: (executable: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "ll-discovery-")), executable = join(dir, "aws");
  try { await writeFile(executable, `#!${process.execPath}\n${body}`, { mode: 0o700 }); await run(executable); }
  finally { await rm(dir, { recursive: true, force: true }); }
}
it("actual child receives literal JSON arguments and isolated config without ambient secrets or endpoint inheritance", async () => {
  await withExecutable(`const args=process.argv.slice(2);const input=JSON.parse(args[args.indexOf('--cli-input-json')+1]);if(input.nextToken!==';echo_injected'||process.env.AWS_CONFIG_FILE!=='/dev/null'||process.env.HOME!=='/nonexistent'||process.env.AWS_PROFILE||process.env.AWS_ENDPOINT_URL||args.includes('--no-sign-request'))process.exit(2);console.log(JSON.stringify({agentRuntimes:[],nextToken:null}));`, async executable => {
    expect(await awsCliInventoryApi(options(executable)).listRuntimes({ maxResults: 100, nextToken: ";echo_injected" })).toEqual({ agentRuntimes: [], nextToken: null });
  });
});
it("actual process failure, oversized output and invalid JSON reveal no stdout/stderr diagnostics", async () => {
  for (const body of ["console.error('private diagnostic');process.exit(1)", "console.log('private diagnostic')", "process.stdout.write('x'.repeat(2097152))"])
    await withExecutable(body, async executable => { await expect(awsCliInventoryApi(options(executable)).callerIdentity()).rejects.toThrow(/^Discovery (read unavailable|response invalid)$/); });
});
it("unavailable administrator-owned executable refuses without fallback to ambient aws", async () => {
  await expect(awsCliInventoryApi(options("/nonexistent/looplabs/aws")).callerIdentity()).rejects.toThrow(/^Discovery read unavailable$/);
});
