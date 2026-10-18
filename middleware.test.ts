import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware, config } from './middleware';
afterEach(() => vi.unstubAllEnvs());
describe('Next15 protected-route interception', () => {
  it('matches APIs/pages with literal Next matcher', () => expect(config.matcher).toEqual(['/api/:path*','/control-plane/:path*']));
  it('preserves legacy behavior when profile absent', () => {
    vi.stubEnv('LOOPLABS_DEPLOYMENT_PROFILE', undefined);expect(middleware(new NextRequest('https://looplabs.run/api/workspace/discovery')).headers.get('x-middleware-next')).toBe('1');
  });
  it('client cannot override fixed server profile', async () => {
    vi.stubEnv('LOOPLABS_DEPLOYMENT_PROFILE','isolated-quote-demo-1');
    const r=middleware(new NextRequest('https://looplabs.run/api/workspace/discovery?profile=full',{method:'POST',headers:{'x-looplabs-deployment-profile':'full',cookie:'profile=full'}}));
    expect(r.status).toBe(403);expect(r.headers.get('cache-control')).toBe('no-store');expect(await r.json()).toEqual({error:'This capability is unavailable in this sample quote workspace.'});
  });
  it('redirect discards query destination and retains downstream route auth', () => {
    vi.stubEnv('LOOPLABS_DEPLOYMENT_PROFILE','isolated-quote-demo-1');const r=middleware(new NextRequest('https://looplabs.run/control-plane?next=https://attacker.invalid'));expect(r.status).toBe(307);expect(r.headers.get('location')).toBe('https://looplabs.run/control-plane/quotes');expect(r.headers.get('cache-control')).toBe('no-store');
  });
  it('allowed POST still needs existing CSRF/auth handler', () => {
    vi.stubEnv('LOOPLABS_DEPLOYMENT_PROFILE','isolated-quote-demo-1');expect(middleware(new NextRequest('https://looplabs.run/api/workspace/quotes?scope=bad',{method:'POST',headers:{origin:'https://attacker.invalid'}})).headers.get('x-middleware-next')).toBe('1');
  });
  it('invalid deployment setting denies session', () => {
    vi.stubEnv('LOOPLABS_DEPLOYMENT_PROFILE','');expect(middleware(new NextRequest('https://looplabs.run/api/workspace/session')).status).toBe(403);
  });
});

it('AWS installation flag is server-only, exact and preserves downstream authorization', () => {
 vi.stubEnv('LOOPLABS_DEPLOYMENT_PROFILE','isolated-control-demo-1');
 for (const flag of [undefined, '', 'true', 'ENABLED']) { vi.stubEnv('LOOPLABS_AWS_CONNECTIONS',flag); expect(middleware(new NextRequest('https://looplabs.run/api/workspace/discovery?enabled=true',{method:'POST',headers:{'x-aws-connections':'enabled'}})).status).toBe(403); }
 vi.stubEnv('LOOPLABS_AWS_CONNECTIONS','enabled'); expect(middleware(new NextRequest('https://looplabs.run/api/workspace/discovery',{method:'POST'})).headers.get('x-middleware-next')).toBe('1');
 expect(middleware(new NextRequest('https://looplabs.run/api/workspace/discovery/activity',{method:'GET'})).status).toBe(403);
});
