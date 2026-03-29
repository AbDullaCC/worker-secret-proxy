/**
 * Simple path-prefix router for the Worker.
 */

import { handleProxy } from './proxy';
import { handleMockStripe } from './mock-upstream';

export async function route(request: Request): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname;

	// ── /proxy/* ────────────────────────────────────────────────
	if (path.startsWith('/proxy/')) {
		const proxyPath = path.slice('/proxy/'.length); // e.g. "stripe/charges"
		if (!proxyPath) {
			return Response.json({ error: 'Specify a target after /proxy/, e.g. /proxy/stripe/charges' }, { status: 400 });
		}
		return handleProxy(request, proxyPath);
	}

	// ── /mock/stripe/* ──────────────────────────────────────────
	if (path.startsWith('/mock/stripe/')) {
		const subpath = path.slice('/mock/stripe/'.length);
		return handleMockStripe(request, subpath);
	}

	// ── Health / welcome ────────────────────────────────────────
	if (path === '/' || path === '') {
		return Response.json({
			service: 'secret-proxy-lab',
			status: 'ok',
			routes: [
				'GET  /                         – this health check',
				'POST /proxy/{target}/{path}    – proxy with secret injection',
				'POST /mock/stripe/charges      – mock Stripe upstream (direct)',
			],
		});
	}

	return Response.json({ error: 'Not found' }, { status: 404 });
}
