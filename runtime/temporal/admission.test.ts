import { expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { TemporalAdmission } from "./admission";
import { requireAdmission } from "../../lib/orchestration/admission";

it("refuses absent adapters and invalid worker builds without querying or scheduling", async () => {
  expect(() => requireAdmission()).toThrow("compatible worker");
  const query = vi.fn();
  const db = {query} as unknown as Pool;
  for (const build of ["", "ack-" + "G".repeat(64), "unreviewed"]) {
    const admission = new TemporalAdmission(db, build);
    expect(await admission.available()).toBe(false);
    await expect(admission.assertReady(db as unknown as PoolClient)).rejects.toThrow("compatible worker");
  }
  expect(query).not.toHaveBeenCalled();
});
it("uses the transaction connection for admission and propagates database failure", async () => {
  const query = vi.fn().mockResolvedValue({rows:[{present:null}]});
  const db = {query:vi.fn()} as unknown as Pool;
  const client = {query} as unknown as PoolClient;
  const admission = new TemporalAdmission(db, "ack-" + "a".repeat(64));
  await expect(admission.assertReady(client)).rejects.toThrow("compatible worker");
  query.mockResolvedValueOnce({rows:[{present:"ll_temporal_record_routes"}]});
  await expect(admission.assertReady(client)).resolves.toBeUndefined();
  query.mockRejectedValueOnce(new Error("database unavailable"));
  await expect(admission.assertReady(client)).rejects.toThrow("database unavailable");
  expect(db.query).not.toHaveBeenCalled();
});
