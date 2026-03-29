/**
 * Control-plane data model for the secret proxy.
 *
 * These types represent the minimal schema required to manage
 * tenants, external targets, secret versions, credential bindings,
 * and audit events.  For this lab they live in-memory; in production
 * they would be persisted in D1 / Postgres / etc.
 */

// ─── Tenant ──────────────────────────────────────────────────────────
/** An organisation or team that owns targets and secrets. */
export interface Tenant {
	id: string;
	name: string;
	createdAt: string; // ISO-8601
}

// ─── External Target ─────────────────────────────────────────────────
/** A third-party API the proxy can forward traffic to. */
export interface ExternalTarget {
	id: string;
	tenantId: string;
	/** Human-friendly slug, e.g. "stripe" */
	name: string;
	/** The upstream base URL, e.g. "https://api.stripe.com" */
	baseUrl: string;
	createdAt: string;
}

// ─── Secret Version ──────────────────────────────────────────────────
/** One version of a secret credential tied to a target. */
export interface SecretVersion {
	id: string;
	targetId: string;
	version: number;
	/** In production this would be ciphertext; here it's plaintext for the lab. */
	encryptedValue: string;
	createdAt: string;
	revokedAt?: string;
}

// ─── Credential Binding ──────────────────────────────────────────────
/**
 * Maps a secret version to an HTTP header that should be injected
 * when proxying requests to the bound target.
 *
 * `headerTemplate` may contain mustache-style placeholders, e.g.
 * "Bearer {{stripe_api_key}}" — the proxy resolves them at runtime.
 */
export interface CredentialBinding {
	id: string;
	targetId: string;
	secretVersionId: string;
	headerName: string; // e.g. "Authorization"
	headerTemplate: string; // e.g. "Bearer {{stripe_api_key}}"
}

// ─── Audit Event ─────────────────────────────────────────────────────
/** An immutable log entry recording a proxy or control-plane action. */
export interface AuditEvent {
	id: string;
	tenantId: string;
	targetId: string;
	action: 'proxy_request' | 'secret_rotated' | 'binding_created' | 'binding_revoked';
	timestamp: string; // ISO-8601
	metadata: Record<string, unknown>;
}
