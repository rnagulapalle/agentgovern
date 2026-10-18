// Compose explicitly prepared planner authority into the web role only.
import {constants} from "node:fs";
import {open,readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {parseEnv} from "node:util";
import {preparePlannerInputs} from "./staging-planner-inputs.mjs";
async function roleInput(path){
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const s=await file.stat();if(!s.isFile()||s.uid!==process.getuid()||(s.mode&0o077)!==0||s.nlink!==1||s.size>65536)throw Error("Private owned runtime input required");const text=await file.readFile("utf8");const env=parseEnv(text);if(Object.keys(env).some(k=>k.startsWith("AWS_")||k==="LOOPLABS_CHAT_MODEL"))throw Error("Runtime role already carries cloud authority");return text;}finally{await file.close();}
}
export async function attachPlannerInputs(runtimeDirectory,inputFile,outputDirectory){
 const web=await roleInput(resolve(runtimeDirectory,"web.env")),worker=await roleInput(resolve(runtimeDirectory,"worker.env"));
 await preparePlannerInputs(inputFile,outputDirectory);
 const planner=await readFile(resolve(outputDirectory,"web-planner.env"),"utf8");
 await writeFile(resolve(outputDirectory,"web.env"),web+"\n"+planner,{mode:0o600,flag:"wx"});
 await writeFile(resolve(outputDirectory,"worker.env"),worker,{mode:0o600,flag:"wx"});
 return {prepared:true,role:"web",workerUnchanged:true};
}
