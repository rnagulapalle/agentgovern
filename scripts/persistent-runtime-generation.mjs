// Preparation only. The trusted caller owns authenticated artifact provenance,
// current release-gate success and actual image/build observations. A JSON
// receipt or this module's output never establishes deployment authority.
import {constants} from "node:fs";
import {open,lstat,realpath,mkdir,writeFile,rm} from "node:fs/promises";
import {resolve,basename,isAbsolute} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash,createPublicKey,createPrivateKey,X509Certificate,verify} from "node:crypto";
import {parseEnv} from "node:util";
import {isDeepStrictEqual} from "node:util";
import {runtimeInputs} from "./staging-runtime-inputs.mjs";
import {renewalIdentity} from "./persistent-temporal-renewal.mjs";
import {publicJwks} from "./staging-authorization.mjs";
import {stagingRecoveryEpoch} from "./staging-database-bootstrap.mjs";
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const digest=/^[a-f0-9]{64}$/;
function exact(value,keys) {return value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).sort().join()===keys.sort().join();}
async function directory(path,privateRoot=true) {
 const s=await lstat(path);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||(s.mode&0o022)||(privateRoot&&(s.mode&0o777)!==0o700))throw Error("Private owned directory required");return realpath(path);
}
async function read(path,secret=true) {
 const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const s=await f.stat();if(!s.isFile()||s.uid!==process.getuid()||s.nlink!==1||s.size>2*1024*1024||(s.mode&0o022)||(secret&&(s.mode&0o777)!==0o600))throw Error("Private owned file required");return await f.readFile();}finally{await f.close();}
}
function environment(bytes) {
 const text=bytes.toString(),keys=new Set();if(/[\r\0]/.test(text))throw Error("Malformed runtime inputs");
 for(const line of text.split("\n")){if(!line)continue;const match=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);if(!match||keys.has(match[1]))throw Error("Ambiguous runtime input");keys.add(match[1]);}
 const env=parseEnv(text);if(Object.keys(env).length!==keys.size)throw Error("Malformed runtime input");return env;
}
function credential(token,key,identity,now,fresh) {
 if(typeof token!=="string"||token.length>16384)throw Error("Transport credential missing");
 const parts=token.split(".");if(parts.length!==3||parts.some(p=>!/^[A-Za-z0-9_-]+$/.test(p)))throw Error("Transport credential malformed");
 const header=JSON.parse(Buffer.from(parts[0],"base64url")),body=JSON.parse(Buffer.from(parts[1],"base64url"));
 if(!exact(header,["alg","kid","typ"])||header.alg!=="RS256"||header.kid!==identity.kid||header.typ!=="JWT"||!exact(body,["sub","permissions","iat","exp"])||body.sub!==identity.namespace||!isDeepStrictEqual(body.permissions,[`${identity.namespace}:read`,`${identity.namespace}:write`,`${identity.namespace}:worker`])||!Number.isSafeInteger(body.iat)||body.iat<0||body.iat>now||!Number.isSafeInteger(body.exp)||body.exp-body.iat<300||body.exp-body.iat>86400||(fresh&&(now-body.iat>60||body.exp-now<240))||!verify("RSA-SHA256",Buffer.from(`${parts[0]}.${parts[1]}`),key,Buffer.from(parts[2],"base64url")))throw Error("Transport credential mismatch or stale");
 return body;
}
function artifactDescriptor(artifact,registry) {
 if(!Array.isArray(registry)||registry.length!==99||new Set(registry).size!==99||registry.some(f=>typeof f!=="string"||isAbsolute(f)||!f||f.split("/").some(p=>!p||p===".."||p==="."||p.startsWith("."))))throw Error("Exact approved runtime registry required");
 if(!exact(artifact,["buildId","images","sourceFingerprints"])||typeof artifact.buildId!=="string"||!/^ack-[a-f0-9]{64}$/.test(artifact.buildId)||!exact(artifact.images,["web","worker"])||Object.values(artifact.images).some(id=>typeof id!=="string"||!/^sha256:[a-f0-9]{64}$/.test(id))||artifact.images.web===artifact.images.worker||!exact(artifact.sourceFingerprints,[...registry])||Object.values(artifact.sourceFingerprints).some(v=>typeof v!=="string"||!digest.test(v)))throw Error("Independent accepted artifact descriptor required");
 return structuredClone(artifact);
}
export async function preparePersistentRuntimeGeneration(input) {
 let createdPath;
 try {
  if(!exact(input,["runtimeDirectory","installationDirectory","renewalDirectory","outputDirectory","identity","artifact","approvedRuntimeFiles","validateEligibility"])||typeof input.validateEligibility!=="function")throw Error("Trusted asynchronous eligibility verifier required");
  const artifact=artifactDescriptor(input.artifact,input.approvedRuntimeFiles),registry=[...input.approvedRuntimeFiles];
  if(!exact(input.identity,["transport","workspace","origin","recoveryEpoch","webSha256","workerSha256"])||input.identity.workspace!=="local-proof"||![input.identity.webSha256,input.identity.workerSha256].every(v=>typeof v==="string"&&digest.test(v)))throw Error("Independent installation identity required");
  const identity={...input.identity,transport:renewalIdentity(input.identity.transport)};stagingRecoveryEpoch(identity.recoveryEpoch);
  const observation=input.validateEligibility(structuredClone(artifact));
  if(!observation||typeof observation.then!=="function")throw Error("Asynchronous trusted eligibility observation required");
  const observed=await observation;
  if(!exact(observed,["eligible","buildId","images","sourceFingerprints"])||observed.eligible!==true||!isDeepStrictEqual({...observed,eligible:undefined},{...artifact,eligible:undefined}))throw Error("Accepted artifact eligibility or identity mismatch");
  for(const file of registry){const path=resolve(root,file);if(!(await realpath(path)).startsWith(root+"/")||sha(await read(path,false))!==artifact.sourceFingerprints[file])throw Error("Current approved source changed");}
  for(const key of ["runtimeDirectory","installationDirectory","renewalDirectory","outputDirectory"])if(typeof input[key]!=="string"||!input[key].trim())throw Error("Explicit private paths required");
  const roots=await Promise.all([input.runtimeDirectory,input.installationDirectory,input.renewalDirectory].map(path=>directory(resolve(path))));
  if(new Set(roots).size!==3)throw Error("Distinct private source generations required");
  const [runtime,installation,renewal]=roots,output=resolve(input.outputDirectory),parent=await directory(resolve(output,"..")),canonical=resolve(parent,basename(output));
  if(roots.some(path=>canonical===path||canonical.startsWith(path+"/")))throw Error("Fresh separate output generation required");
  for(const child of ["client-tls","server-tls"])await directory(resolve(installation,child),false);
  const webBytes=await read(resolve(runtime,"web.env")),workerBytes=await read(resolve(runtime,"worker.env"));
  if(sha(webBytes)!==identity.webSha256||sha(workerBytes)!==identity.workerSha256)throw Error("Current runtime generation changed");
  const web=environment(webBytes),worker=environment(workerBytes),temporal=environment(await read(resolve(renewal,"temporal-auth.env")));
  const transportKeys=["LOOPLABS_TEMPORAL_ADDRESS","LOOPLABS_TEMPORAL_NAMESPACE","LOOPLABS_TEMPORAL_API_KEY","LOOPLABS_TEMPORAL_CA_PATH","LOOPLABS_TEMPORAL_CERT_PATH","LOOPLABS_TEMPORAL_KEY_PATH"];
  if(!exact(temporal,[...transportKeys])||transportKeys.some(key=>key!=="LOOPLABS_TEMPORAL_API_KEY"&&temporal[key]!==worker[key])||worker.LOOPLABS_TEMPORAL_NAMESPACE!==identity.transport.namespace||worker.LOOPLABS_WORKSPACE_ID!==identity.workspace||worker.LOOPLABS_RECOVERY_EPOCH!==identity.recoveryEpoch||web.LOOPLABS_DURABLE_ORIGIN!==identity.origin||worker.LOOPLABS_TEMPORAL_API_KEY===temporal.LOOPLABS_TEMPORAL_API_KEY)throw Error("Only fresh transport JWT may change");
  const baseline=runtimeInputs({LOOPLABS_DATABASE_URL:worker.LOOPLABS_DATABASE_URL,LOOPLABS_WORKSPACE_ID:worker.LOOPLABS_WORKSPACE_ID,LOOPLABS_RECOVERY_EPOCH:worker.LOOPLABS_RECOVERY_EPOCH},{LOOPLABS_TEMPORAL_WORKER_TOKEN:worker.LOOPLABS_TEMPORAL_WORKER_TOKEN},Object.fromEntries(transportKeys.map(key=>[key,worker[key]])),{origin:identity.origin,buildId:artifact.buildId,taskQueue:worker.LOOPLABS_TEMPORAL_TASK_QUEUE,records:JSON.parse(worker.LOOPLABS_RECORD_CATALOG).records,connectorToken:worker.LOOPLABS_CONNECTOR_TWIN_TOKEN});
  if(!isDeepStrictEqual(worker,baseline.worker))throw Error("Current worker authority is not the reviewed runtime contract");
  const modelKeys=["LOOPLABS_CHAT_MODEL","AWS_REGION","AWS_ACCESS_KEY_ID","AWS_SECRET_ACCESS_KEY","AWS_SESSION_TOKEN"],cloud=Object.keys(web).filter(key=>modelKeys.includes(key));
  if(cloud.length!==0&&cloud.length!==modelKeys.length)throw Error("Incomplete web-only model input");
  const webBase=Object.fromEntries(Object.entries(web).filter(([key])=>!modelKeys.includes(key)));if(!isDeepStrictEqual(webBase,baseline.web))throw Error("Current web authority mismatch");
  const jwks=JSON.parse(publicJwks((await read(resolve(installation,"jwks.json"),false)).toString())),jwk=jwks.keys.find(k=>k.kid===identity.transport.kid);if(!jwk)throw Error("Issuer key missing");
  const key=createPublicKey({key:jwk,format:"jwk"});if(sha(key.export({format:"der",type:"spki"}))!==identity.transport.issuerSpkiSha256)throw Error("Issuer identity mismatch");
  const now=Math.floor(Date.now()/1000),claims=credential(temporal.LOOPLABS_TEMPORAL_API_KEY,key,identity.transport,now,true);credential(worker.LOOPLABS_TEMPORAL_API_KEY,key,identity.transport,now,false);
  const receipt=JSON.parse(await read(resolve(renewal,"temporal-renewal.json")));
  if(!exact(receipt,["version","scope",...Object.keys(identity.transport),"issuedAt","expiresAt","certificateExpiresAt","activated","rotatedCertificates","rotatedIssuer"])||receipt.version!==1||receipt.scope!=="prepared staging transport JWT only"||receipt.activated!==false||receipt.rotatedCertificates!==false||receipt.rotatedIssuer!==false||Object.entries(identity.transport).some(([k,v])=>receipt[k]!==v)||receipt.issuedAt!==claims.iat||receipt.expiresAt!==claims.exp)throw Error("Verified fresh transport receipt required");
  const ca=new X509Certificate(await read(resolve(installation,"client-tls/ca.pem"),false)),client=new X509Certificate(await read(resolve(installation,"client-tls/client.pem"),false)),server=new X509Certificate(await read(resolve(installation,"server-tls/server.pem"),false)),serverCa=new X509Certificate(await read(resolve(installation,"server-tls/ca.pem"),false));
  if(ca.fingerprint256!==identity.transport.caFingerprint||serverCa.fingerprint256!==identity.transport.caFingerprint||client.fingerprint256!==identity.transport.clientFingerprint||server.fingerprint256!==identity.transport.serverFingerprint||!ca.ca||!ca.verify(ca.publicKey)||!client.verify(ca.publicKey)||!server.verify(ca.publicKey)||!client.checkIssued(ca)||!server.checkIssued(ca)||!client.keyUsage?.includes("1.3.6.1.5.5.7.3.2")||!server.keyUsage?.includes("1.3.6.1.5.5.7.3.1")||!server.checkHost("temporal")||receipt.certificateExpiresAt!==ca.validTo)throw Error("Transport certificate identity mismatch");
  for(const cert of [ca,client,server])if(Date.parse(cert.validFrom)>now*1000||Date.parse(cert.validTo)<=claims.exp*1000)throw Error("Transport certificate expired or insufficient");
  if(!client.checkPrivateKey(createPrivateKey(await read(resolve(installation,"client-tls/client.key"),false)))||!server.checkPrivateKey(createPrivateKey(await read(resolve(installation,"server-tls/server.key"),false))))throw Error("Transport certificate key mismatch");
  const workerText=workerBytes.toString().replace(/^LOOPLABS_TEMPORAL_API_KEY=.*$/m,`LOOPLABS_TEMPORAL_API_KEY=${temporal.LOOPLABS_TEMPORAL_API_KEY}`);
  const result={version:1,scope:"prepared persistent runtime input generation only",buildId:artifact.buildId,images:artifact.images,sourceFingerprints:artifact.sourceFingerprints,webUnchanged:true,changedWorkerKeys:["LOOPLABS_TEMPORAL_API_KEY"],schedulerUsesWorkerInput:true,transportExpiresAt:claims.exp,activated:false,releaseEligibilityEstablished:false,notVerified:["persistent database/build prerequisites","actual container image identity","namespace and poller readiness","release activation and rollback"]};
  await mkdir(canonical,{mode:0o700});createdPath=canonical;
  await writeFile(resolve(canonical,"web.env"),webBytes,{mode:0o600,flag:"wx"});await writeFile(resolve(canonical,"worker.env"),workerText,{mode:0o600,flag:"wx"});await writeFile(resolve(canonical,"runtime-generation.json"),JSON.stringify(result,null,2)+"\n",{mode:0o600,flag:"wx"});return result;
 }catch{if(createdPath)await rm(createdPath,{recursive:true,force:true});throw Error("Persistent runtime preparation refused or unavailable; current inputs remain unchanged");}
}
