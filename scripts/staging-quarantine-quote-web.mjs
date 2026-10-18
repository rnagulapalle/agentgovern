// Quarantined web must not initialize retired quote execution generations.
// Fresh execution remains a separate explicit administrator publication.
import assert from 'node:assert/strict';
import {dirname,resolve} from 'node:path';
export function quarantineQuoteWebAttachment(service){
 assert(service&&typeof service==='object'&&!Array.isArray(service));assert(service.environment&&typeof service.environment==='object'&&!Array.isArray(service.environment));assert(Array.isArray(service.volumes));
 const environment={...service.environment},keys=['LOOPLABS_QUOTE_DEMO_CONFIG','LOOPLABS_QUOTE_BACKGROUND_CONFIG'],present=keys.filter(key=>Object.hasOwn(environment,key));assert(present.length===0||present.length===2,'Retired quote generation pair must be exact');
 const retired=new Set();for(const key of present){const file=environment[key];assert(typeof file==='string'&&resolve(file)===file&&dirname(file)!=='/');const directory=dirname(file),mounts=service.volumes.filter(m=>m.type==='bind'&&m.source===directory&&m.target===directory);assert.equal(mounts.length,1,'Exact retired quote publication directory required');assert.equal(mounts[0].read_only,true);retired.add(directory);delete environment[key];}
 return {...service,environment,volumes:service.volumes.filter(m=>!retired.has(m.source))};
}
