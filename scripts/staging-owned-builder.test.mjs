import {test,expect} from "vitest";
import {ownedBuilder,builderMemoryBytes} from "./staging-owned-builder.mjs";
const name="ll-platform-123456789abc-build";
function fixture(overrides={}){
 const calls=[];
 const docker=(...args)=>{calls.push(args);if(args[0]==="inspect")return JSON.stringify({Memory:builderMemoryBytes,MemorySwap:builderMemoryBytes,...overrides});return "";};
 return {calls,builder:ownedBuilder(docker,name)};
}
test("dedicated bounded builder is explicit, exports images and removes only its own resources",()=>{
 const {calls,builder}=fixture();expect(()=>builder.build(".")).toThrow();builder.start();expect(()=>builder.start()).toThrow();builder.build("-t","trial:web",".");builder.close();builder.close();
 expect(calls).toEqual([
  ["buildx","create","--name",name,"--driver","docker-container","--driver-opt","memory=3g,memory-swap=3g"],
  ["buildx","inspect","--bootstrap",name],
  ["inspect","--format","{{json .HostConfig}}",`buildx_buildkit_${name}0`],
  ["buildx","build","--builder",name,"--load","-t","trial:web","."],
  ["buildx","rm",name],
  ["ps","-aq","--filter",`name=^/buildx_buildkit_${name}0$`]
 ]);
 expect(()=>builder.build(".")).toThrow();
});
test("invalid/shared names and unenforced memory refuse; failed initialization still cleans its owned builder",()=>{
 for(const invalid of ["default","shared","ll-platform-123456789abc","ll-platform-123456789abc-build --use"]){expect(()=>ownedBuilder(()=>{throw Error("must not call Docker");},invalid)).toThrow();}
 for(const limits of [{Memory:0},{MemorySwap:0}]){const {builder,calls}=fixture(limits);expect(()=>builder.start()).toThrow();builder.close();expect(calls.some(a=>a[0]==="buildx"&&a[1]==="rm"&&a[2]===name)).toBe(true);}
});
test("failed removal or a retained builder refuses runtime admission without changing shared state",()=>{
 for(const failure of ["remove","retained"]){const calls=[];const builder=ownedBuilder((...args)=>{calls.push(args);if(args[0]==="inspect")return JSON.stringify({Memory:builderMemoryBytes,MemorySwap:builderMemoryBytes});if(args[0]==="buildx"&&args[1]==="rm"&&failure==="remove")throw Error("removal failed");return args[0]==="ps"?"still-present":"";},name);builder.start();expect(()=>builder.close()).toThrow();expect(calls.every(a=>!a.includes("prune")&&!a.includes("--use"))).toBe(true);}
});
