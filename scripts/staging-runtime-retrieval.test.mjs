import {test,expect} from "vitest";
import {readFileSync} from "node:fs";
import {verifyRuntimeRetrieval} from "./staging-runtime-retrieval.mjs";
const lock=JSON.parse(readFileSync("config/staging-runtime-images.json","utf8"));
const foreign="sha256:"+"f".repeat(64);
function fixture({initial=[foreign],pullFailure,removeFailure,inventoryFailure,inspectChange={}}={}){
 const ids=new Set(initial),calls=[];let inventories=0;
 return {ids,calls,docker:(...args)=>{
  calls.push(args);
  if(args[1]==="ls"){if(++inventories===inventoryFailure)throw Error("inventory unavailable");return [...ids].join("\n");}
  const image=lock.images.find(i=>i.reference===args.at(-1)||i.reference===args[2]);
  if(args[1]==="pull"){if(image.role===pullFailure)throw Error("pull refused");ids.add(image.imageId);return "";}
  if(args[1]==="inspect")return JSON.stringify({id:image.imageId,os:"linux",architecture:"amd64",...inspectChange});
  if(args[1]==="rm"){if(image.role===removeFailure)throw Error("remove refused");ids.delete(image.imageId);return "";}
  throw Error("unexpected Docker operation");
 }};
}
test("retrieves verified dependencies and removes only newly added reviewed content",()=>{
 const f=fixture({initial:[foreign,lock.images[0].imageId]});expect(verifyRuntimeRetrieval(lock,f.docker)).toEqual({dependencyImages:lock,dependencyNewImagesRemoved:true});
 expect([...f.ids]).toEqual([foreign,lock.images[0].imageId]);
 expect(f.calls.filter(a=>a[1]==="rm")).toEqual(lock.images.slice(1).map(i=>["image","rm",i.reference]));
 expect(f.calls.flat()).not.toContain("--force");expect(f.calls.flat()).not.toContain("prune");expect(f.calls.flat()).not.toContain("run");
});
test("partial pull failure still cleans acquired content and preserves the failure",()=>{
 const f=fixture({pullFailure:"temporal"});let error;try{verifyRuntimeRetrieval(lock,f.docker);}catch(e){error=e;}
 expect(error).toBeInstanceOf(AggregateError);expect(error.errors.map(e=>e.message)).toContain("pull refused");expect([...f.ids]).toEqual([foreign]);
 expect(f.calls.filter(a=>a[1]==="rm")).toEqual([["image","rm",lock.images[0].reference]]);
});
test("one removal failure attempts remaining owned removals but never reports success",()=>{
 const f=fixture({removeFailure:"postgres"});let error;try{verifyRuntimeRetrieval(lock,f.docker);}catch(e){error=e;}
 expect(error).toBeInstanceOf(AggregateError);expect(error.errors.map(e=>e.message)).toEqual(expect.arrayContaining(["remove refused","New validation images remain"]));
 expect(f.calls.filter(a=>a[1]==="rm")).toHaveLength(3);expect([...f.ids]).toEqual([foreign,lock.images[0].imageId]);
});
test("malformed lock or unverified inventory refuses without speculative deletion",()=>{
 const calls=[];expect(()=>verifyRuntimeRetrieval({...lock,platform:"linux/arm64"},(...a)=>calls.push(a))).toThrow();expect(calls).toEqual([]);
 const malformed=[];expect(()=>verifyRuntimeRetrieval(lock,(...a)=>{malformed.push(a);return "unverified";})).toThrow("Unverified image inventory");expect(malformed).toHaveLength(1);
 for(const when of [1,2,3]){const f=fixture({inventoryFailure:when});expect(()=>verifyRuntimeRetrieval(lock,f.docker)).toThrow();expect(f.calls.filter(a=>a[1]==="rm")).toHaveLength(when===3?3:0);}
});

test("identity refusal cleans acquired reviewed content; even a falsy thrown error cannot become success",()=>{
 const f=fixture({inspectChange:{id:foreign}});expect(()=>verifyRuntimeRetrieval(lock,f.docker)).toThrow(AggregateError);expect([...f.ids]).toEqual([foreign]);
 const calls=[];let error;try{verifyRuntimeRetrieval(lock,(...a)=>{calls.push(a);if(a[1]==="pull")throw undefined;return "";});}catch(e){error=e;}
 expect(error).toBeInstanceOf(AggregateError);expect(error.errors).toEqual([undefined]);expect(calls.filter(a=>a[1]==="pull")).toHaveLength(1);expect(calls.filter(a=>a[1]==="rm")).toEqual([]);
});
