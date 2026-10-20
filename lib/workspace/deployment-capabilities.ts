/** Additional deployment restriction, never identity/approval/effect authority.
 * Absent legacy profile retains existing route auth. Explicit quote installation
 * default-denies other protected entry points, independently of client input. */
export const quoteDemoProfile = 'isolated-quote-demo-1';
export const scriptDemoProfile = 'isolated-control-demo-1';
export const scriptDemoSections = Object.freeze(['coding-agents', 'quotes', 'organization', 'agents', 'activity', 'actions', 'workflow-runs', 'history', 'workflows', 'approvals', 'policies', 'connectors', 'outputs', 'reconciliation']);
const apiMethods: Readonly<Record<string, readonly string[]>> = Object.freeze({
  '/api/workspace/session': Object.freeze(['GET', 'POST', 'DELETE']),
  '/api/workspace/quotes': Object.freeze(['GET', 'POST']),
  '/api/workspace/quotes/setup': Object.freeze(['GET']),
  '/api/workspace/quotes/verification': Object.freeze(['GET']),
  '/api/sales': Object.freeze(['POST']),
});
const scriptApiMethods: Readonly<Record<string, readonly string[]>> = Object.freeze({
  ...apiMethods,
  '/api/workspace/agents': Object.freeze(['GET', 'POST']),
  '/api/workspace/company': Object.freeze(['GET', 'POST']),
  '/api/durable': Object.freeze(['GET', 'POST']),
  '/api/durable/connectors': Object.freeze(['GET', 'POST']),
  '/api/durable/workflows': Object.freeze(['GET', 'POST']),
});
const scriptPages = new Set(['/control-plane', ...scriptDemoSections.map(section => `/control-plane/${section}`)]);
const pages = new Set(['/control-plane', '/control-plane/quotes']);
export type DeploymentRouteDecision = 'legacy' | 'allow' | 'quote-home' | 'deny';
export function deploymentRouteDecision(profile: string | undefined, pathname: string, method: string, awsConnections = false): DeploymentRouteDecision {
  if (profile === undefined) return 'legacy';
  if (profile !== quoteDemoProfile && profile !== scriptDemoProfile) return 'deny'; // Empty/unknown does not enable legacy.
  if (!pathname.startsWith('/') || /[%\\\u0000-\u0020]/.test(pathname) || pathname.includes('//') || pathname.split('/').some(p => p === '.' || p === '..')) return 'deny';
  if (profile === scriptDemoProfile && awsConnections === true) {
    if (pathname === '/control-plane/discovery') return ['GET', 'HEAD'].includes(method) ? 'allow' : 'deny';
    if (['/api/workspace/discovery/activity', '/api/workspace/discovery/onboarding', '/api/workspace/discovery/approvals'].includes(pathname)) return method === 'POST' ? 'allow' : 'deny';
    if (['/api/workspace/discovery', '/api/workspace/discovery/owners'].includes(pathname)) return ['GET', 'POST'].includes(method) ? 'allow' : 'deny';
  }
  if (pathname.startsWith('/api/') || pathname === '/api') return (profile === scriptDemoProfile ? scriptApiMethods : apiMethods)[pathname]?.includes(method) ? 'allow' : 'deny';
  if (pathname === '/control-plane' || pathname.startsWith('/control-plane/')) {
    if (!['GET', 'HEAD'].includes(method) || !(profile === scriptDemoProfile ? scriptPages : pages).has(pathname)) return 'deny';
    return pathname === '/control-plane' && profile === quoteDemoProfile ? 'quote-home' : 'allow';
  }
  return 'allow'; // Marketing/static assets use existing handlers.
}
