import {test,expect} from "vitest";
import {execFileSync} from "node:child_process";
test("fixture integrity refuses zero-byte files, wrong versions and lost metadata/records",()=>{
 expect(()=>execFileSync("python3",["-I","scripts/check-twin-dependencies.py","--self-test"],{timeout:10000,stdio:["ignore","pipe","pipe"]})).not.toThrow();
});
