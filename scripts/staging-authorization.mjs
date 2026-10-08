import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {createPublicKey} from "node:crypto";

// Public verification material only. The private signer must remain offline.
export function publicJwks(raw) {
  const value=JSON.parse(raw);
  if(!value || Object.keys(value).join()!=="keys" || !Array.isArray(value.keys) || !value.keys.length || value.keys.length>4) throw Error("Invalid verification keys");
  const ids=new Set();
  for(const key of value.keys) {
    if(!key || Object.keys(key).some(k=>!["kty","n","e","kid","alg","use"].includes(k)) || key.kty!=="RSA" || key.alg!=="RS256" || key.use!=="sig" || typeof key.kid!=="string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(key.kid) || ids.has(key.kid)) throw Error("Invalid public verification key");
    const parsed=createPublicKey({key,format:"jwk"});
    if((parsed.asymmetricKeyDetails?.modulusLength||0)<2048) throw Error("Verification key too weak");
    ids.add(key.kid);
  }
  return JSON.stringify(value);
}
export function authorizationServer(load=()=>readFile("/run/staging/jwks.json","utf8")) {
  return createServer(async(req,res)=>{
    if(req.method!=="GET" || req.url!=="/jwks") {res.writeHead(404);res.end();return;}
    try {
      const body=publicJwks(await load());
      res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(body);
    }catch {res.writeHead(503);res.end("Verification keys unavailable");}
  });
}
if(process.argv[1]===new URL(import.meta.url).pathname) {
  authorizationServer().listen(8080,"0.0.0.0");
}
