# Secret Proxy Lab

A Cloudflare Worker that proxies requests to third-party APIs while injecting
secrets on the edge — the calling application never handles raw credentials.

## How It Works

```
┌──────────┐   Authorization: Bearer {{stripe_api_key}}   ┌──────────────┐
│  Client   │ ─────────────────────────────────────────▶  │  /proxy/*    │
│  (curl)   │                                              │  Worker      │
└──────────┘                                               │              │
                                                           │  1. Resolve  │
                                                           │     placeholder
                                                           │  2. Inject   │
                                                           │     real key │
                                                           │  3. Forward  │
                                                           └──────┬───────┘
                                                                  │
                                          Authorization: Bearer sk_test_4eC39...
                                                                  │
                                                                  ▼
                                                           ┌──────────────┐
                                                           │ /mock/stripe │
                                                           │ (upstream)   │
                                                           └──────────────┘
```

The client sends a placeholder like `{{stripe_api_key}}` in the `Authorization`
header. The Worker resolves it to the real credential, reconstructs the request
with the real header, and forwards it to the upstream. An audit event is logged
to the console for every proxied call.

## Prerequisites

- **Node.js** ≥ 18
- **npm** (comes with Node)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the local dev server (Wrangler)
npm run dev
# → Worker is running at http://localhost:8787
```

## Curl Examples

### Health check

```bash
curl http://localhost:8787/
```

```json
{
	"service": "secret-proxy-lab",
	"status": "ok",
	"routes": [
		"GET  /                         – this health check",
		"POST /proxy/{target}/{path}    – proxy with secret injection",
		"POST /mock/stripe/charges      – mock Stripe upstream (direct)"
	]
}
```

### Proxy a Stripe charge (with placeholder)

This is the main use-case. The `Authorization` header contains the
**placeholder** `{{stripe_api_key}}` — not the real key:

```bash
curl -X POST http://localhost:8787/proxy/stripe/charges \
  -H "Authorization: Bearer {{stripe_api_key}}" \
  -H "Content-Type: application/json" \
  -d '{"amount": 1000, "currency": "usd"}'
```

```json
{
	"id": "ch_abcdef1234567890abcdef12",
	"object": "charge",
	"amount": 1000,
	"currency": "usd",
	"status": "succeeded",
	"description": "Mock charge created by secret-proxy-lab",
	"created": 1711756800
}
```

Check the terminal — you'll see an `[AUDIT]` line printed for every proxied
request.

### Proxy with unknown placeholder (error case)

```bash
curl -X POST http://localhost:8787/proxy/stripe/charges \
  -H "Authorization: Bearer {{wrong_key}}"
```

```json
{ "error": "Unknown secret placeholder: {{wrong_key}}" }
```

### Direct mock upstream call (bypass proxy)

Call the mock Stripe endpoint directly with the **real** key to verify it works
independently:

```bash
curl -X POST http://localhost:8787/mock/stripe/charges \
  -H "Authorization: Bearer sk_test_4eC39HqLyjWDarjtT1zdp7dc" \
  -H "Content-Type: application/json" \
  -d '{"amount": 2500, "currency": "eur"}'
```

## Project Structure

```
src/
  index.ts           – Worker entrypoint
  router.ts          – Path-prefix router
  proxy.ts           – /proxy handler (resolve → clone → forward)
  mock-upstream.ts   – /mock/stripe/* fake Stripe API
  secrets.ts         – In-memory secret store & placeholder resolver
  types.ts           – Data-model types (tenant, target, version, binding, audit)
  schema-diagram.md  – Mermaid ERD for the control-plane schema
```

## Data Model

See [`src/schema-diagram.md`](src/schema-diagram.md) for a full Mermaid ERD.

The five core entities are:

| Entity                | Purpose                                                    |
| --------------------- | ---------------------------------------------------------- |
| **Tenant**            | An org/team that owns targets and secrets                  |
| **ExternalTarget**    | A third-party API (Stripe, GitHub, etc.)                   |
| **SecretVersion**     | One version of a credential, supporting rotation           |
| **CredentialBinding** | Maps a secret version → the HTTP header to inject          |
| **AuditEvent**        | Immutable log of every proxy call and control-plane action |

## Running Tests

```bash
npm test
```

## License

Lab exercise — no license.
