import {test,expect} from "vitest";
import {execFileSync} from "node:child_process";
test("private provider readiness refuses unavailable, mismatched, malformed and redirect evidence without business mutations or secret output",()=>{
 expect(()=>execFileSync("python3",["-I","scripts/check-connector-health.py","--self-test"],{timeout:10000,stdio:["ignore","pipe","pipe"]})).not.toThrow();
});
