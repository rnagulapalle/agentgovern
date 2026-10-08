// Receipt freshness/consistency only; this test never substitutes for the actual trial.
import {test,expect} from "vitest";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
test("the retained browser trial remains bound to its measured runtime sources and explicit limits",async()=>{
 const proof=JSON.parse(await readFile("docs/evidence/staging-platform-browser-proof.json","utf8"));
 expect(proof.passed).toBe(true);expect(proof.browser.passed).toBe(true);
 expect(proof.executionEvidence.runId).toBe(37859172131);
 expect(proof.executionEvidence.publicSourceCommit).toBe("fefcf320bf6017d0ec5b66f80feb88188bbb7530");
 expect(proof.executionEvidence.qualityTests).toBe(400);expect(proof.executionEvidence.actualProviderEffects).toBe(4);expect(proof.executionEvidence.productionChanged).toBe(false);
 expect(proof.admission.admitted).toBe(true);expect(proof.admission.blockers).toEqual([]);expect(proof.admission.hostReserveBytes).toBe(2*1024**3);
 expect(proof.images).toHaveLength(4);expect(proof.services).toHaveLength(8);
 expect(proof.browser.checks).toEqual(expect.arrayContaining(["untrusted CA refused before sign-in","real hostile-origin browser POST with reviewer cookie refused before approval","independent UI approvals and actual verified completion","saved outcome and exact recipient survive 390px reload without overflow"]));
 expect(proof.notVerified).toEqual(expect.arrayContaining(["fresh typed chat/model interpretation","remote persistent staging","live provider guarantees"]));
 expect(Object.keys(proof.sourceFingerprints)).toEqual(expect.arrayContaining(["scripts/staging-browser-proof.mjs","scripts/staging-browser-tls.mjs","scripts/staging-owned-builder.mjs","components/control-plane/enquiry-workspace.tsx","lib/connectors/service.ts","runtime/temporal/activities.ts"]));
 for(const [file,digest] of Object.entries(proof.sourceFingerprints))expect(createHash("sha256").update(await readFile(file)).digest("hex"),file).toBe(digest);
 expect(proof).not.toHaveProperty("actionIds");expect(proof.browser).not.toHaveProperty("actionIds");
});
