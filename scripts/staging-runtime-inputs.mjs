import {mkdir,readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {parseEnv} from "node:util";
import {stagingConfiguration} from "../runtime/temporal/staging-preflight.ts";
import {stagingRecoveryEpoch} from "./staging-database-bootstrap.mjs";
import {recordCatalog} from "../lib/connectors/catalog.ts";

// Explicit assembly only: no enrollment, approvals, migrations or startup.
export function runtimeInputs(database,workload,temporal,settings) {
 const keys=["origin","buildId","taskQueue","records","connectorToken"];
 if(!settings || Object.keys(settings).sort().join()!==keys.sort().join())throw Error("Explicit reviewed staging settings required");
 const db=new URL(database.LOOPLABS_DATABASE_URL);
 if(!["postgres:","postgresql:"].includes(db.protocol)||db.hostname!=="application-db"||db.username!=="ll_runtime"||!db.password||db.pathname!=="/looplabs_staging"||db.search||db.hash||database.LOOPLABS_WORKSPACE_ID!=="local-proof")throw Error("Restricted isolated database required");
 const epoch=stagingRecoveryEpoch(database.LOOPLABS_RECOVERY_EPOCH);
 const origin=new URL(settings.origin);
 if(origin.protocol!=="https:"||origin.username||origin.password||origin.pathname!=="/"||origin.search||origin.hash)throw Error("Explicit HTTPS staging origin required");
 const tls={LOOPLABS_TEMPORAL_CA_PATH:"/run/temporal-tls/ca.pem",LOOPLABS_TEMPORAL_CERT_PATH:"/run/temporal-tls/client.pem",LOOPLABS_TEMPORAL_KEY_PATH:"/run/temporal-tls/client.key"};
 if(temporal.LOOPLABS_TEMPORAL_ADDRESS!=="temporal:7233"||!/^looplabs-staging-[a-z0-9-]+$/.test(temporal.LOOPLABS_TEMPORAL_NAMESPACE||"")||!temporal.LOOPLABS_TEMPORAL_API_KEY||Object.entries(tls).some(([k,v])=>temporal[k]!==v))throw Error("Generated authenticated staging transport required");
 const shared={LOOPLABS_DATABASE_URL:db.href,LOOPLABS_WORKSPACE_ID:"local-proof",LOOPLABS_RECOVERY_EPOCH:epoch,LOOPLABS_TEMPORAL_WORKSPACE:"staging",LOOPLABS_TEMPORAL_BUILD_ID:settings.buildId,LOOPLABS_TEMPORAL_RECORD_BUILD_ID:settings.buildId,LOOPLABS_RECORD_CATALOG:JSON.stringify({records:settings.records}),LOOPLABS_CONNECTOR_TWIN_URL:"http://connector-twin:8018",LOOPLABS_CONNECTOR_TWIN_TOKEN:settings.connectorToken};
 if(!Array.isArray(settings.records)||recordCatalog("local-proof",shared.LOOPLABS_RECORD_CATALOG).length!==settings.records.length)throw Error("Every configured record must belong to the isolated workspace");
 const worker={...shared,LOOPLABS_TEMPORAL_WORKER_TOKEN:workload.LOOPLABS_TEMPORAL_WORKER_TOKEN,LOOPLABS_TEMPORAL_ADDRESS:temporal.LOOPLABS_TEMPORAL_ADDRESS,LOOPLABS_TEMPORAL_NAMESPACE:temporal.LOOPLABS_TEMPORAL_NAMESPACE,LOOPLABS_TEMPORAL_API_KEY:temporal.LOOPLABS_TEMPORAL_API_KEY,...tls,LOOPLABS_TEMPORAL_TASK_QUEUE:settings.taskQueue};
 if(stagingConfiguration(worker).length)throw Error("Staging runtime prerequisites incomplete");
 // The web can opt in/save ownership, but receives no Temporal poller credential.
 return {web:{...shared,LOOPLABS_DURABLE_ORIGIN:origin.origin},worker};
}
export async function assembleRuntimeInputs(databaseDirectory,temporalDirectory,settingsFile,outputDirectory) {
 const env=async(dir,file)=>parseEnv(await readFile(resolve(dir,file),"utf8"));
 const inputs=runtimeInputs(await env(databaseDirectory,"runtime-db.env"),await env(databaseDirectory,"workload.env"),await env(temporalDirectory,"temporal-auth.env"),JSON.parse(await readFile(settingsFile,"utf8")));
 // Exclusive directory prevents a retry from replacing running authority.
 await mkdir(outputDirectory,{mode:0o700});
 for(const [role,values] of Object.entries(inputs)) {
  if(Object.values(values).some(v=>typeof v!=="string"||/[\r\n\0]/.test(v)))throw Error("Invalid environment value");
  await writeFile(resolve(outputDirectory,`${role}.env`),Object.entries(values).map(([k,v])=>`${k}=${v}`).join("\n")+"\n",{mode:0o600,flag:"wx"});
 }
 return {prepared:true,scope:"isolated role input assembly only",notVerified:["database privileges and migrations","credential validity and expiry","record enrollment and independent approvals","artifact identities","complete stack startup and browser execution"]};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 const args=process.argv.slice(2);
 if(args.length!==4||process.env.LOOPLABS_STAGING_BOOTSTRAP!=="isolated")throw Error("Explicit isolated opt-in and four private paths required");
 assembleRuntimeInputs(...args).then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error("Staging input assembly refused; retain partial private state for inspection. No credentials printed.");process.exitCode=1;});
}
