import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
const location=vi.hoisted(()=>({path:'/control-plane/quotes'}));
beforeEach(()=>{location.path='/control-plane/quotes';});
vi.mock('next/navigation', () => ({usePathname:()=>location.path}));
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
 for(const key of ['workflows','approvals','policies','connectors','outputs','reconciliation','agents','workflow-runs','history'])expect(h).toContain(`href="/control-plane/${key}"`);
 for(const key of ['work','discovery','records','requests','verification','audit','settings'])expect(h).not.toContain(`href="/control-plane/${key}"`);
 for(const label of ['Overview','Workflows','Workflow runs','Approvals','Agents','Connections','Policies &amp; access','Output controls','Reconciliation','Decision history'])expect(h).toContain(label);expect(h).not.toContain('PREPARED EXAMPLES');expect(h).not.toContain('cp-enforcement-bars');
});

it.each(["workflows","approvals","policies","outputs","reconciliation","connectors"])("saved %s page never inherits browser-local navigation or evidence labels", section=>{location.path="/control-plane/"+section;const h=renderToStaticMarkup(<ControlShell member={member} scriptDemo>Saved content</ControlShell>);expect(h).toContain("Saved controls");expect(h).toContain("decisions saved on the server");expect(h).not.toContain("Browser-local sample data");expect(h).not.toContain("changes saved in this browser");expect(h).not.toContain("Search anything");expect(h).not.toContain("href=\"/control-plane/settings\"");});

it('administrator persona appears only in installed saved workspace and never changes limited profile navigation',()=>{
 const installed=renderToStaticMarkup(<ControlShell member={member} scriptDemo>Content</ControlShell>);
 expect(installed).toContain('Workspace administrator');
 for(const props of [{quoteOnly:true},{}]){const limited=renderToStaticMarkup(<ControlShell member={member} {...props}>Content</ControlShell>);expect(limited).not.toContain('Workspace administrator');}
});
