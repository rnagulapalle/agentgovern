import {test,expect} from "vitest";
import {spawnSync} from "node:child_process";
test("the complete trial refuses implicit execution before allocating Docker resources",()=>{
 const result=spawnSync(process.execPath,["--import","tsx","scripts/staging-platform-proof.mjs"],{env:{PATH:process.env.PATH,HOME:process.env.HOME,LOOPLABS_STAGING_PLATFORM_PROOF:""},encoding:"utf8",timeout:10000});
 expect(result.status).not.toBe(0);expect(result.stdout).toBe("");expect(result.stderr).toContain("Explicit disposable trial and prepared private source required");
});
test("browser proof refuses malformed or non-CI opt-in before source/resources/trust setup",()=>{
 for(const value of ["true","isolated"]){
  const result=spawnSync(process.execPath,["--import","tsx","scripts/staging-platform-proof.mjs"],{env:{PATH:process.env.PATH,HOME:process.env.HOME,LOOPLABS_STAGING_PLATFORM_PROOF:"isolated",FETCHSANDBOX_BACKEND_PATH:"not-a-real-source",LOOPLABS_STAGING_BROWSER_PROOF:value},encoding:"utf8",timeout:10000});
  expect(result.status).not.toBe(0);expect(result.stdout).toBe("");expect(result.stderr).toContain(value==="isolated"?"Fresh isolated CI required":"Invalid browser proof opt-in");
 }
});
