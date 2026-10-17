"use client";
import {useEffect,useState} from 'react';
import type {ActivityReference} from '@/lib/workspace/cloud-activity';
import type {ExternalApproval} from '@/lib/workspace/external-approvals';
import {workspaceJson} from '@/lib/workspace/response';
/** Read-only enrichment scoped to one known deployment and one execution. */
export function ExecutionBusinessContext({reference,runId}:{reference:ActivityReference|null;runId:string}){
 const [request,setRequest]=useState<ExternalApproval|null>(null);
 const [state,setState]=useState('Checking matched approval evidence…');
 const connectionId=reference?.connectionId,resourceArn=reference?.resourceArn,version=reference?.version;
 useEffect(()=>{let active=true;const abort=new AbortController();setRequest(null);setState(connectionId&&resourceArn&&version?'Checking matched approval evidence…':'A single saved deployment version could not be matched.');
  if(connectionId&&resourceArn&&version)void fetch('/api/workspace/discovery/approvals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'list',connectionId,resourceArn,version}),cache:'no-store',signal:abort.signal}).then(async r=>{const data=await workspaceJson(r);if(!r.ok)throw Error();const rows=Array.isArray(data.requests)?data.requests.filter((a:ExternalApproval)=>a.runId===runId):[];if(active){if(data.connected===true&&rows.length===1&&typeof rows[0].before==='string'&&typeof rows[0].after==='string'){setRequest(rows[0]);setState('');}else setState('No unique approval readback matched this execution.');}}).catch(()=>{if(active)setState('Approval readback could not be checked.');});
  return()=>{active=false;abort.abort();};
 },[connectionId,resourceArn,version,runId]);
 return <section className="aws-business-impact"><h4>Business impact</h4>{request?<><dl className="aws-business-summary"><div><dt>Before</dt><dd>{request.before}</dd></div><div><dt>Requested change</dt><dd>{request.after}</dd></div><div><dt>Workflow decision</dt><dd>{request.status}</dd></div><div><dt>Workflow execution</dt><dd>{request.executionStatus}</dd></div></dl><p className="aws-field-help">Matched approval readback · deployment version {version}. These values describe the reviewed change; provider effects are not independently verified.</p></>:<><p>Not shared by workflow</p><p className="aws-field-help">{state}</p></>}</section>;
}
