// Retrieval verification only. Never starts a service, forces removal or prunes.
import assert from "node:assert/strict";
import {runtimeImageLock,retrieveRuntimeImages} from "./staging-runtime-images.mjs";
export function verifyRuntimeRetrieval(value,docker){
 const lock=runtimeImageLock(value);
 const inventory=()=>{
  const ids=docker("image","ls","--no-trunc","--quiet").split("\n").filter(Boolean);
  assert(ids.every(id=>/^sha256:[a-f0-9]{64}$/.test(id)),"Unverified image inventory");
  return new Set(ids);
 };
 const before=inventory();let dependencyImages,failure,failed=false;const cleanupErrors=[];
 try{dependencyImages=retrieveRuntimeImages(lock,docker);}catch(error){failure=error;failed=true;}
 try{
  const present=inventory();
  for(const image of lock.images){
   if(!before.has(image.imageId)&&present.has(image.imageId)){
    try{docker("image","rm",image.reference);}catch(error){cleanupErrors.push(error);}
   }
  }
  const after=inventory();
  assert(lock.images.every(image=>before.has(image.imageId)||!after.has(image.imageId)),"New validation images remain");
 }catch(error){cleanupErrors.push(error);}
 if(failed||cleanupErrors.length)throw new AggregateError([...(failed?[failure]:[]),...cleanupErrors],"Dependency retrieval refused or cleanup incomplete");
 return {dependencyImages,dependencyNewImagesRemoved:true};
}
