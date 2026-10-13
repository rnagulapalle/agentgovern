import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({usePathname:()=>'/control-plane/quotes'}));
vi.mock('./provider', () => ({useControl:()=>({state:{approvals:[],incidents:[],agents:[],runs:[],policies:[]},toast:null})}));
import { ControlShell, ControlScopeNote } from './shell';
const member={name:'Quote evaluator',email:'evaluator@example.test'};
it('quote profile shows only supported sidebar entry, sample scope and signout',()=>{
 const h=renderToStaticMarkup(<ControlShell member={member} quoteOnly>Quote content</ControlShell>);
 expect(h).toContain('Distributor quotes');expect(h).toContain('Sample data only');expect(h).toContain('Quote action controls');expect(h).toContain('Sign out');expect(h).toContain('Quick guide');
 for(const key of ['actions','work','agents','discovery','connectors','records','requests','verification','workflow-runs','settings','runs','approvals'])expect(h).not.toContain(`href="/control-plane/${key}"`);
 expect(h).not.toContain('PREPARED EXAMPLES');expect(h).not.toContain('Sales requests');expect(h).not.toContain('Action history');
});
it('legacy navigation retains broader original entries',()=>{
 const h=renderToStaticMarkup(<ControlShell member={member}>Quote content</ControlShell>);
 for(const key of ['agents','discovery','actions','settings','work'])expect(h).toContain(`href="/control-plane/${key}"`);
 expect(h).toContain('PREPARED EXAMPLES');expect(h).toContain('Sales requests');
});
it('quote scope states exact independent actions and simulated effects',()=>{
 const h=renderToStaticMarkup(createElement(ControlScopeNote,{durable:true,quoteOnly:true}));
 expect(h).toContain('Another named member');expect(h).toContain('each exact action');expect(h).toContain('No live customer records');expect(h).toContain('no customer email');expect(h).not.toContain('refund');
});
it('script profile links only installed saved controls and never browser-local history',()=>{
 const h=renderToStaticMarkup(<ControlShell member={member} scriptDemo>Script content</ControlShell>);
 for(const key of ['quotes','agents','actions','workflow-runs','history'])expect(h).toContain(`href="/control-plane/${key}"`);
 for(const key of ['work','discovery','connectors','records','requests','verification','audit','reconciliation','settings'])expect(h).not.toContain(`href="/control-plane/${key}"`);
 expect(h).toContain('Saved decision history');expect(h).not.toContain('PREPARED EXAMPLES');
});
