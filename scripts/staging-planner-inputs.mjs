// Optional web-only temporary model credentials. No cloud credential inheritance.
import {constants} from "node:fs";
import {open,mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
const fields=["model","region","accessKeyId","secretAccessKey","sessionToken","expiresAt"].sort().join();
export function plannerRuntimeInputs(value,now=Date.now()) {
 if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).sort().join()!==fields)throw Error("Explicit temporary planner input required");
 const {model,region,accessKeyId,secretAccessKey,sessionToken,expiresAt}=value;
 if(model!=="us.amazon.nova-lite-v1:0"||region!=="us-west-2")throw Error("Only the reviewed acknowledgement planner is supported");
 // ASIA plus a session token refuses ordinary IAM-user keys. This format check
 // does not attest to permissions: verify the issuer/session policy separately.
 if(typeof accessKeyId!=="string"||!/^ASIA[A-Z0-9]{16}$/.test(accessKeyId)||typeof secretAccessKey!=="string"||! /^[A-Za-z0-9/+]{40}$/.test(secretAccessKey)||typeof sessionToken!=="string"||sessionToken.length<40||sessionToken.length>16384||!/^[A-Za-z0-9/+=]+$/.test(sessionToken))throw Error("Temporary session credentials required");
 const expiry=typeof expiresAt==="string"?Date.parse(expiresAt):NaN;
 if(!Number.isFinite(now)||!Number.isFinite(expiry)||expiry-now<30*60*1000||expiry-now>3*60*60*1000)throw Error("Planner session needs 30 minutes to 3 hours remaining");
 return {LOOPLABS_CHAT_MODEL:model,AWS_REGION:region,AWS_ACCESS_KEY_ID:accessKeyId,AWS_SECRET_ACCESS_KEY:secretAccessKey,AWS_SESSION_TOKEN:sessionToken};
}
export async function preparePlannerInputs(inputFile,outputDirectory) {
 const file=await open(inputFile,constants.O_RDONLY|constants.O_NOFOLLOW);
 let value;
 try {
  const metadata=await file.stat();
  if(!metadata.isFile()||metadata.uid!==process.getuid()||(metadata.mode&0o077)!==0||metadata.nlink!==1||metadata.size>32768)throw Error("Private owned session file required");
  value=plannerRuntimeInputs(JSON.parse(await file.readFile("utf8")));
 }finally{await file.close();}
 // Separate exclusive output cannot replace an assembled web/worker authority.
 await mkdir(outputDirectory,{mode:0o700});
 await writeFile(resolve(outputDirectory,"web-planner.env"),Object.entries(value).map(([k,v])=>`${k}=${v}`).join("\n")+"\n",{mode:0o600,flag:"wx"});
 return {prepared:true,role:"web",model:value.LOOPLABS_CHAT_MODEL,notVerified:["session issuer and effective IAM permissions","actual model invocation","typed browser and saved-plan journey"]};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const args=process.argv.slice(2);
 if(args.length!==2||process.env.LOOPLABS_STAGING_BOOTSTRAP!=="isolated")throw Error("Explicit isolated opt-in and private planner paths required");
 preparePlannerInputs(...args).then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error("Temporary planner input refused; no credentials printed. Inspect private inputs before retrying.");process.exitCode=1;});
}
