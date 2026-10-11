import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { requireAdmission } from "./admission";

it("keeps core submission and admission independent of vendor SDKs and Temporal environment selection", async () => {
  for (const file of ["lib/orchestration/admission.ts", "lib/enquiries/submission.ts", "lib/enquiries/service.ts"]) {
    const source = await readFile(file, "utf8");
    expect(source, file).not.toMatch(/(?:from|import\s*\()[\s\S]*?["'][^"']*(?:@temporalio|runtime\/temporal)[^"']*["']/);
    expect(source, file).not.toContain("LOOPLABS_TEMPORAL_");
    expect(source, file).not.toContain("new TemporalOutbox");
  }
});
it("requires trusted server composition and never selects a fallback adapter", () => {
  expect(() => requireAdmission()).toThrow("compatible worker");
  const supplied = { assertReady: async () => {}, transfer: async () => "owned-run" };
  expect(requireAdmission(supplied)).toBe(supplied);
});
