# Mollie Webhook "Verification" — The Fetch-to-Confirm Pattern

## Why There Is No Signature to Verify

Most webhook providers sign their payloads with an HMAC so you can prove the
request came from them. **Mollie does not.** There is:

- **No** signature header (no `X-Mollie-Signature`, no `webhook-signature`).
- **No** HMAC or shared webhook secret.
- **No** Standard Webhooks headers (`webhook-id` / `webhook-timestamp` / `webhook-signature`).
- **No** recommended IP allowlist — Mollie's webhook source IPs change over time.

Instead, the webhook body contains **only an id** and **no status**:

```
Content-Type: application/x-www-form-urlencoded

id=tr_5B8cwPMGnU6qLbRvo7qEZo
```

Because the status is never transmitted, a forged request is harmless. The only
thing an attacker can do by POSTing a fake or real `id` is make your server
re-fetch a payment you already own. You never mark anything as paid based on the
request body — you mark it paid based on what the **Mollie API** tells you.

## The Pattern

1. **Read the `id`** from the `application/x-www-form-urlencoded` body.
2. **Fetch the resource** from the Mollie API using your API key.
3. **Act on the authoritative `status`** from the API response.
4. **Return `200`** quickly — even for unknown ids — so Mollie stops retrying.

```
POST id=tr_xxx  ──▶  GET https://api.mollie.com/v2/payments/tr_xxx
                     Authorization: Bearer <MOLLIE_API_KEY>
                          │
                          ▼
                     200 → read payment.status → act → respond 200
                     404 → unknown/deleted id  → respond 200 (nothing to do)
                     network / 5xx → respond 500 so Mollie retries
```

## Implementation

### Node (official SDK — `@mollie/api-client`)

The SDK handles auth and parsing. It throws for non-2xx responses; a `404` means
the id is unknown.

```javascript
const { createMollieClient } = require('@mollie/api-client');
const mollie = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY });

async function fetchPayment(id) {
  try {
    return await mollie.payments.get(id);
  } catch (err) {
    if (err.statusCode === 404) return null; // unknown/deleted id
    throw err;                               // transient — let the caller return 500
  }
}
```

### Python / FastAPI (manual REST fetch)

Mollie's official SDKs are Node and PHP, so for Python fetch the REST API directly
with `httpx`. Authenticate with the API key as a Bearer token.

```python
import os, httpx

async def fetch_payment(payment_id: str, client: httpx.AsyncClient) -> dict | None:
    r = await client.get(
        f"https://api.mollie.com/v2/payments/{payment_id}",
        headers={"Authorization": f"Bearer {os.environ['MOLLIE_API_KEY']}"},
    )
    if r.status_code == 404:
        return None          # unknown/deleted id
    r.raise_for_status()     # transient errors bubble up → return 500 so Mollie retries
    return r.json()
```

## Response Codes

| Situation | Respond | Why |
|-----------|---------|-----|
| Missing `id` in the body | `400` | Not a valid Mollie webhook |
| `id` fetched successfully | `200` | Handled |
| `id` unknown to Mollie (`404`) | `200` | Nothing to do; stop retries and avoid leaking which ids exist |
| `id` unknown to **your** system | `200` | Acknowledge; do not error |
| Mollie API unreachable / 5xx while fetching | `500` | Let Mollie retry later |

## Common Gotchas

- **The body is `application/x-www-form-urlencoded`, not JSON.** Parse it with
  `express.urlencoded()` / `request.form()` — not a JSON parser.
- **Never trust the request as the source of truth.** The status lives only in the
  fetched payment, never in the webhook body.
- **Always return `200` for unknown ids.** Returning `404`/`500` makes Mollie
  retry for ~26 hours and can leak which ids exist.
- **Use the matching key.** A `test_…` key cannot fetch a payment created with a
  `live_…` key, and vice versa — that surfaces as a `404`.
- **Idempotency.** Mollie may call the webhook more than once for the same status
  (and retries on non-200). Make status handling idempotent.
- **Acknowledge fast, work async.** Do heavy work (emails, fulfillment) after
  responding, or hand off to a queue, so you return `200` well within Mollie's
  timeout.

## Debugging

- **Getting retried forever?** You are returning a non-200. Return `200` after a
  successful fetch (and for `404`s).
- **`404` on every fetch?** Wrong API key mode (test vs live), or the `id` was
  created by a different Mollie account.
- **Body parses as empty / `id` is undefined?** You are JSON-parsing a
  form-urlencoded body. Use the urlencoded parser.
