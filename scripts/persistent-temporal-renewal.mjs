import {constants} from "node:fs";
import {open,lstat,mkdir,writeFile,rm,realpath} from "node:fs/promises";
import {resolve,basename} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash,createPrivateKey,createPublicKey,X509Certificate,sign,verify} from "node:crypto";
import {parseEnv} from "node:util";
import {stagingNamespace} from "./staging-temporal-config.mjs";
import {publicJwks} from "./staging-authorization.mjs";
const fingerprint=/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;
const identityKeys=["namespace","kid","issuerSpkiSha256","caFingerprint","clientFingerprint","serverFingerprint"].sort().join();
export function renewalIdentity(value) {
 if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).sort().join()!==identityKeys)throw Error("Independent staging transport identity required");
 stagingNamespace(value.namespace);
 if(typeof value.kid!=="string"||!/^[a-zA-Z0-9_-]{1,64}$/.test(value.kid)||typeof value.issuerSpkiSha256!=="string"||!/^[a-f0-9]{64}$/.test(value.issuerSpkiSha256)||![value.caFingerprint,value.clientFingerprint,value.serverFingerprint].every(v=>typeof v==="string"&&fingerprint.test(v)))throw Error("Independent staging transport identity invalid");
 return {...value};
}
async function ownedDirectory(path,privateRoot=false) {
 const stat=await lstat(path);
 if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid()||(stat.mode&0o022)||(privateRoot&&(stat.mode&0o777)!==0o700))throw Error("Owned staging directory required");
}
async function ownedFile(path,secret=false) {
 const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try {
  const stat=await handle.stat();
  if(!stat.isFile()||stat.nlink!==1||stat.uid!==process.getuid()||stat.size>65536||(stat.mode&0o022)||(secret&&(stat.mode&0o777)!==0o600))throw Error("Owned staging file required");
  return await handle.readFile();
 }finally{await handle.close();}
}
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const spki=key=>createPublicKey(key).export({format:"der",type:"spki"});
function tokenParts(token,key,kid,namespace,issuedAt,expiresAt) {
 if(typeof token!=="string"||token.length>16384)throw Error("Retained scoped transport credential invalid");
 const parts=token.split(".");
 if(parts.length!==3||parts.some(part=>!/^[a-zA-Z0-9_-]+$/.test(part)))throw Error("Retained scoped transport credential invalid");
 const header=JSON.parse(Buffer.from(parts[0],"base64url")),claims=JSON.parse(Buffer.from(parts[1],"base64url"));
 if(Object.keys(header).sort().join()!=="alg,kid,typ"||header.alg!=="RS256"||header.typ!=="JWT"||header.kid!==kid||Object.keys(claims).sort().join()!=="exp,iat,permissions,sub"||claims.sub!==namespace||claims.iat!==issuedAt||claims.exp!==expiresAt||!Array.isArray(claims.permissions)||claims.permissions.join()!==[`${namespace}:read`,`${namespace}:write`,`${namespace}:worker`].join()||!verify("RSA-SHA256",Buffer.from(`${parts[0]}.${parts[1]}`),key,Buffer.from(parts[2],"base64url")))throw Error("Retained scoped transport credential mismatch");
}
export async function prepareTemporalRenewal(installation,generation,expected,options={ttlSeconds:3600}) {
 let createdPath;
 try {
  const identity=renewalIdentity(expected);
  if(!options||Object.keys(options).join()!=="ttlSeconds"||!Number.isInteger(options.ttlSeconds)||options.ttlSeconds<300||options.ttlSeconds>86400)throw Error("Bounded transport lifetime required");
  if(typeof installation!=="string"||!installation.trim()||typeof generation!=="string"||!generation.trim())throw Error("Explicit private generations required");
  const dir=resolve(installation),output=resolve(generation);
  if(output===dir||output.startsWith(dir+"/"))throw Error("Separate fresh private generation required");
  await ownedDirectory(dir,true);
  // A real final parent can still be reached through an aliased ancestor.
  // Resolve both roots before any output write; never nest a new generation
  // inside the retained installation under another pathname.
  const canonicalInstallation=await realpath(dir),outputParent=resolve(output,"..");
  await ownedDirectory(outputParent,true);
  const canonicalOutput=resolve(await realpath(outputParent),basename(output));
  if(canonicalOutput===canonicalInstallation||canonicalOutput.startsWith(canonicalInstallation+"/"))throw Error("Separate fresh private generation required");
  for(const child of ["offline","client-tls","server-tls"])await ownedDirectory(resolve(dir,child),child==="offline");
  const meta=JSON.parse(await ownedFile(resolve(dir,"temporal-installation.json"),true)),now=Math.floor(Date.now()/1000),expiresAt=now+options.ttlSeconds;
  if(Object.keys(meta).sort().join()!==["version","namespace","issuedAt","expiresAt","certificateExpiresAt","caFingerprint","scope"].sort().join()||meta.scope!=="isolated single-service staging credentials only"||meta.version!==1||meta.namespace!==identity.namespace||!Number.isSafeInteger(meta.issuedAt)||meta.issuedAt<0||!Number.isSafeInteger(meta.expiresAt)||meta.issuedAt>now||meta.expiresAt-meta.issuedAt<300||meta.expiresAt-meta.issuedAt>86400||meta.caFingerprint!==identity.caFingerprint)throw Error("Installation metadata mismatch");
  const signing=createPrivateKey(await ownedFile(resolve(dir,"offline/signing.pem"),true));
  if(signing.asymmetricKeyType!=="rsa"||(signing.asymmetricKeyDetails?.modulusLength||0)<2048||hash(spki(signing))!==identity.issuerSpkiSha256)throw Error("Retained issuer mismatch");
  const jwks=JSON.parse(publicJwks((await ownedFile(resolve(dir,"jwks.json"))).toString()));
  const key=jwks.keys.find(key=>key.kid===identity.kid);
  if(!key||hash(createPublicKey({key,format:"jwk"}).export({format:"der",type:"spki"}))!==identity.issuerSpkiSha256)throw Error("Public issuer mismatch");
  const ca=new X509Certificate(await ownedFile(resolve(dir,"client-tls/ca.pem"))),client=new X509Certificate(await ownedFile(resolve(dir,"client-tls/client.pem"))),server=new X509Certificate(await ownedFile(resolve(dir,"server-tls/server.pem")));
  const serverCa=new X509Certificate(await ownedFile(resolve(dir,"server-tls/ca.pem")));
  if(ca.fingerprint256!==identity.caFingerprint||serverCa.fingerprint256!==identity.caFingerprint||client.fingerprint256!==identity.clientFingerprint||server.fingerprint256!==identity.serverFingerprint||!ca.ca||!ca.verify(ca.publicKey)||!client.verify(ca.publicKey)||!server.verify(ca.publicKey)||!client.checkIssued(ca)||!server.checkIssued(ca)||!client.keyUsage?.includes("1.3.6.1.5.5.7.3.2")||!server.keyUsage?.includes("1.3.6.1.5.5.7.3.1")||!server.checkHost("temporal")||meta.certificateExpiresAt!==ca.validTo)throw Error("Retained certificate identity mismatch");
  for(const certificate of [ca,client,server])if(Date.parse(certificate.validFrom)>now*1000||Date.parse(certificate.validTo)<=expiresAt*1000)throw Error("Transport certificate lifetime insufficient");
  if(!client.checkPrivateKey(createPrivateKey(await ownedFile(resolve(dir,"client-tls/client.key"))))||!server.checkPrivateKey(createPrivateKey(await ownedFile(resolve(dir,"server-tls/server.key")))))throw Error("Retained certificate key mismatch");
  const env=parseEnv((await ownedFile(resolve(dir,"temporal-auth.env"),true)).toString());
  const expectedEnv={LOOPLABS_TEMPORAL_ADDRESS:"temporal:7233",LOOPLABS_TEMPORAL_NAMESPACE:identity.namespace,LOOPLABS_TEMPORAL_CA_PATH:"/run/temporal-tls/ca.pem",LOOPLABS_TEMPORAL_CERT_PATH:"/run/temporal-tls/client.pem",LOOPLABS_TEMPORAL_KEY_PATH:"/run/temporal-tls/client.key"};
  if(Object.keys(env).sort().join()!==[...Object.keys(expectedEnv),"LOOPLABS_TEMPORAL_API_KEY"].sort().join()||Object.entries(expectedEnv).some(([key,value])=>env[key]!==value))throw Error("Retained transport configuration mismatch");
  tokenParts(env.LOOPLABS_TEMPORAL_API_KEY,createPublicKey(signing),identity.kid,identity.namespace,meta.issuedAt,meta.expiresAt);
  const header=Buffer.from(JSON.stringify({alg:"RS256",kid:identity.kid,typ:"JWT"})).toString("base64url"),body=Buffer.from(JSON.stringify({sub:identity.namespace,permissions:[`${identity.namespace}:read`,`${identity.namespace}:write`,`${identity.namespace}:worker`],iat:now,exp:expiresAt})).toString("base64url"),content=`${header}.${body}`;
  const token=`${content}.${sign("RSA-SHA256",Buffer.from(content),signing).toString("base64url")}`;
  await ownedDirectory(resolve(canonicalOutput,".."),true);await mkdir(canonicalOutput,{mode:0o700});createdPath=canonicalOutput;
  const result={version:1,scope:"prepared staging transport JWT only",...identity,issuedAt:now,expiresAt,certificateExpiresAt:ca.validTo,activated:false,rotatedCertificates:false,rotatedIssuer:false};
  await writeFile(resolve(canonicalOutput,"temporal-auth.env"),Object.entries({...env,LOOPLABS_TEMPORAL_API_KEY:token}).map(([key,value])=>`${key}=${value}`).join("\n")+"\n",{mode:0o600,flag:"wx"});
  await writeFile(resolve(canonicalOutput,"temporal-renewal.json"),JSON.stringify(result,null,2)+"\n",{mode:0o600,flag:"wx"});
  return result;
 }catch{if(createdPath)await rm(createdPath,{recursive:true,force:true});throw Error("Staging transport renewal refused or unavailable; current inputs remain unchanged");}
}
export async function temporalRenewalCLI(args,output=console) {
 try {
  const [installation,generation,identityFile,ttl,extra]=args;
  if(!installation||!generation||!identityFile||!ttl||extra||!/^[0-9]+$/.test(ttl))throw Error("Explicit transport renewal inputs required");
  const identity=JSON.parse(await ownedFile(resolve(identityFile),true));
  output.log(JSON.stringify(await prepareTemporalRenewal(installation,generation,identity,{ttlSeconds:Number(ttl)}),null,2));return 0;
 }catch{output.error("Staging transport renewal refused or unavailable; no credentials printed or activated.");return 1;}
}
if(process.argv[1]===fileURLToPath(import.meta.url))process.exitCode=await temporalRenewalCLI(process.argv.slice(2));
