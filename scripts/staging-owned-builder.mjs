// Disposable image builder only. Never selects, prunes or restarts a shared builder.
import assert from "node:assert/strict";
export const builderMemoryBytes=3*1024**3;
export function ownedBuilder(docker,name){
 assert(/^ll-platform-[a-f0-9]{12}-build$/.test(name),"Dedicated random trial builder required");
 const container=`buildx_buildkit_${name}0`;let created=false;
 return {
  start(){
   assert(!created,"Builder already created");
   docker("buildx","create","--name",name,"--driver","docker-container","--driver-opt","memory=3g,memory-swap=3g");created=true;
   docker("buildx","inspect","--bootstrap",name);
   const state=JSON.parse(docker("inspect","--format","{{json .HostConfig}}",container));
   assert.equal(state.Memory,builderMemoryBytes);assert.equal(state.MemorySwap,builderMemoryBytes);
  },
  build(...args){assert(created,"Owned builder must be created before building");return docker("buildx","build","--builder",name,"--load",...args);},
  close(){
   if(!created)return;
   docker("buildx","rm",name);
   assert.equal(docker("ps","-aq","--filter",`name=^/${container}$`),"","Owned builder must be removed before runtime admission");created=false;
  }
 };
}
