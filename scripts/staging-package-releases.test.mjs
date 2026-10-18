import {test,expect} from "vitest";
import {mkdtemp,chmod,rm,readFile,writeFile,rename,symlink,lstat} from "node:fs/promises";
import {writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {exportTestedImages} from "./staging-image-artifact.mjs";
import {loadAndRetireMeasuredArchive} from "./staging-package-releases.mjs";
async function fixture(run){
 const parent=await mkdtemp(resolve(tmpdir(),"ll-package-download-"));await chmod(parent,0o700);
 try{
  const directory=resolve(parent,"release"),images={web:"web",worker:"worker",twin:"twin",provisioner:"provisioner"};
  const identities=Object.fromEntries(Object.keys(images).map((role,i)=>[role,`sha256:${String(i+1).repeat(64)}`]));
  const docker=(...args)=>{
   if(args[1]==="save")writeFileSync(args[3],"validated downloaded image layers");
   if(args[1]==="inspect")return identities[args[2]]??args[2];
   if(args[0]==="run")return JSON.stringify({buildId:"measured-build"});
   return "";
  };
  const artifact=await exportTestedImages({directory,images,buildId:"measured-build",docker});
  const expected={...artifact,buildId:"measured-build"};
  await run({directory,docker,expected});
 }finally{await rm(parent,{recursive:true,force:true});}
}
test("reclaims only the owned local archive after checksum, image and measured-build validation",()=>fixture(async({directory,docker,expected})=>{
 const manifest=await readFile(resolve(directory,"manifest.json"));
 await writeFile(resolve(directory,"unrelated.txt"),"preserve");
 const loaded=await loadAndRetireMeasuredArchive(directory,expected,docker);
 expect(loaded.images).toEqual(expected.images);
 await expect(lstat(resolve(directory,"images.tar"))).rejects.toMatchObject({code:"ENOENT"});
 expect(await readFile(resolve(directory,"manifest.json"))).toEqual(manifest);
 expect(await readFile(resolve(directory,"unrelated.txt"),"utf8")).toBe("preserve");
}));
test("load failures and retained-identity mismatches preserve the downloaded archive",()=>fixture(async({directory,docker,expected})=>{
 const path=resolve(directory,"images.tar"),before=await readFile(path);
 for(const changed of [{...expected,buildId:"different"},{...expected,images:[]},{...expected,archiveBytes:1},{...expected,archiveSha256:"f".repeat(64)},{...expected,manifestSha256:"f".repeat(64)}]){
  await expect(loadAndRetireMeasuredArchive(directory,changed,docker)).rejects.toThrow();
  expect(await readFile(path)).toEqual(before);
 }
 await expect(loadAndRetireMeasuredArchive(directory,expected,(...args)=>{if(args[1]==="load")throw Error("partial load");return docker(...args);})).rejects.toThrow("partial load");
 expect(await readFile(path)).toEqual(before);
}));
test("replaced archive paths and symlinks are refused rather than deleted",()=>fixture(async({directory,docker,expected})=>{
 const path=resolve(directory,"images.tar"),original=resolve(directory,"original.tar");
 await expect(loadAndRetireMeasuredArchive(directory,expected,(...args)=>{
  if(args[0]==="run"){
   // Synchronous adversarial replacement during the validated Docker callback.
   writeFileSync(path,"changed after load");
  }
  return docker(...args);
 })).rejects.toThrow("Downloaded archive changed");
 expect(await readFile(path,"utf8")).toBe("changed after load");
 await rename(path,original);await symlink(original,path);
 await expect(loadAndRetireMeasuredArchive(directory,expected,docker)).rejects.toThrow("Owned regular");
 expect((await lstat(path)).isSymbolicLink()).toBe(true);
}));
