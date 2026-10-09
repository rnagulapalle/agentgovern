import { it, expect, vi } from "vitest";
import { existsSync } from "node:fs";
import { gatewayBypassProof } from "./gateway-bypass-proof.mjs";
it("requires explicit disposable opt-in and a new absolute evidence destination before any allocation", async () => {
  const output = `/tmp/ll-bypass-refused-${process.pid}`;
  try {
    vi.stubEnv("LOOPLABS_GATEWAY_BYPASS_PROOF", "");
    await expect(gatewayBypassProof(output)).rejects.toThrow("opt-in required");
    vi.stubEnv("LOOPLABS_GATEWAY_BYPASS_PROOF", "isolated");
    for (const path of [undefined, "relative", "/tmp/../unsafe"])
      await expect(gatewayBypassProof(path)).rejects.toThrow("absolute evidence directory");
    await expect(gatewayBypassProof("/tmp")).rejects.toThrow();
    expect(existsSync(output)).toBe(false);
  } finally { vi.unstubAllEnvs(); }
});
