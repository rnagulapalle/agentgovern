import { describe, expect, it } from 'vitest';
import { deploymentRouteDecision as decide, quoteDemoProfile as profile } from './deployment-capabilities';
describe('source-owned quote deployment restriction', () => {
  it('keeps absent legacy profile unchanged', () => expect(decide(undefined, '/api/workspace/discovery', 'POST')).toBe('legacy'));
  it.each(['', ' ', 'full', 'isolated-quote-demo-2', 'ISOLATED-QUOTE-DEMO-1'])('unknown explicit profile %j fails closed', value => expect(decide(value, '/api/workspace/quotes', 'GET')).toBe('deny'));
  it.each([
    ['/api/workspace/session','GET'], ['/api/workspace/session','POST'], ['/api/workspace/session','DELETE'],
    ['/api/workspace/quotes','GET'], ['/api/workspace/quotes','POST'], ['/api/workspace/quotes/setup','GET'],
    ['/api/workspace/quotes/verification','GET'], ['/api/sales','POST'], ['/control-plane/quotes','GET'], ['/control-plane/quotes','HEAD'],
  ])('allows exact supported entry %s %s to existing handler', (path,method) => expect(decide(profile,path,method)).toBe('allow'));
  it('root redirects to fixed quote home', () => expect(decide(profile,'/control-plane','GET')).toBe('quote-home'));
  it.each([
    '/api/workspace/discovery', '/api/workspace/discovery/owners', '/api/workspace/agents', '/api/workspace/records',
    '/api/workspace/enquiries', '/api/workspace/enquiries/execution', '/api/durable', '/api/durable/session',
    '/api/durable/refunds', '/api/durable/connectors', '/api/durable/workflows', '/api/indexnow', '/api/unknown',
    '/control-plane/actions', '/control-plane/work', '/control-plane/agents', '/control-plane/refunds',
    '/control-plane/durable', '/control-plane/discovery', '/control-plane/recovery', '/control-plane/unknown',
  ])('denies broader/unknown protected route %s', path => expect(decide(profile,path,'GET')).toBe('deny'));
  it.each(['/api/workspace/quotes/', '/api/workspace/quotes/execute', '/api/Workspace/quotes', '/api/workspace/%71uotes', '/api//workspace/quotes', '/api/workspace/../quotes', '/api/workspace/quotes\\setup', '/api/workspace/quotes\u0000'])('refuses alternate spelling %s', path => expect(decide(profile,path,'POST')).toBe('deny'));
  it.each(['PUT','PATCH','DELETE','TRACE','OPTIONS','post'])('refuses unsupported quote method %s', method => expect(decide(profile,'/api/workspace/quotes',method)).toBe('deny'));
  it('setup/verification remain read-only', () => {
    expect(decide(profile,'/api/workspace/quotes/setup','POST')).toBe('deny');
    expect(decide(profile,'/api/workspace/quotes/verification','POST')).toBe('deny');
    expect(decide(profile,'/api/workspace/session','PUT')).toBe('deny');
    expect(decide(profile,'/control-plane/quotes','POST')).toBe('deny');
  });
});

describe('bounded control demonstration installation', () => {
  const script = 'isolated-control-demo-1';
  it.each(['quotes', 'agents', 'actions', 'workflow-runs', 'history', 'workflows', 'approvals', 'policies', 'connectors', 'outputs', 'reconciliation'])('exposes only installed screen %s', section => {
    expect(decide(script, '/control-plane/' + section, 'GET')).toBe('allow');
    expect(decide(script, '/control-plane/' + section, 'HEAD')).toBe('allow');
    expect(decide(script, '/control-plane/' + section, 'POST')).toBe('deny');
  });
  it.each(['/api/workspace/agents', '/api/durable', '/api/durable/connectors', '/api/durable/workflows'])('passes supported API %s through to existing authorization', path => {
    for (const method of ['GET', 'POST']) expect(decide(script, path, method)).toBe('allow');
    for (const method of ['PUT', 'PATCH', 'DELETE', 'TRACE', 'OPTIONS']) expect(decide(script, path, method)).toBe('deny');
  });
  it.each(['/api/workspace/discovery', '/api/workspace/records', '/api/workspace/enquiries', '/api/durable/session', '/api/durable/refunds', '/control-plane/audit', '/control-plane/work', '/control-plane/unknown', '/api/durable/', '/api/durable/%77orkflows'])('does not broaden access to %s', path => expect(decide(script, path, 'GET')).toBe('deny'));
  it('opens the authenticated overview while preserving exact quote APIs', () => {
    expect(decide(script, '/control-plane', 'GET')).toBe('allow');
    expect(decide(script, '/api/workspace/quotes', 'POST')).toBe('allow');
    expect(decide(script, '/api/workspace/quotes/setup', 'POST')).toBe('deny');
  });
});


describe('AWS journey installation switch', () => {
  const script = 'isolated-control-demo-1';
  it('defaults closed and enables only exact AWS journey routes and supported methods', () => {
    for (const path of ['/control-plane/discovery', '/api/workspace/discovery', '/api/workspace/discovery/owners', '/api/workspace/discovery/activity']) {
      expect(decide(script, path, 'GET')).toBe('deny');
      for (const method of ['PUT', 'DELETE', 'PATCH', 'TRACE']) expect(decide(script, path, method, true)).toBe('deny');
    }
    expect(decide(script, '/control-plane/discovery', 'GET', true)).toBe('allow');
    expect(decide(script, '/api/workspace/discovery', 'POST', true)).toBe('allow');
    expect(decide(script, '/api/workspace/discovery/owners', 'GET', true)).toBe('allow');
    expect(decide(script, '/api/workspace/discovery/activity', 'POST', true)).toBe('allow');
    expect(decide(script, '/api/workspace/discovery/activity', 'GET', true)).toBe('deny');
    expect(decide(script, '/api/workspace/discovery/activity/execute', 'POST', true)).toBe('deny');
    for (const profile of ['', 'unknown', 'isolated-quote-demo-1']) expect(decide(profile, '/api/workspace/discovery', 'POST', true)).toBe('deny');
    expect(decide(script, '/api/workspace/discovery/%61ctivity', 'POST', true)).toBe('deny');
  });
});

it('AWS onboarding RPC permits only POST behind the explicit AWS feature switch',()=>{
 const profile='isolated-control-demo-1';
 expect(decide(profile,'/api/workspace/discovery/onboarding','POST',true)).toBe('allow');
 for(const method of ['GET','PUT','DELETE'])expect(decide(profile,'/api/workspace/discovery/onboarding',method,true)).toBe('deny');
 expect(decide(profile,'/api/workspace/discovery/onboarding','POST',false)).toBe('deny');
 expect(decide(profile,'/api/workspace/discovery/onboarding/execute','POST',true)).toBe('deny');
});

it('shared workflow approvals permit only exact POST in the AWS-enabled control profile',()=>{
 const route='/api/workspace/discovery/approvals';
 expect(decide('isolated-control-demo-1',route,'POST',true)).toBe('allow');
 for(const method of ['GET','HEAD','PUT','PATCH','DELETE','TRACE'])expect(decide('isolated-control-demo-1',route,method,true)).toBe('deny');
 for(const profile of ['', 'unknown', 'isolated-quote-demo-1'])expect(decide(profile,route,'POST',true)).toBe('deny');
 expect(decide('isolated-control-demo-1',route,'POST',false)).toBe('deny');
 for(const path of [route+'/execute',route+'/', '/api/workspace/discovery/%61pprovals'])expect(decide('isolated-control-demo-1',path,'POST',true)).toBe('deny');
});
