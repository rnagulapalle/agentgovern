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
