// Freshness only; the actual AWS check is staging-planner-proof.ts.
import {it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
it("retains the measured temporary-session proof for its exact covered sources and limited scope",()=>{
 const proof=JSON.parse(readFileSync("docs/evidence/staging-planner-session-proof.json","utf8"));
 expect(proof.passed).toBe(true);
 expect(proof.notVerified).toEqual(expect.arrayContaining(["assembled web-container model invocation","typed HTTPS browser planning","persistent remote staging","live providers and enterprise acceptance"]));
 expect(Object.keys(proof.sourceFingerprints).sort()).toEqual(["scripts/staging-planner-inputs.mjs","scripts/staging-planner-proof.ts","lib/enquiries/chat.ts","lib/enquiries/chat-contract.ts"].sort());
 for(const [path,digest] of Object.entries(proof.sourceFingerprints))expect(createHash("sha256").update(readFileSync(path)).digest("hex")).toBe(digest);
});
