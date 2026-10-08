import {test,expect} from "vitest";
import {safeTrialFailure} from "./staging-trial-failure.mjs";
test("trial diagnostics contain only known checkpoints and bounded statuses",()=>{
 expect(safeTrialFailure({phase:"sessions",httpStatus:403,token:"secret",message:"private payload"})).toBe(" (sessions HTTP 403)");
 for(const report of [null,{phase:"private-token"},{phase:{toString:()=>"sessions"}},{phase:"sessions",httpStatus:"secret"},{phase:"sessions",httpStatus:900}])expect(safeTrialFailure(report)).not.toContain("secret");
 expect(safeTrialFailure({phase:"private-token",httpStatus:500})).toBe("");
 expect(safeTrialFailure({phase:"record-enrollment",httpStatus:503,errorKind:"provider"})).toBe(" (record-enrollment HTTP 503 provider)");
 expect(safeTrialFailure({phase:"record-catalog",httpStatus:503,errorKind:"private-response-body"})).toBe(" (record-catalog HTTP 503)");
});
