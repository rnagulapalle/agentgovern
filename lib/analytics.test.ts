import {afterEach,expect,it,vi} from 'vitest';
const capture=vi.hoisted(()=>vi.fn());
vi.mock('posthog-js',()=>({default:{capture}}));
import {captureWorkflowProofView,filterWorkflowProofEvent,workflowProofState} from './analytics';
const run=()=>({id:'private-run',state:'completed',steps:[{ordinal:1,connector:'crm',action_id:'private-crm',state:'succeeded',evidence:{outcome:'verified',reference:'private-reference'}},{ordinal:2,connector:'email',action_id:'private-mail',state:'succeeded',evidence:{outcome:'verified'},payload:{to:'private@example.test',text:'PRIVATE MESSAGE'}}]});
afterEach(()=>{capture.mockReset();vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('classifies the same fixed two-effect receipt as the workspace; completion alone is not verified',()=>{
 expect(workflowProofState(run(),'private-run')).toBe('verified');
 const active={...run(),state:'active'};expect(workflowProofState(active,active.id)).toBe('not_verified');
 expect(workflowProofState({...run(),steps:run().steps.map(s=>({...s,evidence:{outcome:'unknown'}}))},'private-run')).toBe('not_verified');
});
it.each([null,{}, {error:'Forbidden'}, {...run(),id:'foreign'}, {...run(),state:'invented'}, {...run(),steps:[]}, {...run(),steps:[null,null]}, {...run(),steps:run().steps.map(s=>({...s,connector:'email'}))}, {...run(),steps:run().steps.map(s=>({...s,action_id:'duplicate'}))}, {...run(),steps:run().steps.map(s=>({...s,state:'unknown'}))}, {...run(),steps:run().steps.map(s=>({...s,evidence:'invalid'}))}])('malformed, denied and wrong-run responses emit no engagement: %j',value=>{
 vi.stubGlobal('window',{});vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY','public-test-key');captureWorkflowProofView(value,'private-run',new Set());expect(capture).not.toHaveBeenCalled();
});
it('emits only fixed classification properties; repeated Open dedupes within mount, reload is a new view',()=>{
 vi.stubGlobal('window',{});vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY','public-test-key');const viewed=new Set<string>();
 captureWorkflowProofView(run(),'private-run',viewed);captureWorkflowProofView(run(),'private-run',viewed);
 expect(capture.mock.calls).toEqual([['workflow_proof_viewed',{proof_kind:'crm_to_message_private_twin',verification_state:'verified'}]]);
 captureWorkflowProofView(run(),'private-run',new Set());expect(capture).toHaveBeenCalledTimes(2);
});
it('analytics failure cannot block the view or cause an automatic capture retry',()=>{
 vi.stubGlobal('window',{});vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY','public-test-key');capture.mockImplementation(()=>{throw Error('SDK failed')});const seen=new Set<string>();expect(()=>captureWorkflowProofView(run(),'private-run',seen)).not.toThrow();captureWorkflowProofView(run(),'private-run',seen);expect(capture).toHaveBeenCalledTimes(1);
});
it('SDK before_send strips injected SDK/persisted private context and keeps existing QA/session flags',()=>{
 vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY','public-test-key');
 const input={event:'workflow_proof_viewed',uuid:'event-uuid',$set:{email:'secret'},$set_once:{email:'secret'},arbitrary:'secret',properties:{token:'public-test-key',proof_kind:'crm_to_message_private_twin',verification_state:'verified',distinct_id:'anonymous-12345678',$device_id:'device-12345678',$session_id:'session-12345678',$window_id:'window-12345678',$is_test:true,$current_url:'https://private.example/?run=secret',$referrer:'https://private.example/?email=secret',$initial_current_url:'secret',first_landing_path:'secret',utm_content:'secret',payload:'secret',run_id:'secret',email:'secret',arbitrary:'secret',$set:{email:'secret'}}};
 const result=filterWorkflowProofEvent(input);expect(result).toEqual({event:input.event,uuid:input.uuid,properties:{token:'public-test-key',proof_kind:input.properties.proof_kind,verification_state:'verified',distinct_id:'anonymous-12345678',$process_person_profile:false,$device_id:'device-12345678',$session_id:'session-12345678',$window_id:'window-12345678',$is_test:true}});expect(JSON.stringify(result)).not.toContain('secret');expect(input.properties.payload).toBe('secret');
});
it('unrelated events retain their current behavior, while identified/unsupported proof payloads fail closed',()=>{
 vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY','public-test-key');
 const normal={event:'site_page_viewed',properties:{path:'/guides'}};expect(filterWorkflowProofEvent(normal)).toBe(normal);expect(filterWorkflowProofEvent(null)).toBeNull();
 for(const p of [{},{proof_kind:'other',verification_state:'verified',distinct_id:'anonymous-12345678'},{proof_kind:'crm_to_message_private_twin',verification_state:'verified',distinct_id:'person@example.test'},{proof_kind:'crm_to_message_private_twin',verification_state:'native-success',distinct_id:'anonymous-12345678'}])expect(filterWorkflowProofEvent({event:'workflow_proof_viewed',properties:{token:'public-test-key',...p}})).toBeNull();
 expect(filterWorkflowProofEvent({event:'workflow_proof_viewed',properties:{token:'different-public-token',proof_kind:'crm_to_message_private_twin',verification_state:'verified',distinct_id:'anonymous-12345678'}})).toBeNull();
});
