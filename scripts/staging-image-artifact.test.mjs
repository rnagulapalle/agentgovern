import {test,expect} from "vitest";
import {mkdtemp,chmod,rm,readFile,writeFile,symlink} from "node:fs/promises";
import {writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {exportTestedImages,loadTestedImages,reloadAfterTrialRemoval} from "./staging-image-artifact.mjs";
const images={web:"trial:web",worker:"trial:worker",twin:"trial:twin",provisioner:"trial:provisioner"};
const ids=Object.fromEntries(Object.values(images).map((tag,i)=>[tag,`sha256:${String(i+1).repeat(64)}`]));
async function fixture(run){const parent=await mkdtemp(resolve(tmpdir(),"ll-artifact-test-"));await chmod(parent,0o700);try{await run(resolve(parent,"release"),parent);}finally{await rm(parent,{recursive:true,force:true});}}
function dockerFixture(){const calls=[];return {calls,docker:(...args)=>{calls.push(args);if(args[0]==="image"&&args[1]==="inspect")return ids[args[2]]??args[2];if(args[1]==="save")writeFileSync(args[3],"only-image-layers");if(args[0]==="run")return JSON.stringify({buildId:"worker-build"});return "";}};}
test("retains immutable IDs and loads only checksum-verified image content and compatible worker",()=>fixture(async directory=>{
 const {docker,calls}=dockerFixture();const result=await exportTestedImages({directory,images,buildId:"worker-build",docker});
 const manifest=await loadTestedImages({directory,expectedManifestSha256:result.manifestSha256,docker});
 expect(manifest.images.map(x=>x.id)).toEqual(Object.values(ids));expect(calls.find(x=>x[1]==="save").slice(4)).toEqual(Object.values(ids));
 expect(calls.filter(x=>x[1]==="load")).toHaveLength(1);expect(calls.flat().some(x=>["commit","export","volume","compose"].includes(x))).toBe(false);
 await expect(exportTestedImages({directory,images,buildId:"worker-build",docker})).rejects.toThrow();
}));
test("corruption, absent external digest and symlinks refuse before Docker load",()=>fixture(async(directory,parent)=>{
 const {docker,calls}=dockerFixture();const result=await exportTestedImages({directory,images,buildId:"worker-build",docker});
 for(const digest of [undefined,"f".repeat(64)])await expect(loadTestedImages({directory,expectedManifestSha256:digest,docker})).rejects.toThrow();
 const archive=resolve(directory,"images.tar");await writeFile(archive,"corrupt");await expect(loadTestedImages({directory,expectedManifestSha256:result.manifestSha256,docker})).rejects.toThrow("Archive digest mismatch");
 await rm(archive);await symlink(resolve(directory,"manifest.json"),archive);await expect(loadTestedImages({directory,expectedManifestSha256:result.manifestSha256,docker})).rejects.toThrow();
 expect(calls.some(x=>x[1]==="load")).toBe(false);
 await chmod(parent,0o755);await expect(exportTestedImages({directory:resolve(parent,"second"),images,buildId:"worker-build",docker})).rejects.toThrow("Owned private");
}));
test("failed save cleans only its exclusive output and never removes an existing artifact",()=>fixture(async directory=>{
 const {docker}=dockerFixture();await expect(exportTestedImages({directory,images,buildId:"worker-build",docker:(...args)=>{if(args[1]==="save")throw Error("save failure");return docker(...args);}})).rejects.toThrow("save failure");
 const result=await exportTestedImages({directory,images,buildId:"worker-build",docker});
 const before=await readFile(resolve(directory,"manifest.json"));await expect(exportTestedImages({directory,images,buildId:"worker-build",docker})).rejects.toThrow();expect(await readFile(resolve(directory,"manifest.json"))).toEqual(before);
 await expect(loadTestedImages({directory,expectedManifestSha256:result.manifestSha256,docker:(...args)=>args[0]==="run"?JSON.stringify({buildId:"wrong"}):docker(...args)})).rejects.toThrow("Loaded worker build mismatch");
}));

test("trusted checksum does not bypass manifest schema, role identity or archive path restrictions",()=>fixture(async directory=>{
 const {createHash}=await import("node:crypto");const {docker,calls}=dockerFixture();await exportTestedImages({directory,images,buildId:"worker-build",docker});
 const original=JSON.parse(await readFile(resolve(directory,"manifest.json"),"utf8"));
 for(const change of [{archive:{...original.archive,file:"../private.env"}},{images:[original.images[0],original.images[0],...original.images.slice(2)]},{secret:"private"},{buildId:""},{archive:{...original.archive,bytes:9*1024**3}}]){
  const encoded=JSON.stringify({...original,...change});await writeFile(resolve(directory,"manifest.json"),encoded);
  await expect(loadTestedImages({directory,expectedManifestSha256:createHash("sha256").update(encoded).digest("hex"),docker})).rejects.toThrow();
 }
 expect(calls.some(x=>x[1]==="load")).toBe(false);
}));
test("loaded wrong image IDs refuse worker execution and the offline entrypoint defaults to refusal",()=>fixture(async directory=>{
 const {spawnSync}=await import("node:child_process");const {docker,calls}=dockerFixture();const result=await exportTestedImages({directory,images,buildId:"worker-build",docker});
 await expect(loadTestedImages({directory,expectedManifestSha256:result.manifestSha256,docker:(...args)=>args[1]==="inspect"?`sha256:${"f".repeat(64)}`:docker(...args)})).rejects.toThrow("Loaded image identity mismatch");
 expect(calls.some(x=>x[0]==="run")).toBe(false);
 const child=spawnSync(process.execPath,["scripts/staging-image-load.mjs"],{env:{PATH:process.env.PATH},encoding:"utf8",timeout:10000});expect(child.status).toBe(1);expect(child.stdout).toBe("");expect(child.stderr.trim()).toBe("Image artifact verification refused; no services started or credentials printed.");
}));

test("post-trial reload cleans partial loads and refuses existing IDs without inspecting or removing shared images",()=>fixture(async directory=>{
 const {docker}=dockerFixture();const artifact=await exportTestedImages({directory,images,buildId:"worker-build",docker});
 for(const fail of [false,true]){
  const present=new Set(),calls=[];
  const actual=(...args)=>{calls.push(args);if(args[1]==="ls")return [...present].join("\n");if(args[1]==="load"){artifact.images.forEach(x=>present.add(x.id));if(fail)throw Error("partial load");}if(args[1]==="rm"){present.delete(args[2]);return "";}return docker(...args);};
  if(fail)await expect(reloadAfterTrialRemoval({directory,artifact,docker:actual})).rejects.toThrow("partial load");else await reloadAfterTrialRemoval({directory,artifact,docker:actual});
  expect(present.size).toBe(0);expect(calls.filter(x=>x[1]==="rm").map(x=>x[2])).toEqual(artifact.images.map(x=>x.id));expect(calls.flat()).not.toContain("--force");
 }
 const calls=[];await expect(reloadAfterTrialRemoval({directory,artifact,docker:(...args)=>{calls.push(args);return artifact.images[0].id;}})).rejects.toThrow("Original trial image must be absent");expect(calls).toEqual([["image","ls","--no-trunc","--quiet"]]);
 await expect(reloadAfterTrialRemoval({directory,artifact,docker:()=>{throw Error("inventory unavailable");}})).rejects.toThrow("inventory unavailable");
}));
