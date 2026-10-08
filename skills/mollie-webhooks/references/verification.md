# Mollie Webhook Verification

Mollie has two webhook systems, and they are secured differently:

- **Classic webhooks** (a `webhookUrl` set per payment) are **unsigned**. You
  confirm them by fetching the resource from the API: the fetch-to-confirm
  pattern below.
- **Next-gen webhooks** (subscriptions created in the Dashboard or with
  `POST /v2/webhooks`) are **signed** with an `X-Mollie-Signature` header. See
  [Next-gen webhooks: signature verification](#next-gen-webhooks-signature-verification).

Tell them apart by the header: only next-gen deliveries carry
`X-Mollie-Signature`. Mollie recommends a separate URL for each system.

# Classic Webhooks: The Fetch-to-Confirm Pattern

## Why There Is No Signature to Verify

Most webhook providers sign their payloads with an HMAC so you can prove the
request came from them. **Classic Mollie webhooks do not.** There is:

- **No** signature header.
- **No** HMAC or shared webhook secret.
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

This fetches the REST API directly with `httpx` (Mollie also publishes an official
Python library, `mollie-api-py`). Authenticate with the API key as a Bearer token.

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

## Response Codes (classic)

| Situation | Respond | Why |
|-----------|---------|-----|
| Missing `id` in the body | `400` | Not a valid Mollie webhook |
| `id` fetched successfully | `200` | Handled |
| `id` unknown to Mollie (`404`) | `200` | Nothing to do; stop retries and avoid leaking which ids exist |
| `id` unknown to **your** system | `200` | Acknowledge; do not error |
| Mollie API unreachable / 5xx while fetching | `500` | Let Mollie retry later |

## Common Gotchas (classic)

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

## Debugging (classic)

- **Getting retried forever?** You are returning a non-200. Return `200` after a
  successful fetch (and for `404`s).
- **`404` on every fetch?** Wrong API key mode (test vs live), or the `id` was
  created by a different Mollie account.
- **Body parses as empty / `id` is undefined?** You are JSON-parsing a
  form-urlencoded body. Use the urlencoded parser.

# Next-gen Webhooks: Signature Verification

## The Scheme

From Mollie's [manual signature verification](https://docs.mollie.com/reference/webhooks-new#manual-signature-verification)
steps:

- **Header:** `X-Mollie-Signature: sha256=<signature>`
- **Algorithm:** HMAC-SHA256, hex-encoded
- **Signed content:** "the unaltered `POST` body of the webhook request"
- **Key:** the webhook subscription's signing secret (used as a UTF-8 string)

To verify:

1. Remove the `sha256=` prefix from the header value.
2. Compute HMAC-SHA256 of the **raw** request body with the signing secret.
3. Compare the two with a timing-safe comparison. Reject the request if they
   don't match.

Mollie's TypeScript SDK (`mollie-api-typescript`) implements exactly this in its
`SignatureValidator` helper.

## Secret Rotation: Two Signatures

After you rotate the signing secret, "each event will contain two signature
headers for the next 24 hours":

```http
X-Mollie-Signature: sha256=4a4c6f3ed4d15fee87ad44e07a7fa9b8
X-Mollie-Signature: sha256=a8994a2b90c785deeae0f7b0c6ae475f
```

Node (`req.headers`) and the Fetch API (`request.headers.get`) join repeated
headers into one comma-separated string; Starlette exposes them through
`request.headers.getlist()`. Split on `,` and accept the request if **any**
value matches. Checking only the first value breaks verification for 24 hours
after every rotation.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyMollieSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return signatureHeader.split(',').some((value) => {
    const provided = value.trim().replace(/^sha256=/, '');
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

// Express: the raw body parser keeps req.body as the exact bytes Mollie signed.
app.post('/webhooks/mollie/events', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyMollieSignature(req.body, req.headers['x-mollie-signature'], process.env.MOLLIE_WEBHOOK_SECRET)) {
    return res.status(400).send('Invalid signature');
  }
  const event = JSON.parse(req.body);
  // event.type, event.entityId, event._embedded?.entity
  res.status(200).send('OK');
});
```

### Python

```python
import hashlib
import hmac


def verify_mollie_signature(raw_body: bytes, signature_headers: list[str], secret: str) -> bool:
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    for header in signature_headers:
        for value in header.split(","):
            provided = value.strip().removeprefix("sha256=")
            if hmac.compare_digest(provided.encode(), expected.encode()):
                return True
    return False

# FastAPI:
#   raw = await request.body()
#   ok = verify_mollie_signature(raw, request.headers.getlist("x-mollie-signature"), secret)
```

## Common Gotchas (next-gen)

- **Verify the raw body.** Parsing JSON and re-serializing it changes the bytes
  and breaks the HMAC. Use `express.raw()`, `await request.text()` (Next.js) or
  `await request.body()` (FastAPI), and parse only after verifying.
- **Strip `sha256=`.** The header value is `sha256=<hex>`; compare only the hex.
  (The sample code on Mollie's best-practices page compares the whole header
  value against the bare hex digest, which never matches. Follow the manual
  verification steps instead.)
- **Handle two signatures** during a rotation (see above).
- **Never fail open.** If `MOLLIE_WEBHOOK_SECRET` is unset, reject the request
  rather than skipping verification.
- **Act fast.** Return `200` within 15 seconds; Mollie retries up to 10 times
  over about 26 hours, and marks a webhook `blocked` after repeated failures.
