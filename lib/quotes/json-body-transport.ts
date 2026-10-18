/** Narrow body-or-refusal seam used by the retained mail/provisioner adapters.
 * Status and observed business effects are still interpreted by those adapters. */
import {BoundedHttpsJsonClient,type BoundedRequest} from './https-transport';
import {ControlError} from '../durable/contracts';
export interface JsonBodyRequestTransport{request(path:string,init?:Readonly<{method?:string;headers?:Readonly<Record<string,string>>;body?:string}>):Promise<unknown>}
export class HttpsJsonBodyTransport implements JsonBodyRequestTransport{
 constructor(private readonly client:BoundedHttpsJsonClient){}
 async request(path:string,init:Readonly<{method?:string;headers?:Readonly<Record<string,string>>;body?:string}>={}):Promise<unknown>{
  try{
   if(!init||Object.getPrototypeOf(init)!==Object.prototype||Reflect.ownKeys(init).some(k=>typeof k!=='string'||!['method','headers','body'].includes(k))||Object.values(Object.getOwnPropertyDescriptors(init)).some(d=>!Object.hasOwn(d,'value')||!d.enumerable))throw Error('shape');
   const method=init.method??'GET';if(!['GET','POST','PATCH'].includes(method))throw Error('method');const headers:Record<string,string>={};
   if(init.headers!==undefined){if(!init.headers||Object.getPrototypeOf(init.headers)!==Object.prototype||Reflect.ownKeys(init.headers).length!==Object.keys(init.headers).length)throw Error('headers');for(const [key,d]of Object.entries(Object.getOwnPropertyDescriptors(init.headers))){if(!Object.hasOwn(d,'value')||!d.enumerable||typeof d.value!=='string'||Object.hasOwn(headers,key.toLowerCase()))throw Error('headers');headers[key.toLowerCase()]=d.value;}}
   const response=await this.client.request(path,{method:method as BoundedRequest['method'],...(init.headers===undefined?{}:{headers}),...(init.body===undefined?{}:{body:init.body})});
   if(response.status<200||response.status>=300)throw Error('status');return response.body;
  }catch{throw new ControlError(503,'Exact TLS provider response unavailable. No safe retry inferred.');}
 }
}
