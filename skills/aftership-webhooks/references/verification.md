# How to Verify AfterShip Webhook Signatures

## Why Signature Verification Matters

Your AfterShip webhook endpoint is a public URL. Anyone who finds it can POST a fake
`tracking_update` with `msg.tag = "Delivered"` and stop your delivery-failure alerting, or
a fake `return.approved` and trigger a refund. The HMAC signature is what proves the
request came from AfterShip.

## How It Works

Every AfterShip product uses **the same algorithm**:

```
signature = base64( HMAC-SHA256( key = webhook_secret_as_utf8, message = raw_request_body ) )
```

- **Algorithm:** HMAC-SHA256
- **Key:** the webhook secret **as a UTF-8 string**. It is *not* base64-decoded first and
  it carries no prefix.
- **Message:** the **raw request body bytes**, exactly as received.
- **Encoding:** standard base64 (not hex, not base64url).
- **Not signed:** nothing else. There is no timestamp in the signature, no timestamp
  header, and no replay window — **do not add a tolerance check**, you would be inventing
  a mechanism AfterShip does not have.

Only the **header name** varies by product.

## The Three Header Names

| Product | Header | Value format |
|---------|--------|--------------|
| **Tracking** | `aftership-hmac-sha256` | bare base64 digest |
| **Returns** and **Warranty** | `as-signature-hmac-sha256` | bare base64 digest |
| **Shipping** (Postmen) | `am-webhook-signature` | `hmac-sha256=<base64 digest>` |
| **Returns, legacy orgs** (created before Oct 25, 2022) | `am-webhook-signature` | `hmac-sha256=<base64 digest>` |

HTTP header names are case-insensitive. The Tracking docs render the header as
`Aftership-Hmac-Sha256`; Express, Next.js and FastAPI all normalise incoming header names
to lowercase, so match on the lowercase spelling.

Because the `hmac-sha256=` prefix is harmless to strip when it is not there, one helper
can cover all four rows: look for the headers in order, strip an optional
`^hmac-sha256=`, and compare.

What the docs say, verbatim:

> **Tracking:** "Each webhook request includes a `aftership-hmac-sha256` header. The
> signature is a base64-encoded HMAC generated using sha256 algorithm with webhook request
> body and webhook secret of your account."
>
> **Shipping:** "Each webhook request includes an `am-webhook-signature` header. The
> signature is a base64-encoded HMAC generated using the sha256 algorithm with the webhook
> request body and the webhook secret of your account." Its sample ends with
> `console.log('hmac-sha256=' + sign); // should be equal to am-webhook-signature value`.
>
> **Returns / Warranty:** "You should grab the webhook signature value from the HTTP
> Header: `as-signature-hmac-sha256`. You can recalculate the same signature by creating an
> HMAC with SHA256, using the provided webhook secret and the HTTP request body." And:
> "Please be aware that the header and format are not the same as our AfterShip product's
> webhooks."
>
> **Legacy Returns:** "For some of the existing organizations, the signature Header is
> `am-webhook-signature` and the header value is in the form of `hmac-sha256={signature}`.
> This only applies to organizations created before Oct 25, 2022."

## Implementation

AfterShip's docs point to no SDK helper for webhook verification, and the official Node
SDK (`@aftership/tracking-sdk` 17.0.0, inspected) has none, so implement it manually. AfterShip's own Node sample is:

```javascript
crypto.createHmac('sha256', secret).update(data).digest('base64');
```

and its Python sample is `hmac.new(bytes(secret, 'utf-8'), bytes(data, 'utf-8'), hashlib.sha256).digest()`
passed through `base64.b64encode`.

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

// Checked in this order. Stripping the prefix is a no-op on the two bare headers.
const SIGNATURE_HEADERS = [
  'aftership-hmac-sha256',      // Tracking
  'as-signature-hmac-sha256',   // Returns, Warranty
  'am-webhook-signature',       // Shipping, legacy Returns (hmac-sha256=<digest>)
];

