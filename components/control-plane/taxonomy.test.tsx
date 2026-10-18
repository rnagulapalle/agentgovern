import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams('workflow=discounts')}));
import {ActionsWorkspace} from './actions-workspace';
import {AgentsWorkspace} from './agents-workspace';
import {ConnectorActionsWorkspace} from './connector-actions-workspace';
import {Status} from './ui';
it('action type is distinguished from a multi-step workflow without exposing an unloaded action',()=>{
 const h=renderToStaticMarkup(createElement(ActionsWorkspace,{scriptDemo:true}));
 expect(h).toContain('Action type');expect(h).toContain('Each action type has its own permissions');
 expect(h).not.toContain('Each workflow keeps');expect(h).not.toContain('Approve this discount');
});
it('agent setup explains assigned type and lifetime allowance without changing private key authority',()=>{
 const h=renderToStaticMarkup(createElement(AgentsWorkspace,{scriptDemo:true}));
 for(const text of ['Agent type (assigned)','Allowed system','Lifetime request allowance','independent approval'])expect(h).toContain(text);
 expect(h).toContain('name="actionLimit"');expect(h).toContain('min="1"');expect(h).toContain('max="1000"');
 expect(h).not.toContain('type="submit"'); // The existing register button remains unavailable before directory loading.
 expect(h).toMatch(/<button[^>]*disabled/);
});
it('a selected message template is not described as approved before review',()=>{
 const h=renderToStaticMarkup(createElement(ConnectorActionsWorkspace,{connector:'email'}));
 expect(h).toContain('Message template');expect(h).not.toContain('Approved template');expect(h).toContain('Request approval');
 expect(h).toContain('different workspace member must approve');expect(h).toContain('no AI model runs');
});
it.each([['held','Needs approval'],['ready','Ready to execute'],['executing','Applying change'],['uncertain','Outcome uncertain'],['succeeded','Change confirmed'],['cancelled','Cancelled']])('state %s has a readable label without changing its state value',(value,label)=>{
 const h=renderToStaticMarkup(createElement(Status,{value}));expect(h).toContain(label);expect(h).toContain(`cp-status-${value}`);
});
it('an unknown state is not converted to a confirmed outcome',()=>{
 const h=renderToStaticMarkup(createElement(Status,{value:'unknown-future-state'}));expect(h).toContain('unknown-future-state');expect(h).not.toContain('Change confirmed');
});
