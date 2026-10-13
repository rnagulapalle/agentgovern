import { it, expect, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
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

it("installs membership history and uses genuine named approval without relaxing agent or network controls", () => {
  const controller=readFileSync("scripts/gateway-trial-controller.ts","utf8");
  for(const text of ["lib/workspace/membership-authority-schema.sql","SELECT ll_membership_authority23() installed","WORKSPACE_COOKIE","Cookie: `${WORKSPACE_COOKIE}=${c.operator}`","Authorization:`Bearer ${c.legacyOperator}`","digest(c.legacyOperator)","Origin: c.origin","assert.equal(legacy.status, 403","membership_approval.approver",'generation:"1"'])
    expect(controller).toContain(text);
  expect(controller).not.toContain('headers: { Authorization: `Bearer ${c.operator}`, "Content-Type": "application/json" }');
});
