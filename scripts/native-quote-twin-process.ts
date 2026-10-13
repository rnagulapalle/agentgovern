/** Private disposable test harness only; configuration travels over owned IPC,
 * never command-line arguments, provider responses or logs. */
import { FetchSandboxConnectors } from '../lib/connectors/twin';
import type { NativeMailPin } from '../lib/quotes/native-email-transport';
import { Pool } from 'pg';
import { startNativeQuoteTwin, type NativeQuoteBinding } from './native-quote-twin';
if(process.env.NODE_ENV!=='test'||!process.send)throw Error('Owned test IPC required');
let terminationDelayMs=0;
let pool:Pool|undefined,listener:Awaited<ReturnType<typeof startNativeQuoteTwin>>|undefined;
process.once('message',async(value:unknown)=>{try{
 const config=value as {url:string;schema:string;binding:NativeQuoteBinding;terminationDelayMs?:number;mail?:{pins:NativeMailPin[];origin:string;token:string;timeoutMs:number}};const url=new URL(config.url);
 if(url.hostname!=='127.0.0.1'&&url.hostname!=='localhost')throw Error('Disposable local provider only');
 if(!/^native_quote_[a-f0-9]{16}$/.test(config.schema))throw Error('Owned provider schema required');
 if(config.terminationDelayMs!==undefined&&(!Number.isSafeInteger(config.terminationDelayMs)||config.terminationDelayMs<0||config.terminationDelayMs>1000))throw Error('Bounded offline shutdown fault required');terminationDelayMs=config.terminationDelayMs??0;
 pool=new Pool({connectionString:url.toString(),options:'-c search_path='+config.schema,max:4});if(config.mail){const mailURL=new URL(config.mail.origin);if(mailURL.protocol!=='http:'||mailURL.hostname!=='127.0.0.1'||mailURL.port!=='8018'||mailURL.pathname!=='/'||mailURL.username||mailURL.password||mailURL.search||mailURL.hash||config.mail.timeoutMs!==250)throw Error('Owned isolated mail endpoint required');}
 listener=await startNativeQuoteTwin(pool,config.binding,config.mail?{mail:{pins:config.mail.pins,transport:new FetchSandboxConnectors(config.mail.origin,config.mail.token,config.mail.timeoutMs)}}:{});
 process.send?.({origin:listener.origin});
 }catch{process.send?.({error:'Owned provider startup refused'});await pool?.end();process.exitCode=1;process.disconnect();}});
process.once('SIGTERM',async()=>{if(terminationDelayMs)await new Promise(resolve=>setTimeout(resolve,terminationDelayMs));await listener?.close();await pool?.end();process.disconnect();});
