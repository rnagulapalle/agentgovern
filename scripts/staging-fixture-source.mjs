// Private build inputs come from an explicit commit, never a dirty checkout.
import {execFileSync} from "node:child_process";
import {mkdir,readFile,writeFile,readdir,lstat} from "node:fs/promises";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
const paths=["backend/app","backend/configs/hubspot","backend/configs/resend","backend/specs/resend"];
export async function prepareFixtureSource(repository,commit,hubspotSpec,specDigest,output) {
 if(!/^[a-f0-9]{40}$/.test(commit)||!/^[a-f0-9]{64}$/.test(specDigest))throw Error("Exact reviewed commit and spec digest required");
 const spec=await readFile(hubspotSpec);
 if(createHash("sha256").update(spec).digest("hex")!==specDigest)throw Error("Reviewed HubSpot spec differs");
 const actual=execFileSync("git",["-C",repository,"rev-parse",`${commit}^{commit}`],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
 if(actual!==commit)throw Error("Reviewed source commit unavailable");
 const tree=execFileSync("git",["-C",repository,"ls-tree","-rz",commit,"--",...paths],{encoding:"utf8",maxBuffer:4*1024*1024,stdio:["ignore","pipe","pipe"]});
 for(const entry of tree.split("\0").filter(Boolean))if(!/^(100644|100755) blob [a-f0-9]{40}\tbackend\//.test(entry))throw Error("Fixture source contains a link or special file");
 const archive=execFileSync("git",["-C",repository,"archive",commit,...paths],{maxBuffer:64*1024*1024,stdio:["ignore","pipe","pipe"]});
 await mkdir(output,{mode:0o700}); // exclusive; preserve partial state on failure
 execFileSync("tar",["-x","-C",resolve(output)],{input:archive,stdio:["pipe","ignore","pipe"]});
 const files=[];
 async function inspect(directory){for(const name of await readdir(directory)){const file=resolve(directory,name),stat=await lstat(file);if(stat.isDirectory())await inspect(file);else if(stat.isFile())files.push(file);else throw Error("Fixture source contains a link or special file");}}
 await inspect(resolve(output,"backend"));
 await mkdir(resolve(output,"backend/specs/hubspot"));
 await writeFile(resolve(output,"backend/specs/hubspot/openapi.yaml"),spec,{mode:0o600,flag:"wx"});
 const result={version:1,commit,paths,hubspotSpecSha256:specDigest,archiveSha256:createHash("sha256").update(archive).digest("hex"),trackedFiles:files.length,scope:"private committed fixture source preparation only",notVerified:["provider parity","image build and execution","complete platform or remote acceptance"]};
 await writeFile(resolve(output,"fixture-source-manifest.json"),JSON.stringify(result,null,2)+"\n",{mode:0o600,flag:"wx"});
 return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);
 if(args.length!==5)throw Error("Expected private repository, commit, HubSpot spec, spec digest and new private output directory");
 prepareFixtureSource(...args).then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error("Private fixture source preparation refused; retain any partial output. No source, secret or raw command printed.");process.exitCode=1;});
}
