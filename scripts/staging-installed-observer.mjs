import {installedObserverInputPaths,assertRetainedObserverPublication} from './staging-installed-observer-inputs.mjs';
import {createHash} from 'node:crypto';
// Offline evidence only. It cannot approve, dispatch, retry or alter authority.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Pool} from 'pg';
import {scopedPoolOptions} from '../lib/durable/pg-transport.ts';
import {readOwnedPrivateFile} from '../lib/workspace/owned-private-file.ts';
import {readJournalWithFailureMetadata} from './staging-private-journal-metadata.mjs';
const root=process.env.LOOPLABS_INSTALLED_ASSEMBLY_DIRECTORY;
assert(root&&root.startsWith('/')&&process.env.LOOPLABS_STAGING_PLATFORM_PROOF==='isolated');
const paths=installedObserverInputPaths(root,process.env.LOOPLABS_RETAINED_INSTALLATION);
const inputFile=await readOwnedPrivateFile(paths.input,65536),input=JSON.parse(inputFile.bytes.toString('utf8'));
const readyFile=await readOwnedPrivateFile(paths.ready,131072),ready=JSON.parse(readyFile.bytes.toString('utf8'));
if(paths.retained)assertRetainedObserverPublication(input,ready,process.env.LOOPLABS_EXPECTED_SOURCE_FREEZE_SHA256);
const u=new URL(input.database.url);assert(u.hostname==='trial-db'&&u.port==='5432'&&u.pathname==='/trial'&&u.username==='trial');
assert(/^gateway_[a-f0-9]{16}$/.test(ready.schema)&&/^native_quote_[a-f0-9]{16}$/.test(ready.quoteProvider.providerSchema));
const pools=[];
try{
 const quote=new Pool(await scopedPoolOptions({url:input.database.url,schema:ready.quoteProvider.providerSchema,purpose:'installer',transport:input.database.transport})),workspace=new Pool(await scopedPoolOptions({url:input.database.url,schema:ready.schema,purpose:'installer',transport:input.database.transport}));pools.push(quote,workspace);
 const oid=(await quote.query('SELECT oid::text oid FROM pg_namespace WHERE nspname=$1',[ready.quoteProvider.providerSchema])).rows[0]?.oid;assert.equal(oid,ready.quoteProvider.providerSchemaOid);
 const readOnly=async(pool,read)=>{const c=await pool.connect();try{await c.query('BEGIN READ ONLY');const r=await read(c);await c.query('COMMIT');return r;}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}};
 const observation=await readOnly(quote,async c=>{
  const q=(await c.query("SELECT version::text version,result FROM native_quotes WHERE workspace_id='local-proof' AND quote_id='quote-42'")).rows;assert.equal(q.length,1);
  const effects=(await c.query("SELECT action_id,request_identity,effect FROM native_quote_effects WHERE workspace_id='local-proof' AND quote_id='quote-42' ORDER BY action_id")).rows,pendingMail=(await c.query("SELECT * FROM native_pending_mail WHERE workspace_id='local-proof' AND quote_id='quote-42' ORDER BY action_id")).rows;assert(effects.length<=8&&pendingMail.length<=8);
  return {workspaceId:'local-proof',quoteId:'quote-42',quote:{version:Number(q[0].version),result:q[0].result},quoteEffects:effects,pendingMail};
 });
 const raw=await readJournalWithFailureMetadata(join(ready.quoteProvider.emailProcess.state,'connector-twin-state.json'),file=>readOwnedPrivateFile(file,1048576),metadata=>writeFile(join(root,'observer-private-journal-diagnostic.json'),JSON.stringify(metadata),{mode:0o600,flag:'wx'})),mail=JSON.parse(raw.bytes.toString('utf8'));assert(mail&&typeof mail.effects==='object'&&!Array.isArray(mail.effects));await raw.assertStable();
 const workspaceEvidence=await readOnly(workspace,async c=>({quotePlans:(await c.query("SELECT * FROM ll_quote_plans WHERE org_id='local-proof' ORDER BY id")).rows,quoteActions:(await c.query("SELECT * FROM ll_connector_actions WHERE org_id='local-proof' ORDER BY id")).rows,workflowRuns:(await c.query("SELECT * FROM ll_workflow_runs WHERE org_id='local-proof' ORDER BY id")).rows,recovery:(await c.query("SELECT epoch FROM ll_workspace_recovery WHERE org_id='local-proof'")).rows,backgroundRoutes:(await c.query("SELECT * FROM ll_quote_background_routes WHERE org_id='local-proof' ORDER BY plan_id")).rows,connectorEvents:(await c.query("SELECT action_id,kind,subject,at FROM ll_connector_events WHERE org_id='local-proof' ORDER BY id")).rows}));
 await inputFile.assertStable();await readyFile.assertStable();await writeFile(join(root,'quote-provider-observation.json'),JSON.stringify({...observation,mailEffects:mail.effects,mailJournalSha256:createHash('sha256').update(raw.bytes).digest('hex'),workspaceEvidence,connectorEvents:workspaceEvidence.connectorEvents,backgroundRoutes:workspaceEvidence.backgroundRoutes}),{mode:0o600});
}finally{for(const pool of pools)await pool.end();}
