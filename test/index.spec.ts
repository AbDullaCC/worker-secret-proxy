import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('secret-proxy-lab', () => {
	// ── Health check ────────────────────────────────────────────
	it('GET / returns service info (unit style)', async () => {
		const request = new IncomingRequest('http://localhost:8787/');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		const body = await response.json<{ service: string; status: string }>();
		expect(body.service).toBe('secret-proxy-lab');
		expect(body.status).toBe('ok');
	});

	it('GET / returns service info (integration style)', async () => {
		const response = await SELF.fetch('https://example.com/');
		expect(response.status).toBe(200);
		const body = await response.json<{ service: string }>();
		expect(body.service).toBe('secret-proxy-lab');
	});

	// ── Mock upstream ───────────────────────────────────────────
	it('mock stripe rejects missing auth', async () => {
		const response = await SELF.fetch('https://example.com/mock/stripe/charges', {
			method: 'POST',
		});
		expect(response.status).toBe(401);
	});

	it('mock stripe accepts valid auth', async () => {
		const response = await SELF.fetch('https://example.com/mock/stripe/charges', {
			method: 'POST',
			headers: { Authorization: 'Bearer sk_test_4eC39HqLyjWDarjtT1zdp7dc' },
		});
		expect(response.status).toBe(200);
		const body = await response.json<{ object: string; status: string }>();
		expect(body.object).toBe('charge');
		expect(body.status).toBe('succeeded');
	});

	// ── Proxy ───────────────────────────────────────────────────
	it('proxy rejects missing Authorization header', async () => {
		const response = await SELF.fetch('https://example.com/proxy/stripe/charges', {
			method: 'POST',
		});
		expect(response.status).toBe(400);
	});

	it('proxy rejects unknown placeholder', async () => {
		const response = await SELF.fetch('https://example.com/proxy/stripe/charges', {
			method: 'POST',
			headers: { Authorization: 'Bearer {{wrong_key}}' },
		});
		expect(response.status).toBe(400);
		const body = await response.json<{ error: string }>();
		expect(body.error).toContain('Unknown secret placeholder');
	});

	it('proxy rejects unknown target', async () => {
		const response = await SELF.fetch('https://example.com/proxy/unknown/path', {
			method: 'POST',
			headers: { Authorization: 'Bearer {{stripe_api_key}}' },
		});
		expect(response.status).toBe(404);
	});
});
