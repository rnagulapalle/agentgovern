import { NextRequest, NextResponse } from 'next/server';
import { deploymentRouteDecision } from './lib/workspace/deployment-capabilities';
/** Literal matcher is required by Next15 static extraction. This second
 * restriction never substitutes for existing route identity, CSRF or policy. */
export function middleware(request: NextRequest) {
  const decision = deploymentRouteDecision(process.env.LOOPLABS_DEPLOYMENT_PROFILE, request.nextUrl.pathname, request.method, process.env.LOOPLABS_AWS_CONNECTIONS === 'enabled');
  if (decision === 'deny') return NextResponse.json({ error: 'This capability is unavailable in this sample quote workspace.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  if (decision === 'quote-home') {
    const target = request.nextUrl.clone(); target.pathname = '/control-plane/quotes'; target.search = '';
    const response = NextResponse.redirect(target, 307); response.headers.set('Cache-Control', 'no-store'); return response;
  }
  return NextResponse.next();
}
export const config = { matcher: ['/api/:path*', '/control-plane/:path*'] };
