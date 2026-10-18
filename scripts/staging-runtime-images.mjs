// Reviewed platform-specific dependencies. Never falls back to mutable tags.
import assert from "node:assert/strict";
const specs=[["postgres","postgres:16","postgres"],["temporal","temporalio/server:1.31.0","temporalio/server"],["schema","temporalio/admin-tools:1.31.0","temporalio/admin-tools"]];
export function runtimeImageLock(value){
 assert.deepEqual(Object.keys(value).sort(),["images","platform","version"]);
 assert.equal(value.version,1);assert.equal(value.platform,"linux/amd64");assert(Array.isArray(value.images));assert.equal(value.images.length,3);
 for(let i=0;i<specs.length;i++){
  const image=value.images[i],[role,tag,repo]=specs[i];assert.deepEqual(Object.keys(image).sort(),["imageId","reference","role","selectionTag"]);
  assert.equal(image.role,role);assert.equal(image.selectionTag,tag);assert(typeof image.reference==="string"&&image.reference.startsWith(repo+"@sha256:")&&/^[a-f0-9]{64}$/.test(image.reference.slice((repo+"@sha256:").length)));
  assert(typeof image.imageId==="string"&&/^sha256:[a-f0-9]{64}$/.test(image.imageId));
 }
 assert.equal(new Set(value.images.map(x=>x.imageId)).size,3);
 return value;
}
export function dependencyEnvironment(value){
 const lock=runtimeImageLock(value);return {LOOPLABS_STAGING_POSTGRES_IMAGE:lock.images[0].reference,LOOPLABS_STAGING_TEMPORAL_IMAGE:lock.images[1].reference};
}
export function verifyRuntimeImage(value,image,docker){
 const lock=runtimeImageLock(value);assert(lock.images.includes(image));
 const info=JSON.parse(docker("image","inspect",image.reference,"--format",'{"id":{{json .Id}},"os":{{json .Os}},"architecture":{{json .Architecture}}}'));
 assert.deepEqual(Object.keys(info).sort(),["architecture","id","os"]);assert.equal(info.id,image.imageId,"Runtime dependency identity mismatch");assert.equal(info.os,"linux");assert.equal(info.architecture,"amd64","Runtime dependency architecture mismatch");
 return {...image};
}
export function retrieveRuntimeImages(value,docker){
 const lock=runtimeImageLock(value),images=[];
 for(const image of lock.images){docker("image","pull","--platform",lock.platform,image.reference);images.push(verifyRuntimeImage(lock,image,docker));}
 return {version:lock.version,platform:lock.platform,images};
}
export function assertRuntimeBindings(value,bindings){
 const lock=runtimeImageLock(value);
 assert.deepEqual(Object.keys(bindings).sort(),["application-db","temporal","temporal-db"]);
 assert.equal(bindings["application-db"],lock.images[0].imageId);assert.equal(bindings["temporal-db"],lock.images[0].imageId);assert.equal(bindings.temporal,lock.images[1].imageId);
 return {runtimeBindings:3};
}
