/**
 * Proxy handler.
 *
 * 1. Parse the target slug + remaining path from the URL.
 * 2. Resolve the target → upstream base URL.
 * 3. Read the inbound Authorization header (contains {{placeholder}}).
 * 4. Replace placeholders with real secrets.
 * 5. Clone / reconstruct the request with the real header.
 * 6. Dispatch to the mock upstream directly (avoids self-fetch deadlock
 *    in Wrangler's single-threaded dev server).  In production you would
 *    use fetch() to the real external API.
 * 7. Log an audit event to the console.
 * 8. Return the upstream response.
 */

import { resolvePlaceholders, resolveTarget } from './secrets';
import { dispatchMock } from './mock-upstream';
import type { AuditEvent } from './types';

// ─── In-memory audit log (printed to console) ───────────────────────
const auditLog: AuditEvent[] = [];

export async function handleProxy(request: Request, proxyPath: string): Promise<Response> {
	// proxyPath looks like "stripe/charges" or "stripe/charges?foo=bar"
	const slashIdx = proxyPath.indexOf('/');
	const targetSlug = slashIdx === -1 ? proxyPath : proxyPath.slice(0, slashIdx);
	const remainingPath = slashIdx === -1 ? '' : proxyPath.slice(slashIdx + 1);

	// ── 1. Resolve target ────────────────────────────────────────
	const upstreamBase = resolveTarget(targetSlug);
	if (!upstreamBase) {
		return Response.json({ error: `Unknown target: "${targetSlug}"` }, { status: 404 });
	}

	// ── 2. Read & resolve Authorization header ───────────────────
	const inboundAuth = request.headers.get('Authorization');
	if (!inboundAuth) {
		return Response.json({ error: 'Missing Authorization header. Send the placeholder, e.g. Bearer {{stripe_api_key}}' }, { status: 400 });
	}

	let resolvedAuth: string;
	try {
		resolvedAuth = resolvePlaceholders(inboundAuth);
	} catch (err) {
		return Response.json({ error: (err as Error).message }, { status: 400 });
	}

	// ── 3. Clone / reconstruct the request with real header ──────
	const upstreamHeaders = new Headers(request.headers);
	upstreamHeaders.set('Authorization', resolvedAuth);

	const upstreamInit: RequestInit = {
		method: request.method,
		headers: upstreamHeaders,
		body: ['GET', 'HEAD'].includes(request.method) ? null : request.body,
	};

	const upstreamRequest = new Request(request.url, upstreamInit);

	// ── 4. Dispatch to mock upstream (direct call, no network) ──
	// In production, replace this with:
	//   const upstreamResponse = await fetch(upstreamUrl, upstreamInit);
	const upstreamResponse = dispatchMock(upstreamRequest, targetSlug, remainingPath);

	if (!upstreamResponse) {
		return Response.json({ error: `No mock handler registered for target: "${targetSlug}"` }, { status: 502 });
	}

	// ── 5. Audit ─────────────────────────────────────────────────
	const event: AuditEvent = {
		id: crypto.randomUUID(),
		tenantId: 'tenant_default',
		targetId: targetSlug,
		action: 'proxy_request',
		timestamp: new Date().toISOString(),
		metadata: {
			method: request.method,
			path: `/${proxyPath}`,
			upstreamStatus: upstreamResponse.status,
			placeholderUsed: inboundAuth,
		},
	};
	auditLog.push(event);
	console.log('[AUDIT]', JSON.stringify(event));

	return upstreamResponse;
}
