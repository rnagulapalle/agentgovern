// Offline image verification only: does not provision, start or cut over services.
import {execFileSync} from "node:child_process";
import {loadTestedImages} from "./staging-image-artifact.mjs";
try{
 if(process.env.LOOPLABS_STAGING_IMAGE_LOAD!=="isolated"||process.argv.length!==4)throw Error("Explicit offline verification required");
 const docker=(...args)=>execFileSync("docker",args,{encoding:"utf8",timeout:600000,maxBuffer:4*1024*1024,stdio:["ignore","pipe","pipe"]}).trim();
 const result=await loadTestedImages({directory:process.argv[2],expectedManifestSha256:process.argv[3],docker});
 console.log(JSON.stringify({verified:true,buildId:result.buildId,images:result.images,servicesStarted:false}));
}catch{console.error("Image artifact verification refused; no services started or credentials printed.");process.exitCode=1;}
