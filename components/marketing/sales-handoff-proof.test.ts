import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";

const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
it("retains the actual Chrome before/after and committed-reference evidence only for its measured sources", async () => {
  const bytes = await readFile("docs/evidence/sales-handoff-native-20261019-focus.json");
  expect(hash(bytes)).toBe("c7ba93074ef8c9989c2b6cb1cb0ebda0c81565b45cbc274c26d8cf52eb30b8e9");
  const evidence = JSON.parse(bytes.toString("utf8"));
  expect(evidence.contract).toBe("isolated-chrome-sales-handoff-1");
  expect(evidence.production).toBe(false);
  expect(evidence.browser).toBe("Raj Chrome via extension");
  expect(Object.keys(evidence.sourceFingerprints)).toEqual([
    "app/api/sales/route.ts", "lib/workspace/sales.ts", "lib/workspace/sales-handoff.ts",
    "components/marketing/sales-form.tsx", "app/sales.css", "app/contact-sales/page.tsx",
  ]);
  for (const [path, expected] of Object.entries(evidence.sourceFingerprints))
    expect(hash(await readFile(path)), `Native sales proof is stale for ${path}`).toBe(expected);
  expect(hash(await readFile(evidence.screenshot))).toBe(evidence.screenshotSha256);
  expect(evidence.beforeVisual.measured.statusTop).toBeLessThan(evidence.beforeVisual.measured.headerBottom);
  expect(evidence.beforeVisual.measured.ctaHeight).toBeLessThan(48);
  const visible = evidence.afterVisible;
  expect(visible.production).toBe(false);
  expect(visible.synthetic).toBe(true);
  expect(visible.calendarOpened).toBe(false);
  expect(visible.visual.focusedHeading).toBe(true);
  expect(visible.visual.headingTop).toBeGreaterThanOrEqual(visible.visual.headerBottom);
  expect(visible.visual.ctaHeight).toBeGreaterThanOrEqual(48);
  expect(visible.visual.ctaBackground).toBe("rgb(28, 25, 23)");
  expect(visible.visual.ctaColor).toBe("rgb(255, 255, 255)");
  expect(visible.visual.documentWidth).toBeLessThanOrEqual(visible.visual.viewportWidth);
  const destination = new URL(visible.href);
  expect(destination.origin + destination.pathname).toBe("https://cal.com/rajnagulapalle");
  expect([...destination.searchParams]).toEqual([["metadata[looplabs_intake_ref]", evidence.afterDatabase.intakeRef]]);
  expect(evidence.afterDatabase).toMatchObject({ passed: true, production: false, rowCount: 1,
    committedReferenceMatchesVisibleCalendarLink: true, serverConfiguredWorkspaceMatched: true,
    noProductionInquiry: true, noCalendarBooking: true });
  expect(evidence.databaseLifecycle).toMatchObject({ status: "passed", production: false, exit_code: 0,
    pgReady: true, wrongPasswordRefused: true, plaintextRefused: true,
    ownedCleanupTerminal: true, ownedDataRemoved: true });
  expect(evidence.ownedSchemaCleanup).toBe(true);
});
