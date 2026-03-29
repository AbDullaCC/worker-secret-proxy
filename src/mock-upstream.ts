/**
 * Mock upstream handlers.
 *
 * These simulate real third-party APIs (Stripe, etc.) so the
 * entire lab runs with a single `npm run dev`.  The mock validates
 * that the Authorization header carries the *real* secret — not the
 * placeholder — proving the proxy did its job.
 */

const STRIPE_TEST_KEY = 'sk_test_4eC39HqLyjWDarjtT1zdp7dc';

/**
 * Dispatch a request to the correct mock handler based on target slug
 * and sub-path.  Called directly by the proxy (no network round-trip)
 * so we avoid the single-threaded deadlock in Wrangler's dev server.
 */
export function dispatchMock(request: Request, targetSlug: string, subpath: string): Response | null {
	if (targetSlug === 'stripe') {
		return handleMockStripe(request, subpath);
	}
	return null; // unknown target – caller can decide what to do
}

/** Handle any request under /mock/stripe/* */
export function handleMockStripe(request: Request, subpath: string): Response {
	// ── Auth check ───────────────────────────────────────────────
	const auth = request.headers.get('Authorization');
	if (!auth || auth !== `Bearer ${STRIPE_TEST_KEY}`) {
		return Response.json(
			{
				error: {
					type: 'authentication_error',
					message: 'Invalid API key provided.',
				},
			},
			{ status: 401 },
		);
	}

	// ── Route within /mock/stripe/* ──────────────────────────────
	if (subpath === 'charges' || subpath === 'charges/') {
		return handleCharges(request);
	}

	return Response.json({ error: { type: 'invalid_request_error', message: `Unknown Stripe endpoint: ${subpath}` } }, { status: 404 });
}

// ─── /mock/stripe/charges ────────────────────────────────────────────
function handleCharges(request: Request): Response {
	if (request.method !== 'POST') {
		return Response.json({ error: { type: 'invalid_request_error', message: 'Only POST is supported.' } }, { status: 405 });
	}

	// Return a fake charge object
	const chargeId = `ch_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;

	return Response.json({
		id: chargeId,
		object: 'charge',
		amount: 1000,
		currency: 'usd',
		status: 'succeeded',
		description: 'Mock charge created by secret-proxy-lab',
		created: Math.floor(Date.now() / 1000),
	});
}
