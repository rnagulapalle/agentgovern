// Explicit disposable version-test build. Normal worker build remains unchanged.
import assert from "node:assert/strict";
import {readFile,writeFile,rm} from "node:fs/promises";
import {randomUUID,createHash} from "node:crypto";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {semanticBuildSource} from "./temporal-semantic-variant.mjs";
let generated,created=false;
try{
 assert(process.env.LOOPLABS_SEMANTIC_VERSION_BUILD==="isolated","Explicit isolated semantic-version build required");
 const baseline=JSON.parse(await readFile("docs/evidence/staging-platform-browser-proof.json","utf8"));
 const builder=await readFile("scripts/build-temporal-worker.mjs","utf8");
 assert.equal(createHash("sha256").update(builder).digest("hex"),baseline.sourceFingerprints["scripts/build-temporal-worker.mjs"],"Measured worker builder changed");
 generated=resolve("scripts",`.semantic-build-${randomUUID()}.mjs`);
 await writeFile(generated,semanticBuildSource(builder),{flag:"wx",mode:0o600});
 created=true;
 await import(pathToFileURL(generated).href);
}catch{console.error("Isolated semantic-version build refused; no raw build input or credentials printed.");process.exitCode=1;}
finally{if(created)await rm(generated,{force:true});}
