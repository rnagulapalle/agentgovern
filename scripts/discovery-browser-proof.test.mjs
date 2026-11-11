import { it, expect, vi } from "vitest";
import { existsSync } from "node:fs";
import { discoveryBrowserProof, ownedCurrentDiscoveryProof } from "./discovery-browser-proof.mjs";
it("refuses implicit execution, absent database, remote database and unsafe output before allocating resources", async () => {
  const output = `/tmp/ll-refused-proof-${process.pid}`;
  try {
    vi.stubEnv("LOOPLABS_DISCOVERY_BROWSER_PROOF", ""); await expect(discoveryBrowserProof(output)).rejects.toThrow("opt-in required");
    vi.stubEnv("LOOPLABS_DISCOVERY_BROWSER_PROOF", "isolated"); vi.stubEnv("LOOPLABS_TEST_DATABASE_URL", ""); await expect(discoveryBrowserProof(output)).rejects.toThrow("PostgreSQL required");
    vi.stubEnv("LOOPLABS_TEST_DATABASE_URL", "postgresql://example.test/test"); await expect(discoveryBrowserProof(output)).rejects.toThrow("Loopback test database");
    vi.stubEnv("LOOPLABS_TEST_DATABASE_URL", "postgresql://127.0.0.1/test"); for (const path of ["relative", "/tmp/../unsafe"]) await expect(discoveryBrowserProof(path)).rejects.toThrow("absolute evidence directory");
    expect(existsSync(output)).toBe(false);
  } finally { vi.unstubAllEnvs(); }
});
it("owned current mode refuses implicit execution and unsafe output before allocating a fixture",async()=>{try{vi.stubEnv("LOOPLABS_DISCOVERY_BROWSER_PROOF","");await expect(ownedCurrentDiscoveryProof('/tmp/refused-owned-proof')).rejects.toThrow('opt-in required');vi.stubEnv("LOOPLABS_DISCOVERY_BROWSER_PROOF","isolated");for(const path of [undefined,'relative','/tmp/../unsafe'])await expect(ownedCurrentDiscoveryProof(path)).rejects.toThrow('absolute evidence directory');}finally{vi.unstubAllEnvs();}});
