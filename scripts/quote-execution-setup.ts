import {Pool} from 'pg';
import {scopedPoolOptions,parseTransport} from '../lib/durable/pg-transport';
import {applyQuoteExecutionMigrations} from '../lib/workspace/quote-execution-migrations';

async function main(){
 const url=process.env.LOOPLABS_MIGRATION_DATABASE_URL,schema=process.env.LOOPLABS_TENANT_DATABASE_SCHEMA;
 if(!url||!schema)throw Error('Explicit migration-owner connection and installed schema required.');
 // Explicit administrator transport supports standard trust or pinned owned CA only.
 const transport=parseTransport(process.env.LOOPLABS_MIGRATION_DATABASE_TRANSPORT?JSON.parse(process.env.LOOPLABS_MIGRATION_DATABASE_TRANSPORT):undefined);
 if(transport.mode!=='verified-tls')throw Error('Verified migration transport required.');
 const owner=new Pool(await scopedPoolOptions({url,schema,purpose:'installer',transport}));
 try{await applyQuoteExecutionMigrations(owner);console.log('Quote migrations25–27 installed. No role granted, build enrolled, action approved or workflow executed.');}
 finally{await owner.end();}
}
main().catch(()=>{console.error('Quote execution installation refused; no change confirmed. Inspect private administrator diagnostics.');process.exitCode=1;});
