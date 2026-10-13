import {describe,it,expect} from 'vitest';
import {assertSuccessorProviderCompletion} from './typed-quote-successor-completion.mjs';
function fixture(){
 const identity='a'.repeat(64),mailIdentity='b'.repeat(64),body={discountBps:1400},email={subject:'Approved quote'},saved={plan:{workspaceId:'local-proof',quote:{id:'quote-42',sourceVersion:'v4'},update:{actionId:'fresh-quote',request:{binding:'quote-binding',sourceVersion:'v4',body}},message:{actionId:'fresh-email',request:{binding:'email-binding',body:email}}}};
 const before={quote:{version:4,result:{discountBps:1400}},quoteEffects:[{action_id:'old-quote',effect:{retained:true}}],mailEffects:{'old-email':{retained:true}},pendingMail:[{action_id:'old-email',state:'resolved'}]};
 const effect={contract:'quote-effect-readback-1',actionId:'fresh-quote',requestIdentity:identity,binding:'quote-binding',workspaceId:'local-proof',quoteId:'quote-42',state:'committed',sourceBefore:'v4',sourceAfter:'v5',result:body};
 const after={...structuredClone(before),workspaceId:'local-proof',quoteId:'quote-42',quote:{version:5,result:body}};
 after.quoteEffects.push({action_id:'fresh-quote',request_identity:identity,effect});
 after.mailEffects['fresh-email']={contract:'quote-email-effect-1',actionId:'fresh-email',workspaceId:'local-proof',quoteId:'quote-42',binding:'email-binding',body:email,reference:'simulated-acceptance',requestIdentity:mailIdentity,quoteRequestIdentity:identity};
 after.pendingMail.push({action_id:'fresh-email',state:'resolved',request_identity:mailIdentity,predecessor_identity:identity});
 return{before,after,saved};
}
describe('Fresh post-restore provider observation guard only',()=>{
 it('requires one new source-v4 conditional effect and dependent simulated mail while retaining old effects',()=>{const f=fixture();expect(assertSuccessorProviderCompletion(f.before,f.after,f.saved)).toEqual({newQuoteEffects:1,newSimulatedEmailAcceptances:1,oldEffectsUnchanged:true,sourceBefore:'v4',sourceAfter:'v5',production:false});});
 for(const [name,change]of [
  ['no new effect',f=>f.after.quoteEffects.pop()],
  ['duplicate new effect',f=>f.after.quoteEffects.push(structuredClone(f.after.quoteEffects[1]))],
  ['old quote mutation',f=>f.after.quoteEffects[0].effect.retained=false],
  ['old mail mutation',f=>f.after.mailEffects['old-email'].retained=false],
  ['old pending mutation',f=>f.after.pendingMail[0].state='pending'],
  ['stale source',f=>f.after.quoteEffects[1].effect.sourceBefore='v3'],
  ['wrong result',f=>f.after.quote.result={discountBps:9999}],
  ['wrong dependency',f=>f.after.mailEffects['fresh-email'].quoteRequestIdentity='c'.repeat(64)],
  ['unresolved mail',f=>f.after.pendingMail[1].state='pending'],
  ['foreign workspace',f=>f.after.workspaceId='foreign'],
  ['reused old action',f=>f.saved.plan.update.actionId='old-quote']
 ])it('refuses '+name,()=>{const f=fixture();change(f);expect(()=>assertSuccessorProviderCompletion(f.before,f.after,f.saved)).toThrow();});
});