function verifyAfterShipSignature(rawBody, headers, secret) {
  if (!secret) return false;            // fail closed — never skip verification
  const name = SIGNATURE_HEADERS.find((h) => headers[h]);
  if (!name) return false;              // no signature header at all
  const received = String(headers[name]).replace(/^hmac-sha256=/, '');
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  // timingSafeEqual THROWS on a length mismatch — guard the length first.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

`rawBody` must be a `Buffer` (Express: `express.raw({ type: 'application/json' })`) or the
exact body string (Next.js: `await request.text()`).

### Python (FastAPI)

```python
import base64
import hashlib
import hmac

SIGNATURE_HEADERS = (
    "aftership-hmac-sha256",     # Tracking
    "as-signature-hmac-sha256",  # Returns, Warranty
    "am-webhook-signature",      # Shipping, legacy Returns
)


def verify_aftership_signature(raw_body: bytes, headers, secret: str) -> bool:
    if not secret:
        return False  # fail closed
    received = next((headers.get(h) for h in SIGNATURE_HEADERS if headers.get(h)), None)
    if not received:
        return False
    if received.startswith("hmac-sha256="):
        received = received[len("hmac-sha256="):]
    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode()
    # Bytes, not str: compare_digest raises TypeError on non-ASCII str input.
    # It is safe for differing lengths (unlike Node's timingSafeEqual).
    return hmac.compare_digest(received.encode(), expected.encode())
```

`raw_body` comes from `await request.body()`.

## Status Codes to Return

| Situation | Status |
|-----------|--------|
| Verified and handled | `200` |
| No signature header present | `401` |
| Signature present but wrong | `401` |
| Body is not valid JSON | `400` |
| `AFTERSHIP_WEBHOOK_SECRET` is not configured | `500` |

A missing secret must be a **500, not a bypass**. Failing open here would accept every
forged request the moment an environment variable goes missing in a deploy.

## Common Gotchas

- **Re-serialized JSON.** The single most common cause of failures. `JSON.stringify()` of
  a parsed body re-orders nothing but does change whitespace, unicode escaping and number
  formatting, so the bytes no longer match. AfterShip's *own* Shipping sample signs
  `JSON.stringify(webhookPayload)` — ignore that and sign the raw body, which is correct
  for every product.
  - Express: mount `express.raw({ type: 'application/json' })` on the webhook route only,
    and make sure no global `express.json()` runs before it.
  - Next.js App Router: `const raw = await request.text()` and parse afterwards.
  - FastAPI: `raw = await request.body()` — not the Pydantic-parsed model.
- **Base64-decoding the secret.** The secret is used as UTF-8 bytes, verbatim. Decoding it
  (as you would for a Svix `whsec_` key) produces a different key and every signature
  fails.
- **Hex instead of base64.** `.digest('hex')` is wrong. The digest is standard base64 —
  44 characters ending in `=` for SHA-256.
- **The `hmac-sha256=` prefix.** Shipping (and legacy Returns) prefix the header value.
  Comparing the raw header against a bare digest always fails. Strip the prefix first.
- **Wrong header for the product.** Returns and Warranty do **not** send
  `aftership-hmac-sha256`. Check all three names.
- **Wrong product's secret.** Tracking, Shipping, Returns and Warranty each have their
  own secret in their own admin. A valid-looking signature that never matches usually
  means the endpoint is configured with a sibling product's secret.
- **`crypto.timingSafeEqual` throws.** It raises `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`
  when the buffers differ in length, which is exactly what a forged short signature looks
  like. Compare lengths first (or wrap in `try/catch`) so a bad signature returns `401`
  instead of crashing with a `500`.
- **Inventing a replay window.** No timestamp is signed and no timestamp header is sent.
  `ts` in the Tracking body and `created_at` in the Returns body are unsigned metadata —
  rejecting on their age would drop legitimate retries (AfterShip retries for ~68 hours).
  Use `event_id` / `id` for idempotency instead.
- **Header case.** The docs show `Aftership-Hmac-Sha256`; frameworks give you
  `aftership-hmac-sha256`. Look it up in lowercase.

## How to Debug Verification Failures

1. **Log the header you actually received.** Print which of the three names was present
   and its first 8 characters. If none was present, the request did not come from
   AfterShip (or a proxy stripped the header).
2. **Compare digest lengths.** A base64 SHA-256 digest is 44 characters. 64 characters
   means something produced hex.
3. **Hash the raw bytes you received** and compare with what you computed. If they differ
   for a request you believe is genuine, you are almost certainly signing re-serialized
   JSON — log `rawBody.length` and confirm it matches `content-length`.
4. **Confirm which product sent it.** `aftership-hmac-sha256` + a body with `event`/`msg`
   is Tracking; `event_type`/`meta` is Shipping; `id`/`version`/`event: "return.…"` is
   Returns. Then check that the endpoint's secret is that product's secret.
5. **Reproduce locally.** Sign a captured body with your configured secret and post it to
   your own endpoint:

   ```bash
   BODY='{"event":"tracking_update","event_id":"94dadd60-ed26-46d0-aa52-3ced925a50ff","msg":{"tag":"InTransit"},"ts":1712741696}'
   SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$AFTERSHIP_WEBHOOK_SECRET" -binary | base64)
   curl -X POST http://localhost:3000/webhooks/aftership \
     -H "Content-Type: application/json" \
     -H "aftership-hmac-sha256: $SIG" \
     -d "$BODY"
   ```

   If that succeeds but real deliveries fail, the difference is the body bytes or the
   secret, not the algorithm.
6. **Inspect the real request.** `npx hookdeck-cli listen 3000 aftership --path /webhooks/aftership`
   gives you a web UI showing the exact headers and raw body AfterShip sent, and lets you
   replay it against your handler.

## Defence in Depth: Source IPs

AfterShip Tracking delivers from `104.154.18.15`, `34.122.118.39`, `34.70.29.163`,
`34.70.81.106`, `34.72.178.234`. Shipping, Returns and Warranty publish their own separate
lists — do not reuse the Tracking list for them. An allowlist supplements signature
verification; it never replaces it.
