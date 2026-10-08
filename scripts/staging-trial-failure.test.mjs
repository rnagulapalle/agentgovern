import {test,expect} from "vitest";
import {safeTrialFailure} from "./staging-trial-failure.mjs";
test("trial diagnostics contain only known checkpoints and bounded statuses",()=>{
 expect(safeTrialFailure({phase:"sessions",httpStatus:403,token:"secret",message:"private payload"})).toBe(" (sessions HTTP 403)");
 for(const report of [null,{phase:"private-token"},{phase:{toString:()=>"sessions"}},{phase:"sessions",httpStatus:"secret"},{phase:"sessions",httpStatus:900}])expect(safeTrialFailure(report)).not.toContain("secret");
 expect(safeTrialFailure({phase:"private-token",httpStatus:500})).toBe("");
});
