import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { azureCliReadBroker } from "./cloud-azure-cli";
import type { ProjectDiscoveryScope } from "./cloud-project-discovery";

const scope: ProjectDiscoveryScope = { provider: "azure-foundry", tenantId: "company-one", connectionId: "11111111-1111-4111-8111-111111111111", directoryId: "22222222-2222-4222-8222-222222222222", endpoint: "https://example.services.ai.azure.com/api/projects/reviewed" };
const now = Date.parse("2026-10-09T00:00:00Z"), roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function fixture(body: string) {
  const root = await mkdtemp(join(tmpdir(), "ll-azure-broker-")); roots.push(root);
  const executable = join(root, "az"), configDirectory = join(root, "config");
  const { mkdir } = await import("node:fs/promises"); await mkdir(configDirectory, { mode: 0o700 });
  await writeFile(executable, `#!/bin/sh\n${body}\n`, { mode: 0o700 });
  return { executable, configDirectory, now: () => now };
}
const cloud = '{"name":"AzureCloud","authority":"https://login.microsoftonline.com","management":"https://management.azure.com/"}';
const session = (patch: object = {}) => JSON.stringify({ token: "opaque-native-token-123456", expires: Math.floor(now / 1000) + 600, tenant: scope.provider === "azure-foundry" ? scope.directoryId : "", type: "Bearer", ...patch });
describe("reviewed Azure CLI broker", () => {
  it("uses fixed tenant/audience and isolated configuration without inherited secrets", async () => {
    vi.stubEnv("AZURE_CLIENT_SECRET", "DO_NOT_INHERIT"); vi.stubEnv("AWS_ACCESS_KEY_ID", "DO_NOT_INHERIT"); vi.stubEnv("HTTPS_PROXY", "DO_NOT_INHERIT");
    const options = await fixture(`if [ "$1" = cloud ]; then printf '%s' '${cloud}'; else\n[ "$1" = account ] && [ "$2" = get-access-token ] && [ "$3" = --tenant ] && [ "$4" = '${scope.provider === "azure-foundry" ? scope.directoryId : ""}' ] && [ "$5" = --resource ] && [ "$6" = https://ai.azure.com ] || exit 4\n[ "$HOME" = /nonexistent ] && [ -n "$AZURE_CONFIG_DIR" ] && [ -z "$AZURE_CLIENT_SECRET" ] && [ -z "$AWS_ACCESS_KEY_ID" ] && [ -z "$HTTPS_PROXY" ] || exit 5\nprintf '%s' '${session()}'\nfi`);
    const broker = azureCliReadBroker(scope, options);
    expect(await broker(AbortSignal.timeout(1000))).toEqual({ token: "opaque-native-token-123456", expiresAt: new Date(now + 600_000).toISOString(), directoryId: scope.provider === "azure-foundry" ? scope.directoryId : "", endpoint: scope.provider === "azure-foundry" ? scope.endpoint : "", audience: "https://ai.azure.com" });
  });
  it("rejects wrong tenant, expiry, type, malformed and oversized output without leaking it", async () => {
    for (const reply of [session({ tenant: "foreign" }), session({ expires: 0 }), session({ type: "MAC" }), session({ expires: "local time" }), session({ token: "short" }), 'null', '[]', '{"PRIVATE":', 'x'.repeat(70_000)]) {
      const options = await fixture(`if [ "$1" = cloud ]; then printf '%s' '${cloud}'; else printf '%s' '${reply}'; fi`);
      await expect(azureCliReadBroker(scope, options)(AbortSignal.timeout(1000))).rejects.toThrow(/^Reviewed Azure discovery credentials unavailable$/);
    }
  });
  it("refuses custom clouds, untrusted files, aborted and stalled processes", async () => {
    const wrong = await fixture(`printf '%s' '{"name":"OtherCloud","authority":"https://evil.example","management":"https://evil.example"}'`);
    await expect(azureCliReadBroker(scope, wrong)(AbortSignal.timeout(1000))).rejects.toThrow(/^Reviewed Azure discovery credentials unavailable$/);
    await chmod(wrong.executable, 0o777);
    await expect(azureCliReadBroker(scope, wrong)(AbortSignal.timeout(1000))).rejects.toThrow(/^Reviewed Azure discovery credentials unavailable$/);
    const blocked = await fixture('exec /bin/sleep 20');
    await expect(azureCliReadBroker(scope, blocked)(AbortSignal.timeout(40))).rejects.toThrow(/^Reviewed Azure discovery credentials unavailable$/);
    await expect(azureCliReadBroker(scope, blocked)(AbortSignal.abort())).rejects.toThrow(/^Reviewed Azure discovery credentials unavailable$/);
    expect(() => azureCliReadBroker(scope, { ...blocked, executable: '/tmp/../az' })).toThrow();
    await chmod(blocked.configDirectory, 0o755);
    await expect(azureCliReadBroker(scope, blocked)(AbortSignal.timeout(1000))).rejects.toThrow(/^Reviewed Azure discovery credentials unavailable$/);
  });
});
