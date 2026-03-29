/**
 * In-memory secret store and placeholder resolver.
 *
 * In production you would fetch secrets from Workers Secrets, KV,
 * or an external vault.  For this lab everything lives in plain maps.
 */

// ─── Secret registry ─────────────────────────────────────────────────
/** Maps a placeholder name (e.g. "stripe_api_key") → real credential. */
const secrets: Record<string, string> = {
	stripe_api_key: 'sk_test_4eC39HqLyjWDarjtT1zdp7dc',
};

// ─── Target registry ─────────────────────────────────────────────────
/**
 * Maps a target slug (first path segment after /proxy/) to the
 * upstream base URL the proxy should forward to.
 *
 * Because the mock upstream runs inside the *same* Worker we point
 * at localhost.  In production this would be the real API origin.
 */
const targets: Record<string, string> = {
	stripe: 'http://localhost:8787/mock/stripe',
};

// ─── Placeholder resolver ────────────────────────────────────────────
const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;

/**
 * Replace every `{{name}}` token in `input` with the corresponding
 * secret value.  Throws if a placeholder has no matching secret.
 */
export function resolvePlaceholders(input: string): string {
	return input.replace(PLACEHOLDER_RE, (_match, name: string) => {
		const value = secrets[name];
		if (value === undefined) {
			throw new Error(`Unknown secret placeholder: {{${name}}}`);
		}
		return value;
	});
}

/**
 * Returns `true` when the string contains at least one `{{…}}` token.
 */
export function hasPlaceholders(input: string): boolean {
	return PLACEHOLDER_RE.test(input);
}

/**
 * Look up the upstream base URL for a target slug.
 * Returns `undefined` if the target is not registered.
 */
export function resolveTarget(slug: string): string | undefined {
	return targets[slug];
}
