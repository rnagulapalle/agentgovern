import {expect,it} from 'vitest';
import {executionReference} from './execution-reference';
import type {WorkflowTelemetryEvent} from './workflow-telemetry';
const ref={connectionId:'aws',scanId:'scan',resourceArn:'arn:runtime',version:'15'};
const event=(v:string)=>({reportedDeploymentVersion:v} as WorkflowTelemetryEvent);
it('uses a known exact execution version rather than the latest reference',()=>expect(executionReference([event('15')],[{...ref,version:'16'},ref])).toEqual(ref));
it.each([[],[event('17')],[event('15'),event('16')],[event('../15')]].map(events=>({events})))('refuses empty, unknown, mixed or malformed reported versions',({events})=>expect(executionReference(events,[ref])).toBeNull());
it('refuses duplicate or cross-runtime references',()=>{expect(executionReference([event('15')],[ref,ref])).toBeNull();expect(executionReference([event('15')],[ref,{...ref,resourceArn:'foreign',version:'16'}])).toBeNull();});
