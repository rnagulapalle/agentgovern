import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {AwsExecutionBrowser} from './aws-execution-browser';
import {projectWorkflowEvent,type WorkflowTelemetryWindow} from '@/lib/workspace/workflow-telemetry';
import {telemetryRuns} from '@/lib/workspace/workflow-telemetry-view';
it('renders cancellation rules without unrelated discount fields and keeps reported evidence qualified',()=>{
 const events=[['workflow.started',{}],['policy.evaluated',{rule_id:'cancellation-policy',rule_version:'acme-cxl-2026-10',decision:'needs_approval'}],['action.completed',{action_id:'role_123',action_name:'ticket-context',provider:'internal'}]].map(([name,extra],i)=>projectWorkflowEvent(JSON.stringify({schema_version:'1.0',event_name:name,event_id:'event_'+i,run_id:'slack-cxl-test',action_id:null,timestamp:`2026-10-19T20:00:0${i}.000Z`,attempt:1,trace_id:'a'.repeat(32),span_id:'b'.repeat(16),trigger_channel:'slack',agent_deployment_version:'4',...extra as object}))!);
 const source={runtimeArn:'arn:aws:bedrock-agentcore:us-west-2:342206308838:runtime/acme_product_cancellation-OXtwF22hKd',enrolledRuntimeVersion:'4',logGroup:'/company/events',startTime:1,endTime:2};const w:WorkflowTelemetryWindow={source,events,completeness:'complete-api-traversal',unsupportedRecords:0,duplicateDeliveries:0,conflictingEventIds:[],failures:[],enforcement:'not-established'};
 const html=renderToStaticMarkup(<AwsExecutionBrowser runs={telemetryRuns(w)} runtimeVersion="4" onQuote={()=>{}} initialSelectedId="slack-cxl-test"/>);
 expect(html).toContain('Cancel subscription');expect(html).toContain('Check cancellation rules');expect(html).toContain('Review the support case');expect(html).toContain('1 role steps · 0 tool steps');expect(html).toContain('not a list of every internal rule or proof of enforcement');expect(html).not.toContain('Requested discount');expect(html).not.toContain('Denied above');
});
