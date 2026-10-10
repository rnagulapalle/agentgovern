// Retained source-bound UI evidence; actual CI provenance is checked at intake.
// This does not prove discovery against real customer cloud accounts.
import { test, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

test("retains current three-provider inventory UI evidence without implying enrollment or execution authority", async () => {
  const bytes = await readFile("docs/evidence/discovery-browser-proof.json");
  expect(createHash("sha256").update(bytes).digest("hex")).toBe("b0d7cd002ed186c71d7267b90fe8e7fdf0247e56c3e5b8112323af825d6fa169");
  const proof = JSON.parse(bytes);
  expect(proof.version).toBe(1);
  expect(proof.proof).toBe("disposable-loopback-cloud-inventory-ui");
  expect(Object.keys(proof.sourceFingerprints)).toHaveLength(37);
  for (const [file, digest] of Object.entries(proof.sourceFingerprints)) {
    expect(createHash("sha256").update(await readFile(file)).digest("hex"), file).toBe(digest);
  }
  expect(Object.keys(proof.assertions)).toHaveLength(30);
  expect(Object.values(proof.assertions).every(value => value === true)).toBe(true);
  expect(proof.assertions).toMatchObject({
    threeProviderOwnerReviewSavedThroughUi: true,
    ownerReviewReplayAndChangedDecisionRefused: true,
    foreignOwnerDirectoryAndReviewDenied: true,
    azureChangedBindingRefusedAndEvidencePreserved: true,
    projectCrossCompanyAndRevocationDenied: true,
    expiredBindingRefusedAndPriorEvidencePreserved: true,
    mobile390NoOverflow: true,
    mobileInputsAtLeast16px: true,
    noRawJson: true,
    noExecutionAuthorityCreated: true,
    ownedResourcesRemoved: true,
  });
  expect(proof.notProved).toEqual([
    "Azure and Google native reads", "AWS signing or real account discovery",
    "trusted TLS ingress", "live providers", "reviewed cloud enrollment",
    "mandatory action enforcement", "enterprise readiness",
  ]);
});
