import { GET as get0 } from '../app/api/durable/route';
import { GET as get1 } from '../app/api/durable/refunds/route';
import { GET as get2 } from '../app/api/durable/connectors/route';
import { GET as get3 } from '../app/api/durable/workflows/route';
import { GET as get4 } from '../app/api/workspace/records/route';
import { GET as get5 } from '../app/api/workspace/discovery/route';
import { GET as get6 } from '../app/api/workspace/discovery/owners/route';
import { GET as get7 } from '../app/api/workspace/enquiries/execution/route';
// Private loopback process proof only. No model/provider/Temporal service called.
import { createServer } from 'node:http';
import { Pool } from 'pg';
import { NextRequest } from 'next/server';
import { registerTenantPool,assertTenantPool } from '../lib/durable/tenant-pool';
import { TenantContext,configureTenantContext } from '../lib/workspace/tenant-context';
import { POST,GET,DELETE } from '../app/api/workspace/session/route';
import { GET as agents } from '../app/api/workspace/agents/route';
import { POST as enquiry } from '../app/api/workspace/enquiries/route';
import { authorize } from '../lib/durable/service';
import { transaction } from '../lib/durable/database';
async function main(){let data='';for await(const chunk of process.stdin){data+=chunk;if(data.length>32768)throw Error('Bounded private configuration required');}const cfg=JSON.parse(data);const owned:Pool[]=[];
 const make=(url:string)=>{const pool=new Pool({connectionString:url,max:1,options:`-c search_path=${cfg.schema}`});owned.push(pool);return pool;};
 const a=make(cfg.a),b=make(cfg.b),worker=make(cfg.worker),workerB=make(cfg.workerB),broker=make(cfg.broker);
 for(const [pool,org,role,purpose]of [[a,'a',cfg.roles.a,'web'],[b,'b',cfg.roles.b,'web'],[worker,'a',cfg.roles.worker,'worker'],[workerB,'b',cfg.roles.workerB,'worker']]as const)await registerTenantPool(pool,{org,role,purpose,epoch:cfg.epochs[org],schema:cfg.schema});
 configureTenantContext(await TenantContext.create(broker,new Map([['a',a],['b',b]]),cfg.schema,cfg.brokerRole));
 const server=createServer(async(req,res)=>{try{
  const path=new URL(req.url||'/', 'http://127.0.0.1').pathname;
  if(path==='/_proof/worker-scope'||path==='/_proof/worker-b-scope') {const org=path==='/_proof/worker-scope'?'a':'b',db=org==='a'?worker:workerB;await assertTenantPool(db,org);const rows=await transaction(db,org,async c=>{await authorize(c,{orgId:org,subject:'enquiry-temporal',role:'worker',tokenHash:`worker-${org}`},['worker'],'enquiries');return(await c.query('SELECT org_id FROM ll_temporal_record_routes')).rows;});res.setHeader('content-type','application/json');res.end(JSON.stringify(rows));return;}
  let content='';for await(const chunk of req){content+=chunk;if(content.length>8192)throw Error('Bounded request required');}
  const headers=new Headers();for(const [key,value]of Object.entries(req.headers)){if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);}
  const request=new NextRequest(`http://127.0.0.1${req.url}`,{method:req.method,headers,...(content?{body:content}:{})});
  const handler=path==='/api/durable'?get0:path==='/api/durable/refunds'?get1:path==='/api/durable/connectors'?get2:path==='/api/durable/workflows'?get3:path==='/api/workspace/records'?get4:path==='/api/workspace/discovery'?get5:path==='/api/workspace/discovery/owners'?get6:path==='/api/workspace/enquiries/execution'?get7:path==='/api/workspace/session'?(req.method==='POST'?POST:req.method==='DELETE'?DELETE:GET):path==='/api/workspace/agents'?agents:path==='/api/workspace/enquiries'?enquiry:undefined;
  if(!handler){res.statusCode=404;res.end();return;}const response=await handler(request);res.statusCode=response.status;for(const [key,value]of response.headers)res.setHeader(key,value);res.end(await response.text());
 }catch{res.statusCode=503;res.end('Private route proof refused');}});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('Loopback address required');process.stdout.write(JSON.stringify({port:address.port})+'\n');
 process.once('SIGTERM',()=>server.close(()=>{Promise.all(owned.map(pool=>pool.end())).then(()=>process.exit(0)).catch(()=>process.exit(1));}));
}
main().catch(()=>{process.stderr.write('Private route proof startup refused\n');process.exit(1);});
