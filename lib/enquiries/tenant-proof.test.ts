import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {expect,it} from "vitest";
import proof from "../../docs/evidence/tenant-isolation-proof.json";
it("requires actual source-bound two-company HTTP refusal and correctly targeted effect proof",async()=>{
 expect(proof.measurements).toEqual({companies:2,deniedHttpRequests:64,deniedBrowserRequests:8,effects:4});
 expect(proof.checks).toHaveLength(5);
 expect(proof.checks.some(c=>c.includes("expired sessions lose API access without effects"))).toBe(true);
 expect(proof.checks.some(c=>c.includes("no state or effects changed"))).toBe(true);
 expect(proof.checks.some(c=>c.includes("Identical CRM/email agent IDs"))).toBe(true);
 expect(proof.checks.some(c=>c.includes("exactly four intended HTTP effects"))).toBe(true);
 expect(proof.scope).toContain("not a new Temporal/container/remote or independent security audit");
 for(const [file,hash] of Object.entries(proof.sourceFingerprints))expect(createHash("sha256").update(await readFile(file)).digest("hex"),file).toBe(hash);
});
