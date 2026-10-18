import {test,expect} from "vitest";
import {readFileSync} from "node:fs";
import {runtimeImageLock,dependencyEnvironment,retrieveRuntimeImages,assertRuntimeBindings} from "./staging-runtime-images.mjs";
const lock=JSON.parse(readFileSync("config/staging-runtime-images.json","utf8"));
function fixture(change={}){const calls=[];return {calls,docker:(...args)=>{calls.push(args);const image=lock.images.find(x=>x.reference===args[2]);return args[1]==="inspect"?JSON.stringify({id:image.imageId,os:"linux",architecture:"amd64",...change}):"";}};}
test("retrieves only reviewed platform digests and binds both databases and actual service identity",()=>{
 expect(runtimeImageLock(lock)).toBe(lock);const {docker,calls}=fixture();expect(retrieveRuntimeImages(lock,docker)).toEqual(lock);
 expect(calls.filter(x=>x[1]==="pull")).toEqual(lock.images.map(x=>["image","pull","--platform","linux/amd64",x.reference]));
 expect(dependencyEnvironment(lock)).toEqual({LOOPLABS_STAGING_POSTGRES_IMAGE:lock.images[0].reference,LOOPLABS_STAGING_TEMPORAL_IMAGE:lock.images[1].reference});
 expect(assertRuntimeBindings(lock,{"application-db":lock.images[0].imageId,"temporal-db":lock.images[0].imageId,temporal:lock.images[1].imageId})).toEqual({runtimeBindings:3});
});
test("missing malformed reordered foreign mutable or ambiguous dependency locks refuse before pulling",()=>{
 const variants=[null,{}, {...lock,version:2},{...lock,platform:"linux/arm64"},{...lock,secret:"private"},{...lock,images:lock.images.slice(1)},{...lock,images:[...lock.images].reverse()}];
 for(const changes of [{reference:"postgres:16"},{reference:"attacker/postgres@sha256:"+"a".repeat(64)},{reference:lock.images[0].reference+"extra"},{selectionTag:"postgres:17"},{imageId:"invalid"},{imageId:[lock.images[0].imageId]},{secret:"private"}])variants.push({...lock,images:[{...lock.images[0],...changes},...lock.images.slice(1)]});
 for(const value of variants){const calls=[];expect(()=>retrieveRuntimeImages(value,(...args)=>{calls.push(args);return "";})).toThrow();expect(calls).toEqual([]);}
});
test("wrong identity or platform and failed retrieval refuse without tag fallback or service starts",()=>{
 for(const change of [{id:"sha256:"+"f".repeat(64)},{os:"windows"},{architecture:"arm64"},{secret:"private"}]){const {docker,calls}=fixture(change);expect(()=>retrieveRuntimeImages(lock,docker)).toThrow();expect(calls).toHaveLength(2);expect(calls.flat()).not.toContain("run");}
 const calls=[];expect(()=>retrieveRuntimeImages(lock,(...args)=>{calls.push(args);throw Error("registry unavailable");})).toThrow("registry unavailable");expect(calls).toHaveLength(1);
 for(const change of [{"application-db":"wrong"},{"temporal-db":"wrong"},{temporal:"wrong"},{extra:"wrong"}])expect(()=>assertRuntimeBindings(lock,{"application-db":lock.images[0].imageId,"temporal-db":lock.images[0].imageId,temporal:lock.images[1].imageId,...change})).toThrow();
});
