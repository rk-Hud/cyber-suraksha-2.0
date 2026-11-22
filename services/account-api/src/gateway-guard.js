import { timingSafeEqual } from 'node:crypto';

// Only exempt a fixed read-only health endpoint. Never trust a browser Origin
// or a caller-supplied forwarding header as proof of gateway identity.
export function gatewayGuard(request, healthPath, secret = process.env.CS_GATEWAY_SECRET) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === healthPath && !url.search) return null;
  const deny = status => new Response(JSON.stringify({error: status === 503 ? 'gateway_not_configured' : 'gateway_required'}), {
    status, headers: {'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}
  });
  if (typeof secret !== 'string' || !/^[a-f0-9]{64}$/.test(secret)) return deny(503);
  const supplied = request.headers.get('x-cs-gateway-secret') || '';
  if (!/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))) return deny(403);
  return null;
}
