import type { Pool } from 'pg';
import { ControlError } from '../durable/contracts';
import { QuoteDemoControl } from './demo-control';
/** Only the module which positively admitted a trusted control can classify
 * its domain errors. Request objects and unknown failures are never promoted. */
type Registration=Readonly<{control:QuoteDemoControl;knownError:(error:unknown)=>Readonly<{status:number;message:string}>|null}>;
const key=Symbol.for('looplabs.private.quote-demo-registry-2');
const server=globalThis as typeof globalThis & {[key]?:Readonly<{controls:WeakMap<Pool,Map<string,Registration>>}>};
function registry(){
 const descriptor=Object.getOwnPropertyDescriptor(server,key);
 if(!descriptor){const value=Object.freeze({controls:new WeakMap<Pool,Map<string,Registration>>()});Object.defineProperty(server,key,{value,writable:false,configurable:false});return value.controls;}
 if(descriptor.writable||descriptor.configurable||!Object.isFrozen(descriptor.value)||!(descriptor.value.controls instanceof WeakMap))throw new ControlError(503,'Trusted quote configuration unavailable.');
 return descriptor.value.controls as WeakMap<Pool,Map<string,Registration>>;
}
export function configureQuoteDemo(control:QuoteDemoControl){
 if(typeof window!=='undefined'||!(control instanceof QuoteDemoControl))throw new ControlError(503,'Trusted quote configuration required.');
 const controls=registry(),scopes=controls.get(control.db)??new Map<string,Registration>();
 if(scopes.has(control.scopeId))throw new ControlError(503,'Quote configuration is immutable.');
 const entry=Object.freeze({control,knownError:(error:unknown)=>error instanceof ControlError?{status:error.status,message:error.message}:null});
 scopes.set(control.scopeId,entry);controls.set(control.db,scopes);
}
const local=new WeakMap<Registration,QuoteDemoControl>();
const methods=new Set(['catalog','savedRequests','prepare','submit','review','advance','verification','verify','resolve','background']);
/** Bundle-local boundary over the already admitted instance, including its
 * existing store/controllers. It does not construct authority or providers. */
function installedFacade(entry:Registration){
 const prior=local.get(entry);if(prior)return prior;
 const facade=new Proxy(entry.control,{get(control,property){
  if(property==='db'||property==='scopeId')return Reflect.get(control,property);
  if(typeof property!=='string'||!methods.has(property))throw new ControlError(503,'Only installed quote operations are available.');
  const method=Reflect.get(control,property);if(typeof method!=='function')throw new ControlError(503,'Installed quote operation is unavailable.');
  return async(...args:unknown[])=>{try{return await Reflect.apply(method,control,args);}catch(error){const known=entry.knownError(error);if(known)throw new ControlError(known.status,known.message);throw error;}};
 }});
 local.set(entry,facade);return facade;
}
export function quoteDemo(db:Pool,scope:string){const entry=registry().get(db)?.get(scope);if(!entry)throw new ControlError(503,'This enrolled quote conversation is not configured. No work was created or sent.');return installedFacade(entry);}
export function configuredQuoteDemos(db:Pool){return [...(registry().get(db)?.values()??[])].map(installedFacade);}
