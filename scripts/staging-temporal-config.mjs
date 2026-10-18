import {generateKeyPairSync,randomBytes,sign,X509Certificate} from "node:crypto";
import {mkdir,writeFile,readFile,chmod} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
const exec=promisify(execFile);
export function stagingNamespace(namespace) {
 if(typeof namespace!=="string" || !/^looplabs-staging-[a-z0-9][a-z0-9-]{0,39}$/.test(namespace))throw Error("Use an explicitly named isolated staging namespace");
 return namespace;
}
export function stagingServerConfig(password) {
 if(typeof password!=="string" || !/^[a-zA-Z0-9_-]{32,128}$/.test(password))throw Error("Invalid isolated persistence credential");
 const server={certFile:"/run/server-tls/server.pem",keyFile:"/run/server-tls/server.key",requireClientAuth:true,clientCaFiles:["/run/server-tls/ca.pem"]};
 const client={serverName:"temporal",rootCaFiles:["/run/server-tls/ca.pem"],disableHostVerification:false};
 const sql=databaseName=>({sql:{pluginName:"postgres12",databaseName,connectAddr:"temporal-db:5432",connectProtocol:"tcp",user:"temporal",password,maxConns:5,maxIdleConns:2}});
 const rpc=(grpcPort,membershipPort)=>({rpc:{grpcPort,membershipPort,bindOnIP:"0.0.0.0"}});
 return {log:{stdout:true,level:"warn"},persistence:{numHistoryShards:4,defaultStore:"default",visibilityStore:"visibility",datastores:{default:sql("temporal"),visibility:sql("temporal_visibility")}},
  global:{membership:{maxJoinDuration:"30s",broadcastAddress:"127.0.0.1"},tls:{internode:{server,client},frontend:{server,client}},authorization:{authorizer:"default",claimMapper:"default",permissionsClaimName:"permissions",jwtKeyProvider:{keySourceURIs:["http://authorization:8080/jwks"],refreshInterval:"1s"}}},
  services:{frontend:rpc(7233,6933),"internal-frontend":rpc(7236,6936),matching:rpc(7235,6935),history:rpc(7234,6934),worker:rpc(7239,6939)},
  clusterMetadata:{enableGlobalNamespace:false,failoverVersionIncrement:10,masterClusterName:"active",currentClusterName:"active",clusterInformation:{active:{enabled:true,initialFailoverVersion:1,rpcName:"frontend",rpcAddress:"127.0.0.1:7233"}}}};
}
export async function generateTemporalConfiguration(directory,namespace,{ttlSeconds=3600,certificateDays=7}={}) {
 stagingNamespace(namespace);
 if(!Number.isInteger(ttlSeconds)||ttlSeconds<300||ttlSeconds>86400||!Number.isInteger(certificateDays)||certificateDays<1||certificateDays>7)throw Error("Use bounded staging credential lifetimes");
 const dir=resolve(directory);
 // Exclusive creation prevents silent issuer/credential replacement on retry.
 await mkdir(dir,{mode:0o700});
 const offline=resolve(dir,"offline"),serverDir=resolve(dir,"server-tls"),clientDir=resolve(dir,"client-tls");
 await mkdir(offline,{mode:0o700});await mkdir(serverDir,{mode:0o755});await mkdir(clientDir,{mode:0o755});
 const secretFile=(path,body)=>writeFile(path,body,{mode:0o600,flag:"wx"});
 const openssl=(...args)=>exec("openssl",args,{cwd:offline,timeout:30000,maxBuffer:1024*1024});
 await openssl("req","-x509","-newkey","rsa:2048","-nodes","-keyout","ca.key","-out","ca.pem","-subj","/CN=LoopLabs isolated staging CA","-days",String(certificateDays));
 await chmod(resolve(offline,"ca.key"),0o600);
 for(const [name,usage,out] of [["server","serverAuth,clientAuth",serverDir],["client","clientAuth",clientDir]]) {
  await openssl("req","-newkey","rsa:2048","-nodes","-keyout",`${name}.key`,"-out",`${name}.csr`,"-subj",`/CN=${name==="server"?"temporal":"looplabs-staging"}`);
  await secretFile(resolve(offline,`${name}.ext`),`extendedKeyUsage=${usage}\nsubjectAltName=DNS:temporal,DNS:localhost,IP:127.0.0.1\n`);
  await openssl("x509","-req","-in",`${name}.csr`,"-CA","ca.pem","-CAkey","ca.key","-CAcreateserial","-out",`${name}.pem`,"-days",String(certificateDays),"-extfile",`${name}.ext`);
  // Individual runtime mounts need the non-root image to read these files. The
  // enclosing installation is 0700; never mount it or the offline directory.
  for(const file of [`${name}.pem`,`${name}.key`,"ca.pem"])await writeFile(resolve(out,file),await readFile(resolve(offline,file)),{mode:0o644,flag:"wx"});
  await chmod(resolve(offline,`${name}.key`),0o600);
 }
 const issuer=generateKeyPairSync("rsa",{modulusLength:2048}),kid=`staging-${randomBytes(8).toString("hex")}`;
 await secretFile(resolve(offline,"signing.pem"),issuer.privateKey.export({format:"pem",type:"pkcs8"}));
 const publicKey={...issuer.publicKey.export({format:"jwk"}),kid,alg:"RS256",use:"sig"};
 await writeFile(resolve(dir,"jwks.json"),JSON.stringify({keys:[publicKey]})+"\n",{mode:0o644,flag:"wx"});
 const issuedAt=Math.floor(Date.now()/1000),expiresAt=issuedAt+ttlSeconds;
 const jwt=permissions=>{
  const header=Buffer.from(JSON.stringify({alg:"RS256",kid,typ:"JWT"})).toString("base64url");
  const claims=Buffer.from(JSON.stringify({sub:namespace,permissions,iat:issuedAt,exp:expiresAt})).toString("base64url");
  const content=`${header}.${claims}`;return `${content}.${sign("RSA-SHA256",Buffer.from(content),issuer.privateKey).toString("base64url")}`;
 };
 await secretFile(resolve(offline,"administrator.json"),JSON.stringify({namespace,token:jwt(["temporal-system:admin"])}));
 await secretFile(resolve(dir,"temporal-auth.env"),`LOOPLABS_TEMPORAL_ADDRESS=temporal:7233\nLOOPLABS_TEMPORAL_NAMESPACE=${namespace}\nLOOPLABS_TEMPORAL_API_KEY=${jwt([`${namespace}:read`,`${namespace}:write`,`${namespace}:worker`])}\nLOOPLABS_TEMPORAL_CA_PATH=/run/temporal-tls/ca.pem\nLOOPLABS_TEMPORAL_CERT_PATH=/run/temporal-tls/client.pem\nLOOPLABS_TEMPORAL_KEY_PATH=/run/temporal-tls/client.key\n`);
 const password=randomBytes(32).toString("base64url");
 await secretFile(resolve(dir,"temporal-db.env"),`POSTGRES_USER=temporal\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=postgres\n`);
 await secretFile(resolve(offline,"schema.env"),`SQL_PASSWORD=${password}\n`);
 await writeFile(resolve(dir,"server.yaml"),JSON.stringify(stagingServerConfig(password),null,2),{mode:0o644,flag:"wx"});
 const ca=new X509Certificate(await readFile(resolve(offline,"ca.pem")));
 const result={version:1,namespace,issuedAt,expiresAt,certificateExpiresAt:ca.validTo,caFingerprint:ca.fingerprint256,scope:"isolated single-service staging credentials only"};
 await secretFile(resolve(dir,"temporal-installation.json"),JSON.stringify(result,null,2)+"\n");
 return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const [directory,namespace,extra]=process.argv.slice(2);
 if(!directory||!namespace||extra)throw Error("Expected a new private directory and isolated namespace name");
 generateTemporalConfiguration(directory,namespace).then(result=>console.log(JSON.stringify(result,null,2)))
  .catch(()=>{console.error("Staging credential preparation refused or failed. Existing credentials were not replaced; inspect any partial private output before retry.");process.exitCode=1;});
}
