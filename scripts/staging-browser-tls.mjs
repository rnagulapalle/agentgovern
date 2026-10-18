// Disposable loopback test transport only; not a production ingress/gateway.
import {createServer as httpsServer} from "node:https";
import {request as httpRequest} from "node:http";
import {mkdir,readFile,chmod} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {join} from "node:path";
import {createHash} from "node:crypto";
export const browserOrigin="https://looplabs-staging.example.test:3443";
export async function browserCertificates(directory){
 await mkdir(directory,{mode:0o700});
 const openssl=(...args)=>execFileSync("openssl",args,{cwd:directory,stdio:"ignore",timeout:10000});
 openssl("req","-x509","-newkey","rsa:2048","-nodes","-days","1","-keyout","ca.key","-out","ca.pem","-subj","/CN=LoopLabs disposable browser proof CA","-addext","basicConstraints=critical,CA:TRUE","-addext","keyUsage=critical,keyCertSign,cRLSign");
 openssl("req","-newkey","rsa:2048","-nodes","-keyout","server.key","-out","server.csr","-subj","/CN=looplabs-staging.example.test","-addext","subjectAltName=DNS:looplabs-staging.example.test");
 openssl("x509","-req","-in","server.csr","-CA","ca.pem","-CAkey","ca.key","-CAcreateserial","-out","server.pem","-days","1","-copy_extensions","copy");
 openssl("verify","-CAfile","ca.pem","-verify_hostname","looplabs-staging.example.test","server.pem");
 for(const name of ["ca.key","server.key"])await chmod(join(directory,name),0o600);
 return {key:await readFile(join(directory,"server.key")),cert:await readFile(join(directory,"server.pem")),ca:await readFile(join(directory,"ca.pem"))};
}
export function browserTLSBridge(credentials,{port=3443,upstreamPort=3199,observeDecision}={}){
 if(!Number.isInteger(port)||port<0||port>65535||!Number.isInteger(upstreamPort)||upstreamPort<1||upstreamPort>65535)throw Error("Invalid isolated transport ports");
 if(observeDecision!==undefined&&typeof observeDecision!=="function")throw Error("Invalid isolated decision observer");
 const authority=`looplabs-staging.example.test:${port}`;
 const server=httpsServer({...credentials,minVersion:"TLSv1.2"},async(req,res)=>{
  // A fixed destination cannot become an open forward proxy or CONNECT tunnel.
  if(req.headers.host!==authority||!["GET","HEAD","POST","DELETE"].includes(req.method)||!req.url?.startsWith("/")||req.url.startsWith("//")||/[\\\r\n#]/.test(req.url)){res.writeHead(400);res.end();return;}
  const chunks=[];let bytes=0;
  try{for await(const chunk of req){bytes+=chunk.length;if(bytes>65536){res.writeHead(413);res.end();return;}chunks.push(chunk);}}catch{res.destroy();return;}
  const headers={...req.headers};
  for(const h of ["connection","proxy-authorization","proxy-connection","forwarded","x-forwarded-host","x-forwarded-proto","x-forwarded-for","transfer-encoding"])delete headers[h];
  headers.host=authority;headers["content-length"]=String(bytes);
  const upstream=httpRequest({hostname:"127.0.0.1",port:upstreamPort,path:req.url,method:req.method,headers,timeout:30000},response=>{
   if(observeDecision&&req.method==="POST"&&req.url==="/api/durable/connectors"){
    const parts=[];let size=0;
    response.on("data",chunk=>{size+=chunk.length;if(size<=65536)parts.push(chunk);});
    response.on("end",()=>{
     let sameOriginDenied=false;
     try{sameOriginDenied=size<=65536&&JSON.parse(Buffer.concat(parts).toString()).error==="Same-origin requests are required for browser operations.";}catch{}
     const cookie=(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("looplabs_workspace_session="))?.slice("looplabs_workspace_session=".length)||"";
     // Passive bounded evidence only: never exports raw cookies, Origin, body or headers.
     observeDecision({status:response.statusCode??502,hostileOrigin:req.headers.origin===`https://looplabs-staging.example.test:${port+1}`,sessionDigest:createHash("sha256").update(cookie).digest("hex"),sameOriginDenied});
    });
   }
   res.writeHead(response.statusCode??502,response.headers);response.pipe(res);
  });
  upstream.on("timeout",()=>upstream.destroy());upstream.on("error",()=>{if(!res.headersSent)res.writeHead(502);res.end();});
  res.on("close",()=>upstream.destroy());upstream.end(Buffer.concat(chunks));
 });
 server.on("upgrade",(_req,socket)=>socket.destroy());server.on("connect",(_req,socket)=>socket.destroy());
 server.requestTimeout=30000;server.headersTimeout=15000;
 return server;
}
