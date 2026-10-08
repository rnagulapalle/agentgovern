// Disposable self-hosted acceptance environment. Never accesses production.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { generateKeyPairSync, sign, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { Client, Connection } from "@temporalio/client";
import assert from "node:assert/strict";
const exec = promisify(execFile);
export async function containerEnvironment(dir: string) {
  const prefix=`ll-tls-${randomBytes(6).toString("hex")}`;
  const network=prefix, server=`${prefix}-server`, postgres=`${prefix}-postgres`, volume=`${prefix}-data`;
  const namespace="looplabs-proof", otherNamespace="other-proof";
  const password=randomBytes(24).toString("hex");
  const tlsDir=resolve(dir,"tls");await mkdir(tlsDir,{mode:0o755});
  const ownedContainers:string[]=[], ownedVolumes:string[]=[];
  const checks:string[]=[];
  const docker=async (...args:string[]) => (await exec("docker",args,{maxBuffer:8*1024*1024,timeout:180000})).stdout.trim();
  const openssl=async (...args:string[]) => {await exec("openssl",args,{cwd:tlsDir,timeout:30000});};
  const privateEnv=async(name:string,values:Record<string,string>)=>{
    const file=resolve(dir,name);await writeFile(file,Object.entries(values).map(([k,v])=>`${k}=${v}`).join("\n")+"\n",{mode:0o600});return file;
  };
  let jwks:ReturnType<typeof createServer>|undefined, connection:Connection|undefined;
  let signing=generateKeyPairSync("rsa",{modulusLength:2048}), kid="proof-1";
  const jwt=(permissions:string[], expires=3600)=>{
    const header=Buffer.from(JSON.stringify({alg:"RS256",kid,typ:"JWT"})).toString("base64url");
    const claims=Buffer.from(JSON.stringify({sub:"looplabs-proof",permissions,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+expires})).toString("base64url");
    const body=`${header}.${claims}`;return `${body}.${sign("RSA-SHA256",Buffer.from(body),signing.privateKey).toString("base64url")}`;
  };
  const scoped=()=>jwt([`${namespace}:read`,`${namespace}:write`,`${namespace}:worker`]);
  let workloadKey=scoped();
  const teardown=async()=>{
    await docker("logs",server).then(s=>writeFile(resolve(".local/temporal-container-service.log"),s,{mode:0o600})).catch(()=>{});
    await connection?.close();
    for(const name of ownedContainers.reverse()) await docker("rm","-f",name).catch(()=>{});
    for(const name of ownedVolumes) await docker("volume","rm",name).catch(()=>{});
    await docker("network","rm",network).catch(()=>{});
    if(jwks) await new Promise<void>(r=>jwks!.close(()=>r()));
  };
  try {
    await openssl("req","-x509","-newkey","rsa:2048","-nodes","-keyout","ca.key","-out","ca.pem","-subj","/CN=LoopLabs disposable proof CA","-days","1");
    for(const [name,usage] of [["server","serverAuth,clientAuth"],["client","clientAuth"]]) {
      await openssl("req","-newkey","rsa:2048","-nodes","-keyout",`${name}.key`,"-out",`${name}.csr`,"-subj",`/CN=${name === "server" ? "temporal" : "looplabs-proof"}`);
      await writeFile(resolve(tlsDir,`${name}.ext`),`extendedKeyUsage=${usage}\nsubjectAltName=DNS:temporal,DNS:localhost,IP:127.0.0.1\n`);
      await openssl("x509","-req","-in",`${name}.csr`,"-CA","ca.pem","-CAkey","ca.key","-CAcreateserial","-out",`${name}.pem`,"-days","1","-extfile",`${name}.ext`);
    }
    await openssl("req","-x509","-newkey","rsa:2048","-nodes","-keyout","untrusted.key","-out","untrusted.pem","-subj","/CN=Untrusted disposable client","-days","1");
    for(const file of ["server.key","client.key"]) await chmod(resolve(tlsDir,file),0o644);
    jwks=createServer((req,res)=>{
      if(req.url!=="/jwks") {res.writeHead(404);res.end();return;}
      res.setHeader("Content-Type","application/json");res.end(JSON.stringify({keys:[{...signing.publicKey.export({format:"jwk"}),kid,use:"sig",alg:"RS256"}]}));
    });
    await new Promise<void>(r=>jwks!.listen(0,"0.0.0.0",r));
    const jwksAddress=jwks.address();assert(jwksAddress&&typeof jwksAddress!=="string");
    await docker("network","create",network);await docker("volume","create",volume);ownedVolumes.push(volume);
    const pgEnv=await privateEnv("postgres.env",{POSTGRES_USER:"temporal",POSTGRES_PASSWORD:password});
    await docker("run","-d","--name",postgres,"--network",network,"--network-alias","postgres","--env-file",pgEnv,"--mount",`type=volume,src=${volume},dst=/var/lib/postgresql/data`,"--memory","512m","postgres:16");ownedContainers.push(postgres);
    for(let i=0;;i++) {try {await docker("exec",postgres,"pg_isready","-U","temporal");break;}catch {if(i>60)throw Error("Proof PostgreSQL did not become ready");await new Promise(r=>setTimeout(r,500));}}
    const dbEnv=await privateEnv("schema.env",{SQL_PASSWORD:password});
    for(const [db,kind] of [["temporal","temporal"],["temporal_visibility","visibility"]]) {
      const base=["run","--rm","--network",network,"--env-file",dbEnv,"--entrypoint","temporal-sql-tool","temporalio/admin-tools:1.31.0","--plugin","postgres12","--ep","postgres","-u","temporal","-p","5432","--db",db];
      await docker(...base,"create");await docker(...base,"setup-schema","-v","0.0");await docker(...base,"update-schema","-d",`/etc/temporal/schema/postgresql/v12/${kind}/versioned`);
    }
    const serverEnv=await privateEnv("server.env",{TEMPORAL_SERVICES:"frontend,matching,history,worker,internal-frontend"});
    const tlsServer={certFile:"/proof-tls/server.pem",keyFile:"/proof-tls/server.key",requireClientAuth:true,clientCaFiles:["/proof-tls/ca.pem"]};
    const tlsClient={serverName:"temporal",rootCaFiles:["/proof-tls/ca.pem"],disableHostVerification:false};
    const sql=(databaseName:string)=>({sql:{pluginName:"postgres12",databaseName,connectAddr:"postgres:5432",connectProtocol:"tcp",user:"temporal",password,maxConns:5,maxIdleConns:2}});
    const rpc=(grpcPort:number,membershipPort:number)=>({rpc:{grpcPort,membershipPort,bindOnIP:"0.0.0.0"}});
    const config={log:{stdout:true,level:"warn"},persistence:{numHistoryShards:4,defaultStore:"default",visibilityStore:"visibility",datastores:{default:sql("temporal"),visibility:sql("temporal_visibility")}},
      global:{membership:{maxJoinDuration:"30s",broadcastAddress:"127.0.0.1"},tls:{internode:{server:tlsServer,client:tlsClient},frontend:{server:tlsServer,client:tlsClient}},
        authorization:{authorizer:"default",claimMapper:"default",permissionsClaimName:"permissions",jwtKeyProvider:{keySourceURIs:[`http://host.docker.internal:${jwksAddress.port}/jwks`],refreshInterval:"1s"}}},
      services:{frontend:rpc(7233,6933),"internal-frontend":rpc(7236,6936),matching:rpc(7235,6935),history:rpc(7234,6934),worker:rpc(7239,6939)},
      clusterMetadata:{enableGlobalNamespace:false,failoverVersionIncrement:10,masterClusterName:"active",currentClusterName:"active",clusterInformation:{active:{enabled:true,initialFailoverVersion:1,rpcName:"frontend",rpcAddress:"127.0.0.1:7233"}}}};
    const configPath=resolve(dir,"server.yaml");await writeFile(configPath,JSON.stringify(config),{mode:0o644});
    const reservation=createTcpServer();await new Promise<void>(r=>reservation.listen(0,"127.0.0.1",r));
    const endpoint=reservation.address();assert(endpoint&&typeof endpoint!=="string");
    const frontendPort=endpoint.port;await new Promise<void>(r=>reservation.close(()=>r()));
    await docker("run","-d","--name",server,"--network",network,"--network-alias","temporal","--add-host","host.docker.internal:host-gateway","--env-file",serverEnv,"--mount",`type=bind,src=${configPath},dst=/proof-config.yaml,readonly`,"--mount",`type=bind,src=${tlsDir},dst=/proof-tls,readonly`,"-p",`127.0.0.1:${frontendPort}:7233`,"--memory","1536m","--entrypoint","temporal-server","temporalio/server:1.31.0","--config-file","/proof-config.yaml","start");ownedContainers.push(server);
    const mapped=await docker("port",server,"7233");const address=`localhost:${mapped.split(":").pop()}`;
    const tls={serverRootCACertificate:await readFile(resolve(tlsDir,"ca.pem")),clientCertPair:{crt:await readFile(resolve(tlsDir,"client.pem")),key:await readFile(resolve(tlsDir,"client.key"))}};
    for(let i=0;;i++) {try {connection=await Connection.connect({address,tls,apiKey:jwt(["temporal-system:admin"]),connectTimeout:"1 second"});await connection.workflowService.listNamespaces({pageSize:10});break;}catch {await connection?.close();connection=undefined;if(i>100)throw Error("Authenticated proof Temporal service not ready; inspect private server logs");await new Promise(r=>setTimeout(r,500));}}
    const retention=(await connection.workflowService.describeNamespace({namespace:"temporal-system"})).config?.workflowExecutionRetentionTtl;
    assert(retention,"System namespace retention required for isolated namespace setup");
    for(const name of [namespace,otherNamespace]) await connection.workflowService.registerNamespace({namespace:name,workflowExecutionRetentionPeriod:retention});
    checks.push("Actual PostgreSQL-backed Temporal service accepts trusted mTLS and signed namespace-scoped JWT credentials");
    const denied=async(key:string,target:string)=>{
      let c:Connection|undefined;
      try {await assert.rejects(async()=>{c=await Connection.connect({address,tls,apiKey:key,connectTimeout:"2 seconds"});await c.workflowService.describeNamespace({namespace:target});},(e:unknown)=>{
        const error=e as {code?:number;cause?:{code?:number}};
        return [7,16].includes(error.code ?? error.cause?.code ?? -1);
      });}finally{await c?.close();}
    };
    await denied(workloadKey,otherNamespace);await denied(jwt([`${namespace}:read`],-1),namespace);await denied("invalid-jwt",namespace);
    const tampered=workloadKey.split(".");const signature=Buffer.from(tampered[2],"base64url");signature[0]^=1;tampered[2]=signature.toString("base64url");await denied(tampered.join("."),namespace);
    const reader=await Connection.connect({address,tls,apiKey:jwt([`${namespace}:read`])});
    try {await assert.rejects(reader.workflowService.startWorkflowExecution({namespace,workflowId:"forbidden-reader-start",workflowType:{name:"pinnedAcknowledgement"},taskQueue:{name:"never-polled"},requestId:randomUUID()}),(e:unknown)=>(e as {code:number}).code===7);}finally{await reader.close();}
    checks.push("A namespace reader cannot start workflows; a tampered signed JWT is rejected before execution");
    checks.push("Temporal's default authorizer rejects another namespace, expired JWT and invalid JWT on real namespace RPCs");
    for(const options of [{serverRootCACertificate:tls.serverRootCACertificate},{...tls,serverNameOverride:"wrong.example"},{...tls,clientCertPair:{crt:await readFile(resolve(tlsDir,"untrusted.pem")),key:await readFile(resolve(tlsDir,"untrusted.key"))}}]) {
      await assert.rejects(async()=>{const c=await Connection.connect({address,tls:options,connectTimeout:"1 second"});try{await c.workflowService.describeNamespace({namespace});}finally{await c.close();}});
    }
    checks.push("Real TLS handshake rejects missing/untrusted client certificates and incorrect server hostname without bypassing verification");
    const oldKey=workloadKey;
    signing=generateKeyPairSync("rsa",{modulusLength:2048});kid="proof-2";workloadKey=scoped();
    for(let i=0;;i++) {try {const c=await Connection.connect({address,tls,apiKey:workloadKey});try{await c.workflowService.describeNamespace({namespace});}finally{await c.close();}break;}catch{if(i>30)throw Error("Signing key rotation not observed");await new Promise(r=>setTimeout(r,500));}}
    await denied(oldKey,namespace);
    checks.push("Signing-key rotation permits the replacement credential and rejects the removed key on actual Temporal RPCs");
    await connection.close();connection=await Connection.connect({address,tls,apiKey:workloadKey});
    const client=new Client({connection,namespace});
    return {client,address,tlsDir,network,namespace,workloadKey,checks,docker,teardown,
      registerContainer:(name:string)=>ownedContainers.push(name),
      backupPersistence:async()=>{
        await docker("stop","--time","30",server);
        for(const db of ["temporal","temporal_visibility"]) await docker("exec",postgres,"pg_dump","-U","temporal","-Fc","-f",`/tmp/${db}.dump`,db);
        await docker("start",server);
      },
      restorePersistence:async()=>{
        await docker("stop","--time","30",server);
        for(const db of ["temporal","temporal_visibility"]) await docker("exec",postgres,"pg_restore","-U","temporal","--clean","--if-exists","--exit-on-error","-d",db,`/tmp/${db}.dump`);
        await docker("start",server);
      },
      restartServer:async()=>{await docker("kill","--signal","KILL",server);await docker("start",server);},
      restartPostgres:async()=>{await docker("kill","--signal","KILL",postgres);await docker("start",postgres);},
      imageIds:await Promise.all(["temporalio/server:1.31.0","temporalio/admin-tools:1.31.0","postgres:16"].map(async image=>({image,id:await docker("image","inspect",image,"--format","{{.Id}}")}))) };
  }catch(e){await docker("logs",server).then(s=>writeFile(resolve(".local/temporal-secure-server-failure.log"),s,{mode:0o600})).catch(()=>{});await teardown();throw e;}
}
