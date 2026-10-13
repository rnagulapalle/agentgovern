/** Additional deployment restriction, never identity/approval/effect authority.
 * Absent legacy profile retains existing route auth. Explicit quote installation
 * default-denies other protected entry points, independently of client input. */
export const quoteDemoProfile = 'isolated-quote-demo-1';
const apiMethods: Readonly<Record<string, readonly string[]>> = Object.freeze({
  '/api/workspace/session': Object.freeze(['GET', 'POST', 'DELETE']),
  '/api/workspace/quotes': Object.freeze(['GET', 'POST']),
  '/api/workspace/quotes/setup': Object.freeze(['GET']),
  '/api/workspace/quotes/verification': Object.freeze(['GET']),
  '/api/sales': Object.freeze(['POST']),
});
const pages = new Set(['/control-plane', '/control-plane/quotes']);
export type DeploymentRouteDecision = 'legacy' | 'allow' | 'quote-home' | 'deny';
export function deploymentRouteDecision(profile: string | undefined, pathname: string, method: string): DeploymentRouteDecision {
  if (profile === undefined) return 'legacy';
  if (profile !== quoteDemoProfile) return 'deny'; // Empty/unknown does not enable legacy.
  if (!pathname.startsWith('/') || /[%\\\u0000-\u0020]/.test(pathname) || pathname.includes('//') || pathname.split('/').some(p => p === '.' || p === '..')) return 'deny';
  if (pathname.startsWith('/api/') || pathname === '/api') return apiMethods[pathname]?.includes(method) ? 'allow' : 'deny';
  if (pathname === '/control-plane' || pathname.startsWith('/control-plane/')) {
    if (!['GET', 'HEAD'].includes(method) || !pages.has(pathname)) return 'deny';
    return pathname === '/control-plane' ? 'quote-home' : 'allow';
  }
  return 'allow'; // Marketing/static assets use existing handlers.
}
