import {readHistoricalProof} from './historical-proof-sources.mjs';
// Historical retained planner measurements; not current AWS execution.
import {it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
it("retains the measured temporary-session proof for its exact covered sources and limited scope",()=>{
 const proof=JSON.parse(readFileSync("docs/evidence/staging-planner-session-proof.json","utf8"));
 const historical=readHistoricalProof('staging-planner-session-proof.json');expect(historical.receipt).toEqual(proof);expect(historical).toMatchObject({historical:true,eligible:false,releaseAccepted:false,currentSourceValidated:false});
 expect(proof.passed).toBe(true);
 expect(proof.notVerified).toEqual(expect.arrayContaining(["assembled web-container model invocation","typed HTTPS browser planning","persistent remote staging","live providers and enterprise acceptance"]));
 expect(Object.keys(proof.sourceFingerprints).sort()).toEqual(["scripts/staging-planner-inputs.mjs","scripts/staging-planner-proof.ts","lib/enquiries/chat.ts","lib/enquiries/chat-contract.ts"].sort());
 for(const [path,digest] of Object.entries(proof.sourceFingerprints))expect(createHash("sha256").update(historical.sources[path]).digest("hex")).toBe(digest);
});
