import {readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {X509Certificate} from "node:crypto";
import {Connection} from "@temporalio/client";
import {stagingNamespace} from "./staging-temporal-config.mjs";
export async function bootstrapNamespace(directory,{address="temporal:7233",loopbackProof=false,connect=options=>Connection.connect(options)}={}) {
 if(address!=="temporal:7233" && !(loopbackProof && /^localhost:[0-9]{1,5}$/.test(address) && Number(address.split(":")[1])>=1 && Number(address.split(":")[1])<=65535))throw Error("Use the isolated service target");
 const dir=resolve(directory),installation=JSON.parse(await readFile(resolve(dir,"temporal-installation.json"),"utf8"));
 const namespace=stagingNamespace(installation.namespace);
 const now=Math.floor(Date.now()/1000);
 if(installation.version!==1 || !Number.isSafeInteger(installation.issuedAt) || !Number.isSafeInteger(installation.expiresAt) || installation.issuedAt>now || installation.expiresAt<=now || installation.expiresAt-installation.issuedAt>86400)throw Error("Staging credentials are expired or invalid; no automatic rotation");
 const admin=JSON.parse(await readFile(resolve(dir,"offline/administrator.json"),"utf8"));
 if(admin.namespace!==namespace || typeof admin.token!=="string")throw Error("Administrator credential does not match the installation");
 const ca=await readFile(resolve(dir,"client-tls/ca.pem"));
 if(new X509Certificate(ca).fingerprint256!==installation.caFingerprint)throw Error("Staging trust root changed");
 const connection=await connect({address,apiKey:admin.token,tls:{serverRootCACertificate:ca,clientCertPair:{crt:await readFile(resolve(dir,"client-tls/client.pem")),key:await readFile(resolve(dir,"client-tls/client.key"))}},connectTimeout:"5 seconds"});
 try {
  let description;
  try {description=await connection.workflowService.describeNamespace({namespace});}
  catch(error) {
   if(error.code!==5)throw error;
   await connection.workflowService.registerNamespace({namespace,workflowExecutionRetentionPeriod:{seconds:86400,nanos:0}});
   description=await connection.workflowService.describeNamespace({namespace});
  }
  if(description.namespaceInfo?.name!==namespace || description.namespaceInfo?.state!==1 || Number(description.config?.workflowExecutionRetentionTtl?.seconds)!==86400 || Number(description.config?.workflowExecutionRetentionTtl?.nanos||0)!==0)throw Error("Existing namespace differs; no implicit policy change");
  const result={scope:"isolated Temporal namespace provisioning only",namespace,retentionSeconds:86400,notVerified:["runtime workload authorization","compatible worker pollers","workflow execution/fault/replay","remote enterprise acceptance"]};
  await writeFile(resolve(dir,"namespace-bootstrap-evidence.json"),JSON.stringify(result,null,2)+"\n",{mode:0o600});
  return result;
 }finally{await connection.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const [directory,extra]=process.argv.slice(2);
 if(!directory||extra||process.env.LOOPLABS_STAGING_BOOTSTRAP!=="isolated")throw Error("Explicit isolated opt-in and private installation required");
 bootstrapNamespace(directory).then(result=>console.log(JSON.stringify(result,null,2))).catch(()=>{console.error("Namespace bootstrap refused or unavailable. No credentials printed and no execution was authorized.");process.exitCode=1;});
}
