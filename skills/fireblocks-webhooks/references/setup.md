# Setting Up Fireblocks Webhooks

## Prerequisites

- A Fireblocks workspace (Sandbox for testing, or Production/EU/EU2)
- An Admin-level role (Owner, Admin or Non-Signing Admin): only these can configure webhooks
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI or a tunnel for local development)

## No Signing Secret to Copy

Unlike HMAC-based providers, Fireblocks Webhooks v2 uses **asymmetric** signatures. Requests are signed with Fireblocks' private key; you verify with their **public** keys, published at a regional JWKS endpoint. There is **no shared secret to store** — you only need to know which environment (region) your workspace is in so you point at the right JWKS URL.

| Environment | JWKS Endpoint | `FIREBLOCKS_WEBHOOK_ENV` |
|-------------|---------------|--------------------------|
| US Production | `https://keys.fireblocks.io/.well-known/jwks.json` | `production` |
| EU | `https://eu-keys.fireblocks.io/.well-known/jwks.json` | `eu` |
| EU2 | `https://eu2-keys.fireblocks.io/.well-known/jwks.json` | `eu2` |
| Sandbox | `https://sandbox-keys.fireblocks.io/.well-known/jwks.json` | `sandbox` |

Keys rotate automatically; the JWKS response is cacheable (`Cache-Control: max-age=3600`). The `jose` (Node) and `jwcrypto` (Python) libraries fetch and cache the key set for you and select the correct key by the JWS `kid`.

## Register Your Endpoint

### Option A — Fireblocks Console (Developer Center)

1. Go to the Fireblocks Console → **Developer center** → **Webhooks**.
2. Click **Create webhook**.
3. Enter your endpoint URL, e.g. `https://your-app.com/webhooks/fireblocks`.
4. **Subscribe to events** — pick the categories or specific event types you need (e.g. `transaction.created`, `transaction.status.updated`, `transaction.approval_status.updated`).
5. Save. Fireblocks starts delivering signed `POST` requests.

### Option B — Webhooks v2 API

You can also create and manage webhooks programmatically with the Webhooks v2 API (or the official Fireblocks SDK). The SDK manages webhook **configuration** (create, list, update, delete, and resend) — note it does **not** ship a signature-verification helper, so verification is done with `jose` / `jwcrypto` as shown in the examples.

## Retry & Delivery Behavior

- Fireblocks expects an HTTP **200** response. Return `200` only after you have safely accepted the event (verified + enqueued/persisted).
- Responses of **5xx**, **429**, or **408** are retried with exponential backoff at roughly:
  `10s, 30s, 120s, 300s, 900s, 1800s, 3600s, 7200s, 14400s` — up to **10 attempts**.
- Respond quickly (well under any timeout). Do heavy work asynchronously and acknowledge fast.
- **Resend:** you can programmatically resend events for up to **30 days** if you missed them.

## Test Mode vs Live Mode

- Use the **Sandbox** workspace and its JWKS endpoint (`sandbox`) for development. Sandbox transactions are simulated.
- Production / EU / EU2 workspaces use their respective JWKS endpoints — set `FIREBLOCKS_WEBHOOK_ENV` accordingly.
- Signatures are region-specific: a Sandbox-signed webhook only verifies against the Sandbox JWKS.

## Local Development

Expose your local server with the Hookdeck CLI (no account required):

```bash
# Express / Next.js (port 3000)
npx hookdeck-cli listen 3000 fireblocks --path /webhooks/fireblocks

# FastAPI (port 8000)
npx hookdeck-cli listen 8000 fireblocks --path /webhooks/fireblocks
```

The CLI prints a public URL — register that (with the `/webhooks/fireblocks` path) as your webhook endpoint in the Fireblocks Console.
