import {describe,it,expect,beforeAll,afterAll} from "vitest";
import {mkdtemp,readFile,writeFile,stat,rm} from "node:fs/promises";
import {resolve} from "node:path";
import {tmpdir} from "node:os";
import {X509Certificate,createPrivateKey,createPublicKey,verify} from "node:crypto";
import {createServer,connect} from "node:tls";
import {parseEnv} from "node:util";
import {generateTemporalConfiguration,stagingNamespace,stagingServerConfig} from "./staging-temporal-config.mjs";
import {bootstrapNamespace} from "./staging-namespace-bootstrap.mjs";
let parent,dir,meta;
const namespace="looplabs-staging-config-test";
const load=path=>readFile(resolve(dir,path));
beforeAll(async()=>{parent=await mkdtemp(resolve(tmpdir(),"ll-credentials-"));dir=resolve(parent,"installation");meta=await generateTemporalConfiguration(dir,namespace);},30000);
afterAll(async()=>{await rm(parent,{recursive:true,force:true});});
describe("staging Temporal credential preparation",()=>{
 it("requires an isolated namespace, bounded lifetime and exclusive directory",async()=>{
  for(const name of [null,"temporal-system","production","looplabs-staging-","looplabs-staging-../other"])expect(()=>stagingNamespace(name)).toThrow();
  expect(()=>stagingServerConfig("weak")).toThrow();
  for(const options of [{ttlSeconds:0},{ttlSeconds:86401},{ttlSeconds:NaN},{certificateDays:0},{certificateDays:8}])await expect(generateTemporalConfiguration(resolve(parent,"unused"),namespace,options)).rejects.toThrow();
  await expect(generateTemporalConfiguration(dir,namespace)).rejects.toThrow();
  expect(JSON.parse(await load("temporal-installation.json")).caFingerprint).toBe(meta.caFingerprint);
 });
 it("separates CA/signer/admin credentials from runtime mounts and signs only scoped workload authority",async()=>{
  for(const file of ["offline/ca.key","offline/signing.pem","offline/administrator.json","temporal-auth.env","temporal-db.env"])expect((await stat(resolve(dir,file))).mode&0o777).toBe(0o600);
  expect((await stat(dir)).mode&0o777).toBe(0o700);
  const jwks=JSON.parse(await load("jwks.json"));expect(Object.keys(jwks.keys[0]).sort()).toEqual(["alg","e","kid","kty","n","use"]);
  const env=parseEnv((await load("temporal-auth.env")).toString());
  const [header,claims,signature]=env.LOOPLABS_TEMPORAL_API_KEY.split(".");
  expect(verify("RSA-SHA256",Buffer.from(`${header}.${claims}`),createPublicKey({key:jwks.keys[0],format:"jwk"}),Buffer.from(signature,"base64url"))).toBe(true);
  const decoded=JSON.parse(Buffer.from(claims,"base64url"));
  expect(decoded.permissions).toEqual([`${namespace}:read`,`${namespace}:write`,`${namespace}:worker`]);expect(decoded.exp-decoded.iat).toBe(3600);
  expect((await load("temporal-auth.env")).includes(Buffer.from("temporal-system:admin"))).toBe(false);
  const config=JSON.parse(await load("server.yaml"));
  expect(config.global.tls.frontend.server.requireClientAuth).toBe(true);
  expect(config.global.tls.frontend.client.disableHostVerification).toBe(false);
  expect(config.global.authorization).toMatchObject({authorizer:"default",claimMapper:"default",permissionsClaimName:"permissions"});
  expect(config.global.authorization.jwtKeyProvider.keySourceURIs).toEqual(["http://authorization:8080/jwks"]);
  expect(config.persistence.datastores.default.sql.connectAddr).toBe("temporal-db:5432");
 });
 it("issues matching CA-trusted client/server certificates and enforces a real mutual TLS handshake",async()=>{
  const ca=await load("client-tls/ca.pem"),serverCert=await load("server-tls/server.pem"),serverKey=await load("server-tls/server.key"),clientCert=await load("client-tls/client.pem"),clientKey=await load("client-tls/client.key");
  const root=new X509Certificate(ca),cert=new X509Certificate(serverCert);
  expect(root.ca).toBe(true);expect(cert.verify(root.publicKey)).toBe(true);expect(cert.checkPrivateKey(createPrivateKey(serverKey))).toBe(true);expect(cert.checkHost("temporal")).toBe("temporal");
  const server=createServer({ca,cert:serverCert,key:serverKey,requestCert:true,rejectUnauthorized:true},socket=>socket.end("trusted"));
  server.on("tlsClientError",()=>{});
  await new Promise(r=>server.listen(0,"127.0.0.1",r));
  const exchange=options=>new Promise((resolve,reject)=>{
   const socket=connect({host:"127.0.0.1",port:server.address().port,servername:"temporal",ca,rejectUnauthorized:true,...options});let data="";
   socket.setTimeout(2000,()=>socket.destroy(Error("TLS exchange timed out")));
   socket.on("error",reject);socket.on("data",chunk=>{data+=chunk;});socket.on("end",()=>data==="trusted"?resolve(data):reject(Error("No authenticated response")));
  });
  try {expect(await exchange({cert:clientCert,key:clientKey})).toBe("trusted");await expect(exchange({})).rejects.toThrow();await expect(exchange({cert:clientCert,key:clientKey,servername:"wrong.example"})).rejects.toThrow();}
  finally{await new Promise(r=>server.close(r));}
 });
});
describe("namespace bootstrap RPC contract (mock RPC; not a Temporal proof)",()=>{
 const description=()=>({namespaceInfo:{name:namespace,state:1},config:{workflowExecutionRetentionTtl:{seconds:86400,nanos:0}}});
 it("creates only the missing namespace and checks retained policy on repeat",async()=>{
  let exists=false,registers=0,closed=0;
  const connect=async options=>{
   expect(options.address).toBe("temporal:7233");expect(options.tls.serverRootCACertificate.length).toBeGreaterThan(0);
   return {close:async()=>{closed++;},workflowService:{describeNamespace:async()=>{if(!exists)throw Object.assign(Error("missing"),{code:5});return description();},registerNamespace:async request=>{expect(request.namespace).toBe(namespace);expect(request.workflowExecutionRetentionPeriod.seconds).toBe(86400);registers++;exists=true;}}};
  };
  await bootstrapNamespace(dir,{connect});await bootstrapNamespace(dir,{connect});expect(registers).toBe(1);expect(closed).toBe(2);
 });
 it("refuses wrong targets, expired metadata, mismatched authority and trust roots before connection",async()=>{
  const connect=async()=>{throw Error("should not connect");};
  for(const address of ["production:7233","localhost:0","localhost:99999"])await expect(bootstrapNamespace(dir,{address,loopbackProof:true,connect})).rejects.toThrow("isolated service");
  for(const change of [{expiresAt:1},{expiresAt:undefined},{issuedAt:Math.floor(Date.now()/1000)+60},{caFingerprint:"changed"},{namespace:"production"}]) {
   await writeFile(resolve(dir,"temporal-installation.json"),JSON.stringify({...meta,...change}));
   await expect(bootstrapNamespace(dir,{connect})).rejects.toThrow();
  }
  await writeFile(resolve(dir,"temporal-installation.json"),JSON.stringify(meta));
  const administrator=await load("offline/administrator.json");
  await writeFile(resolve(dir,"offline/administrator.json"),JSON.stringify({namespace:"other",token:"invalid"}));
  await expect(bootstrapNamespace(dir,{connect})).rejects.toThrow("does not match");
  await writeFile(resolve(dir,"offline/administrator.json"),administrator);
 });
 it("does not turn permission failures or changed existing policy into a create/update",async()=>{
  let closed=0,registers=0;
  for(const response of [Object.assign(Error("denied"),{code:7}),{...description(),config:{workflowExecutionRetentionTtl:{seconds:172800}}},{...description(),namespaceInfo:{name:namespace,state:2}}]){
   const connect=async()=>({close:async()=>{closed++;},workflowService:{describeNamespace:async()=>{if(response instanceof Error)throw response;return response;},registerNamespace:async()=>{registers++;}}});
   await expect(bootstrapNamespace(dir,{connect})).rejects.toThrow();
  }
  expect(closed).toBe(3);expect(registers).toBe(0);
 });
});
