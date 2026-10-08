import {test} from "vitest";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp,mkdir,writeFile,readFile,rm,access,symlink} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {prepareFixtureSource} from "./staging-fixture-source.mjs";
test("source assembly selects the pinned commit and refuses mutable or escaping inputs",async()=>{
 const root=await mkdtemp(resolve(tmpdir(),"ll-source-proof-")),repo=resolve(root,"repo"),spec=resolve(root,"hubspot.yaml");
 const git=(...args)=>execFileSync("git",["-C",repo,...args],{env:Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith("GIT_"))),encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
 try{
  await mkdir(repo);git("init");git("config","user.email","fixture@example.test");git("config","user.name","Fixture");
  for(const directory of ["app","configs/hubspot","configs/resend","specs/resend"]){await mkdir(resolve(repo,"backend",directory),{recursive:true});await writeFile(resolve(repo,"backend",directory,"input.txt"),"committed");}
  await writeFile(resolve(repo,".env.local"),"must-not-copy");git("add","backend");git("commit","-m","Fixture baseline");const commit=git("rev-parse","HEAD");
  await writeFile(resolve(repo,"backend/app/input.txt"),"dirty-current-source");await writeFile(resolve(repo,"backend/app/untracked.env"),"must-not-copy");
  await writeFile(spec,"openapi: 3.0.1\n");const digest=createHash("sha256").update(await readFile(spec)).digest("hex"),out=resolve(root,"prepared");
  const result=await prepareFixtureSource(repo,commit,spec,digest,out);assert.equal(result.commit,commit);assert.equal(result.trackedFiles,4);
  const previous=process.env.GIT_DIR;
  try{process.env.GIT_DIR=resolve(root,"wrong-repository");assert.equal((await prepareFixtureSource(repo,commit,spec,digest,resolve(root,"hooked"))).commit,commit);}
  finally{if(previous===undefined)delete process.env.GIT_DIR;else process.env.GIT_DIR=previous;}
  assert.equal(await readFile(resolve(out,"backend/app/input.txt"),"utf8"),"committed");await assert.rejects(access(resolve(out,".env.local")));await assert.rejects(access(resolve(out,"backend/app/untracked.env")));
  await assert.rejects(prepareFixtureSource(repo,"HEAD",spec,digest,resolve(root,"mutable")),/Exact reviewed/);
  await assert.rejects(prepareFixtureSource(repo,commit,spec,"0".repeat(64),resolve(root,"wrong-spec")),/spec differs/);
  await assert.rejects(prepareFixtureSource(repo,commit,spec,digest,out),e=>e.code==="EEXIST");
  await symlink("../../.env.local",resolve(repo,"backend/app/escape"));git("add","backend/app/escape");git("commit","-m","Hostile link");
  await assert.rejects(prepareFixtureSource(repo,git("rev-parse","HEAD"),spec,digest,resolve(root,"linked")),/link or special file/);
 }finally{await rm(root,{recursive:true,force:true});}
});
