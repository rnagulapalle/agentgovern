import {describe,it,expect,beforeAll,afterAll,afterEach,vi} from "vitest";
import {mkdtemp,readFile,writeFile,rm,readdir,stat,chmod,symlink,link,mkdir} from "node:fs/promises";
import {resolve} from "node:path";
import {tmpdir} from "node:os";
import {createHash,createPublicKey,generateKeyPairSync,X509Certificate,verify,createPrivateKey,sign} from "node:crypto";
import {parseEnv} from "node:util";
import {generateTemporalConfiguration} from "./staging-temporal-config.mjs";
import {prepareTemporalRenewal,renewalIdentity,temporalRenewalCLI} from "./persistent-temporal-renewal.mjs";
const namespace="looplabs-staging-renewal-test";
let parent,installation,identity,originals,protectedOriginals,sequence=0;
const files=["temporal-installation.json","temporal-auth.env","jwks.json","offline/signing.pem","client-tls/ca.pem","client-tls/client.pem","client-tls/client.key","server-tls/ca.pem","server-tls/server.pem","server-tls/server.key"];
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const output=()=>resolve(parent,`generation-${sequence++}`);
const unchanged=async()=>{for(const [file,bytes] of [...originals,...protectedOriginals])expect(await readFile(resolve(installation,file))).toEqual(bytes);};
beforeAll(async()=>{
 parent=await mkdtemp(resolve(tmpdir(),"ll-transport-renewal-"));installation=resolve(parent,"installation");
 await generateTemporalConfiguration(installation,namespace);
 originals=new Map(await Promise.all(files.map(async file=>[file,await readFile(resolve(installation,file))])));
 protectedOriginals=new Map(await Promise.all(["offline/administrator.json","offline/ca.key","offline/schema.env","temporal-db.env","server.yaml"].map(async file=>[file,await readFile(resolve(installation,file))])));
 const jwk=JSON.parse(originals.get("jwks.json")).keys[0];
 identity={namespace,kid:jwk.kid,issuerSpkiSha256:sha(createPublicKey({key:jwk,format:"jwk"}).export({format:"der",type:"spki"})),caFingerprint:new X509Certificate(originals.get("client-tls/ca.pem")).fingerprint256,clientFingerprint:new X509Certificate(originals.get("client-tls/client.pem")).fingerprint256,serverFingerprint:new X509Certificate(originals.get("server-tls/server.pem")).fingerprint256};
},30000);
afterEach(async()=>{
 vi.useRealTimers();
 for(const [file,bytes] of originals){await rm(resolve(installation,file),{force:true});await writeFile(resolve(installation,file),bytes,{mode:file.includes(".key")||file.includes("signing")||file.includes(".env")||file.includes("installation.json")?0o600:0o644});}
 await chmod(installation,0o700);
});
afterAll(async()=>{await rm(parent,{recursive:true,force:true});});
describe("prepared persistent Temporal transport renewal",()=>{
 it("uses the retained actual signer for exact scoped permissions and leaves original generation untouched",async()=>{
  const generation=output(),result=await prepareTemporalRenewal(installation,generation,identity,{ttlSeconds:300});
  expect(result).toMatchObject({...identity,activated:false,rotatedCertificates:false,rotatedIssuer:false});
  const env=parseEnv(await readFile(resolve(generation,"temporal-auth.env"),"utf8"));
  const [header,body,signature]=env.LOOPLABS_TEMPORAL_API_KEY.split(".");
  const jwk=JSON.parse(originals.get("jwks.json")).keys[0],key=createPublicKey({key:jwk,format:"jwk"});
  expect(verify("RSA-SHA256",Buffer.from(`${header}.${body}`),key,Buffer.from(signature,"base64url"))).toBe(true);
  expect(verify("RSA-SHA256",Buffer.from(`${header}.${body}changed`),key,Buffer.from(signature,"base64url"))).toBe(false);
  const claims=JSON.parse(Buffer.from(body,"base64url"));expect(claims).toEqual({sub:namespace,permissions:[`${namespace}:read`,`${namespace}:write`,`${namespace}:worker`],iat:result.issuedAt,exp:result.expiresAt});expect(claims.exp-claims.iat).toBe(300);
  expect(Object.keys(env).sort()).toEqual(Object.keys(parseEnv(originals.get("temporal-auth.env").toString())).sort());
  expect((await stat(generation)).mode&0o777).toBe(0o700);
  for(const file of await readdir(generation)){expect((await stat(resolve(generation,file))).mode&0o777).toBe(0o600);expect(await readFile(resolve(generation,file),"utf8")).not.toContain("PRIVATE KEY");}
  expect(await readdir(generation)).toEqual(["temporal-auth.env","temporal-renewal.json"]);await unchanged();
 });
 it("requires exact independently supplied identity and bounded TTL",async()=>{
  for(const invalid of [null,{},[],{...identity,extra:true},{...identity,namespace:"temporal-system"},{...identity,kid:"bad key"},{...identity,issuerSpkiSha256:"bad"},{...identity,caFingerprint:"bad"}])expect(()=>renewalIdentity(invalid)).toThrow();
  for(const ttlSeconds of [0,299,86401,NaN,300.5,"300"])await expect(prepareTemporalRenewal(installation,output(),identity,{ttlSeconds})).rejects.toThrow(/^Staging transport renewal refused/);
  for(const invalid of [null,{}, {ttlSeconds:300,extra:true}])await expect(prepareTemporalRenewal(installation,output(),identity,invalid)).rejects.toThrow();
  await unchanged();
 });
 it("refuses wrong independent namespace, key ID, signer or certificate pins without output",async()=>{
  for(const changed of [{namespace:namespace+"-other"},{kid:"other-key"},{issuerSpkiSha256:"a".repeat(64)},...(["caFingerprint","clientFingerprint","serverFingerprint"].map(field=>({[field]:Array(32).fill("AA").join(":")})))]) {
   const generation=output();await expect(prepareTemporalRenewal(installation,generation,{...identity,...changed})).rejects.toThrow();await expect(stat(generation)).rejects.toMatchObject({code:"ENOENT"});
  }
  await unchanged();
 });
 it("refuses duplicate or in-place generation without overwriting either generation",async()=>{
  const generation=output();await prepareTemporalRenewal(installation,generation,identity);
  const initial=await readFile(resolve(generation,"temporal-auth.env"));
  await expect(prepareTemporalRenewal(installation,generation,identity)).rejects.toThrow();expect(await readFile(resolve(generation,"temporal-auth.env"))).toEqual(initial);
  for(const target of [installation,resolve(installation,"nested"),""])await expect(prepareTemporalRenewal(installation,target,identity)).rejects.toThrow();
  await expect(prepareTemporalRenewal("",output(),identity)).rejects.toThrow();await unchanged();
 });
 it("refuses output nested inside retained installation through a symlink ancestor",async()=>{
  const privateChild=resolve(installation,"private-child"),alias=resolve(parent,"installation-ancestor-alias");
  await mkdir(privateChild,{mode:0o700});await symlink(installation,alias);
  const generation=resolve(alias,"private-child","new-generation");
  try {
   await expect(prepareTemporalRenewal(installation,generation,identity)).rejects.toThrow(/^Staging transport renewal refused/);
   await expect(stat(generation)).rejects.toMatchObject({code:"ENOENT"});
   await expect(stat(resolve(privateChild,"new-generation"))).rejects.toMatchObject({code:"ENOENT"});
   await unchanged();
  }finally{await rm(alias);await rm(privateChild,{recursive:true,force:true});}
 });
 it("allows an expired transport JWT with the valid retained issuer, but refuses expired or insufficient certificates",async()=>{
  const meta=JSON.parse(originals.get("temporal-installation.json"));
  vi.setSystemTime((meta.expiresAt+60)*1000);const result=await prepareTemporalRenewal(installation,output(),identity,{ttlSeconds:300});expect(result.issuedAt).toBe(meta.expiresAt+60);
  const ca=new X509Certificate(originals.get("client-tls/ca.pem")),expiry=Date.parse(ca.validTo);
  for(const time of [expiry-100000,expiry+1000]){vi.setSystemTime(time);await expect(prepareTemporalRenewal(installation,output(),identity,{ttlSeconds:300})).rejects.toThrow();}
  await unchanged();
 });
 it("refuses changed metadata, TLS paths, admin scopes and invalid original signatures",async()=>{
  const metadata=JSON.parse(originals.get("temporal-installation.json"));
  for(const changed of [{version:2},{scope:"production"},{extra:true},{issuedAt:-1},{issuedAt:Math.floor(Date.now()/1000)+60},{expiresAt:metadata.issuedAt},{certificateExpiresAt:"wrong"},{namespace:namespace+"-other"}]) {
   await writeFile(resolve(installation,"temporal-installation.json"),JSON.stringify({...metadata,...changed}));await expect(prepareTemporalRenewal(installation,output(),identity)).rejects.toThrow();
  }
  await writeFile(resolve(installation,"temporal-installation.json"),originals.get("temporal-installation.json"));
  const env=parseEnv(originals.get("temporal-auth.env").toString()),parts=env.LOOPLABS_TEMPORAL_API_KEY.split(".");
  const signer=createPrivateKey(originals.get("offline/signing.pem"));
  const claims=JSON.parse(Buffer.from(parts[1],"base64url"));
  const adminBody=Buffer.from(JSON.stringify({...claims,permissions:["temporal-system:admin"]})).toString("base64url"),adminContent=`${parts[0]}.${adminBody}`;
  const admin=`${adminContent}.${sign("RSA-SHA256",Buffer.from(adminContent),signer).toString("base64url")}`;
  for(const value of [originals.get("temporal-auth.env").toString().replace("temporal:7233","production:7233"),originals.get("temporal-auth.env").toString()+"LOOPLABS_RECOVERY_EPOCH=forbidden\n",originals.get("temporal-auth.env").toString().replace(env.LOOPLABS_TEMPORAL_API_KEY,admin),originals.get("temporal-auth.env").toString().replace(env.LOOPLABS_TEMPORAL_API_KEY,`${parts[0]}.${parts[1]}.invalid`),originals.get("temporal-auth.env").toString().replace(env.LOOPLABS_TEMPORAL_API_KEY,"broken")]) {
   await writeFile(resolve(installation,"temporal-auth.env"),value);await expect(prepareTemporalRenewal(installation,output(),identity)).rejects.toThrow();
  }
 });
 it("refuses mismatched retained signer, JWKS and client private key",async()=>{
  const wrong=generateKeyPairSync("rsa",{modulusLength:2048});
  await writeFile(resolve(installation,"offline/signing.pem"),wrong.privateKey.export({format:"pem",type:"pkcs8"}));await expect(prepareTemporalRenewal(installation,output(),identity)).rejects.toThrow();
  await writeFile(resolve(installation,"offline/signing.pem"),originals.get("offline/signing.pem"));
  const jwk={...wrong.publicKey.export({format:"jwk"}),kid:identity.kid,alg:"RS256",use:"sig"};
  for(const keys of [[jwk],[],[{...jwk,d:"forbidden"}]]){await writeFile(resolve(installation,"jwks.json"),JSON.stringify({keys}));await expect(prepareTemporalRenewal(installation,output(),identity)).rejects.toThrow();}
  await writeFile(resolve(installation,"jwks.json"),originals.get("jwks.json"));
  await writeFile(resolve(installation,"client-tls/client.key"),wrong.privateKey.export({format:"pem",type:"pkcs8"}));await expect(prepareTemporalRenewal(installation,output(),identity)).rejects.toThrow();
 });
 it("refuses links, multiply-linked files and broadly readable signer or installation",async()=>{
  const signer=resolve(installation,"offline/signing.pem"),duplicate=resolve(parent,"linked-signer");
  await chmod(signer,0o644);await expect(prepareTemporalRenewal(installation,output(),identity)).rejects.toThrow();await chmod(signer,0o600);
  await link(signer,duplicate);await expect(prepareTemporalRenewal(installation,output(),identity)).rejects.toThrow();await rm(duplicate);
  await rm(signer);await writeFile(duplicate,originals.get("offline/signing.pem"),{mode:0o600});await symlink(duplicate,signer);await expect(prepareTemporalRenewal(installation,output(),identity)).rejects.toThrow();
  await rm(signer);await writeFile(signer,originals.get("offline/signing.pem"),{mode:0o600});await rm(duplicate);
  await chmod(installation,0o755);await expect(prepareTemporalRenewal(installation,output(),identity)).rejects.toThrow();await chmod(installation,0o700);
  const alias=resolve(parent,"linked-installation");await symlink(installation,alias);await expect(prepareTemporalRenewal(alias,output(),identity)).rejects.toThrow();await unchanged();
 });
 it("prints only bounded preparation evidence and sanitized CLI refusal",async()=>{
  const writer={log:vi.fn(),error:vi.fn()},file=resolve(parent,"independent-identity.json");await writeFile(file,JSON.stringify(identity),{mode:0o600});
  for(const args of [[],[installation,output(),file,"299"],[installation,output(),file,"300","extra"],[installation,output(),file,"secret"]])expect(await temporalRenewalCLI(args,writer)).toBe(1);
  expect(await temporalRenewalCLI([installation,output(),file,"300"],writer)).toBe(0);
  expect(writer.log.mock.calls[0][0]).not.toContain("PRIVATE KEY");expect(writer.log.mock.calls[0][0]).not.toContain("LOOPLABS_TEMPORAL_API_KEY");expect(writer.error.mock.calls.flat().join()).not.toContain("secret");await unchanged();
 });
});
