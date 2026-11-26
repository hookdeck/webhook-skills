# How to Verify Airwallex Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is a public URL. Anyone can POST to it. Verifying the
`x-signature` header proves the request genuinely came from Airwallex and that
the body was not tampered with in transit. Never act on an unverified payload.

## How It Works

Airwallex signs webhooks with **HMAC-SHA256** once the webhook has a secret.
It starts signing after you retrieve the notification URL's secret key in the
web app; until then deliveries carry no `x-signature`. Each signed request
carries two headers:

| Header | Value |
|--------|-------|
| `x-timestamp` | The send time as a Unix timestamp in **milliseconds** (e.g. `1712345678000`) |
| `x-signature` | The HMAC-SHA256 digest, **hex**-encoded |

The signed message — Airwallex calls it `value_to_digest` — is:

```
value_to_digest = x-timestamp + raw_request_body
```

That is the `x-timestamp` string **immediately followed by** the raw request
body, keyed with the endpoint's secret. To verify:

1. Read `x-timestamp` and `x-signature` from the headers.
2. Compute `HMAC_SHA256(secret, x-timestamp + raw_body)` and hex-encode it.
3. Compare your digest to `x-signature` with a **constant-time** comparison.
4. (Optional) Reject if `x-timestamp` is too far from the current time (replay
   protection).

> This is **not** the Standard Webhooks / Svix scheme — there are no
> `webhook-id` / `webhook-signature` headers and no `whsec_`-decoding step. It is
> a custom HMAC over `timestamp + body`.

## Important: Use the Raw Body

You **must** compute the HMAC over the exact bytes Airwallex sent. If you
`JSON.parse` and re-serialize the body first, key ordering or whitespace changes
break the signature. Verify **before** parsing:

- **Express:** mount `express.raw({ type: 'application/json' })` on the webhook
  route so `req.body` is a `Buffer`.
- **Next.js (App Router):** call `await req.text()` to get the raw string.
- **FastAPI:** call `await request.body()` to get the raw `bytes`.

## Implementation

Airwallex's docs show manual verification in Java, PHP and Node.js and document
no SDK helper for it, so verify manually in every framework.

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyAirwallexSignature(rawBody, timestamp, signature, secret) {
  if (!timestamp || !signature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(timestamp)   // x-timestamp string first
    .update(rawBody)     // then the raw body bytes (Buffer or string)
    .digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python (FastAPI)

```python
import hmac, hashlib

def verify_airwallex_signature(raw_body: bytes, timestamp: str, signature: str, secret: str) -> bool:
    if not timestamp or not signature:
        return False
    message = timestamp.encode("utf-8") + raw_body  # timestamp first, then raw bytes
    expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)  # constant-time
```

## Optional: Replay Protection

Airwallex's docs describe comparing `x-timestamp` to the current time but do not
mandate a fixed window. If you add a tolerance, remember `x-timestamp` is in
**milliseconds**:

```javascript
const ageMs = Math.abs(Date.now() - Number(timestamp));
if (ageMs > 5 * 60 * 1000) return false; // reject events older than 5 minutes
```

Keep the window generous enough to tolerate retries and clock skew.

## Common Gotchas

- **Wrong concatenation order** — it is `timestamp + body`, not `body + timestamp`.
- **Milliseconds, not seconds** — `x-timestamp` is Unix ms. Don't divide by 1000
  when rebuilding `value_to_digest`.
- **Hex, not base64** — `x-signature` is a hex digest.
- **Parsed body** — re-serialized JSON won't match. Use the raw bytes.
- **Wrong secret** — each webhook URL has its **own** secret. Using another
  endpoint's secret fails verification.
- **Test events** — Airwallex signs these with the key in the test event's
  `client-secret-key` header, not the webhook's secret.
- **No signature yet** — `x-signature` is only sent once the webhook's secret
  has been retrieved in the web app.
- **Header casing** — Node lowercases headers (`req.headers['x-signature']`);
  fetch `Headers` are case-insensitive; FastAPI's `request.headers` is
  case-insensitive too.

## Debugging Verification Failures

1. Log the raw body length and the first/last few bytes — confirm you're hashing
   the untouched body.
2. Log `x-timestamp` and confirm it's a 13-digit millisecond value.
3. Recompute the digest manually and diff against `x-signature`.
4. Confirm `AIRWALLEX_WEBHOOK_SECRET` matches the secret shown for **this exact
   URL** under Developer → Webhooks.
5. If using a proxy/framework that buffers or reformats bodies, ensure it isn't
   pretty-printing or re-encoding the JSON before your handler sees it.
