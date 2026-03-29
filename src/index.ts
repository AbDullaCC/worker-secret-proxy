/**
 * Secret Proxy Lab — Cloudflare Worker entrypoint.
 *
 * Run locally:  npm run dev
 * Deploy:       npm run deploy
 */

import { route } from './router';

export default {
	async fetch(request, _env, _ctx): Promise<Response> {
		return route(request);
	},
} satisfies ExportedHandler<Env>;
