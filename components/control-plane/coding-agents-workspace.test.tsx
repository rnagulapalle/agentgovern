import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {CodingAgentsWorkspace} from './coding-agents-workspace';
it('labels illustrative usage and avoids copying reference customer data or implying a live gateway',()=>{const h=renderToStaticMarkup(<CodingAgentsWorkspace/>);for(const text of ['Coding agent controls','Acme sample workspace','no coding clients or model providers are connected','Changes reset when you reload','GPT-5.2-Codex','Claude Sonnet 4.5','Skills &amp; prompts','Requests &amp; decisions'])expect(h).toContain(text);for(const text of ['MESMD','dhcs.ca.gov','LIVE ·','api_key','sk_test'])expect(h).not.toContain(text);expect(h).toContain('View Maya Chen controls');expect(h).toContain('aria-label="Coding agent views"');});

it('shows organization ownership, team filtering and explicit per-engineer model allowances',()=>{
 const h=renderToStaticMarkup(<CodingAgentsWorkspace/>);
 for(const text of ['Acme Corporation','Jordan Ellis','Organization &amp; teams','Filter engineers by team','Quality Engineering','Nina Patel','Priya Shah','Leo Brooks','Permitted models','Team membership alone grants no access.','6 of 6 engineers'])expect(h).toContain(text);
 expect(h).toContain('Fictional demo organization');
});
