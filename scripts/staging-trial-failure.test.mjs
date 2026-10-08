import {test,expect} from "vitest";
import {safeTrialFailure,safeProviderFailure,safeBrowserFailure} from "./staging-trial-failure.mjs";
test("browser diagnostics cannot expose arbitrary page content or credentials",()=>{
 for(const phase of ["named-sign-in","record-opening","agent-selection","review-submit"])expect(safeBrowserFailure({phase,password:"secret",message:"private page"})).toBe(` (browser ${phase})`);
 for(const report of [null,{phase:"secret"},{phase:{toString:()=>"named-sign-in"}}])expect(safeBrowserFailure(report)).toBe("");
});
test("trial diagnostics contain only known checkpoints and bounded statuses",()=>{
 expect(safeTrialFailure({phase:"sessions",httpStatus:403,token:"secret",message:"private payload"})).toBe(" (sessions HTTP 403)");
 for(const report of [null,{phase:"private-token"},{phase:{toString:()=>"sessions"}},{phase:"sessions",httpStatus:"secret"},{phase:"sessions",httpStatus:900}])expect(safeTrialFailure(report)).not.toContain("secret");
 expect(safeTrialFailure({phase:"private-token",httpStatus:500})).toBe("");
 expect(safeTrialFailure({phase:"record-enrollment",httpStatus:503,errorKind:"provider"})).toBe(" (record-enrollment HTTP 503 provider)");
 expect(safeTrialFailure({phase:"record-catalog",httpStatus:503,errorKind:"private-response-body"})).toBe(" (record-catalog HTTP 503)");
});

test("provider failure emits only bounded process facts and known exception names",()=>{
 expect(safeProviderFailure({Status:"exited",ExitCode:1,OOMKilled:false},"private token\nPermissionError: secret file path")).toBe(" provider exited exit 1 PermissionError");
 expect(safeProviderFailure({Status:"running",ExitCode:0,OOMKilled:true})).toBe(" provider running exit 0 oom");
 expect(safeProviderFailure({Status:"secret",ExitCode:"token"},"ValueError private-token")).toBe(" provider unknown exit unknown");
 expect(safeProviderFailure(null,"private token")).toBe("");
 for(const text of ["secret","ModuleNotFoundError: secret","ValueError: private payload"]){expect(safeProviderFailure({Status:"exited",ExitCode:1},text)).not.toContain("secret");expect(safeProviderFailure({Status:"exited",ExitCode:1},text)).not.toContain("private payload");}
});
