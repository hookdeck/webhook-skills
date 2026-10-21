# How to Verify RevenueCat Webhooks

## Which Checks Apply?

> **Caveat:** HMAC signing is **opt-in**. Unless you toggle **HMAC webhook signing** on the integration (the secret is shown once, at creation or rotation), RevenueCat sends **no signature**. The only authentication is then the static `Authorization` header value you configured in the dashboard, which your server must compare to the expected value in **constant time**.

| Integration settings | What arrives | What to check |
|---|---|---|
| Authorization header set, signing off | `Authorization: <your value>` | Constant-time compare of the full header value |
| Signing on | `X-RevenueCat-Webhook-Signature: t=…,v1=…` | HMAC-SHA256 (below), plus timestamp tolerance |
| Both | Both headers | Both checks |
| Neither | Nothing | Nothing to verify. Don't run like this: configure at least one |

The Authorization value is static and never changes per request, so anyone who sees one request can replay it. Prefer enabling HMAC signing.

## How the Signature Works

When signing is enabled, every delivery includes:

```
X-RevenueCat-Webhook-Signature: t=<unix_timestamp>,v1=<hmac_sha256_hex>
```

- **Algorithm:** HMAC-SHA256
- **Key:** the integration's signing secret, as a UTF-8 string (no prefix stripping, no base64 decoding)
- **Signed content:** `"<t>.<raw request body>"`
- **Encoding:** lowercase hex
- **Not Standard Webhooks:** there are no `webhook-id` / `webhook-timestamp` headers.

There is no official RevenueCat server SDK for webhook verification, so all three examples verify manually.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyRevenueCatSignature(rawBody, header, secret, toleranceSeconds = 300) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    })
  );
  const { t, v1 } = parts;
  if (!/^[0-9]+$/.test(t || '') || !v1) return false;

  const expected = crypto.createHmac('sha256', secret)
    .update(`${t}.`).update(rawBody)          // rawBody: Buffer of the exact bytes received
    .digest('hex');
  const ok = v1.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
  return ok && Math.abs(Date.now() / 1000 - Number(t)) <= toleranceSeconds;
}
```

### Python

```python
import hashlib, hmac, time

def verify_revenuecat_signature(raw_body: bytes, header: str | None, secret: str, tolerance: int = 300) -> bool:
    if not header:
        return False
    parts = dict(p.strip().split("=", 1) for p in header.split(",") if "=" in p)
    t, v1 = parts.get("t", ""), parts.get("v1")
    if not (t.isascii() and t.isdigit()) or not v1:
        return False
    expected = hmac.new(secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v1) and abs(time.time() - int(t)) <= tolerance
```

### Authorization header (constant time)

```javascript
// Hash both sides so timingSafeEqual gets equal-length buffers.
const h = (s) => crypto.createHash('sha256').update(s).digest();
const authorized = !!received && crypto.timingSafeEqual(h(received), h(process.env.REVENUECAT_WEBHOOK_AUTH));
```

```python
authorized = received is not None and hmac.compare_digest(received.encode(), expected.encode())
```

The full handlers in [examples/](../examples/) run both checks, return `401` on failure, and return `500` when neither `REVENUECAT_WEBHOOK_SECRET` nor `REVENUECAT_WEBHOOK_AUTH` is set.

## Timestamp Tolerance

RevenueCat recomputes `t` and `v1` on **every** delivery attempt, including automatic retries and a manual **Retry** from the dashboard. `t` is when RevenueCat signed that HTTP request, not the event's `event_timestamp_ms`. A 5-minute (300 s) tolerance therefore only needs to cover clock skew and request latency; don't widen it to cover the ~80-minute retry window. Because `t` is inside the signed content, an attacker can't refresh it on a replayed request.

Retries keep the same `event.id`, so also deduplicate on it.

## Common Gotchas

- **Raw body:** compute the HMAC over the exact bytes received. `JSON.parse` → `JSON.stringify`, or any framework that re-parses the body, changes the bytes and breaks valid signatures. Use `express.raw()` in Express, `await request.arrayBuffer()` in Next.js, `await request.body()` in FastAPI.
- **Secret shown once:** if you lost it, rotate. Rotation invalidates the old secret immediately; there's no overlap window.
- **Header names:** Node and most frameworks lowercase incoming header names (`x-revenuecat-webhook-signature`, `authorization`).
- **Authorization is the whole value:** RevenueCat sends exactly what you typed. If you entered `Bearer abc`, compare against `Bearer abc`, not `abc`.
- **Return exactly `200`:** any other status, including other `2xx` codes, counts as a failure and is retried.
- **Constant-time compares:** use `crypto.timingSafeEqual` / `hmac.compare_digest`, never `===` / `==`. `timingSafeEqual` throws on unequal lengths, so check length first (or hash both sides).

## Debugging Verification Failures

| Symptom | Likely cause |
|---|---|
| `Missing X-RevenueCat-Webhook-Signature header` | HMAC signing isn't enabled on this integration, or you're testing with a hand-made request |
| `Invalid signature` on every request | Wrong secret (rotated, or from another integration), or the body was parsed/re-serialised before verifying |
| `Invalid signature` on some requests | A proxy or middleware is altering the body (encoding, whitespace) |
| `Timestamp outside tolerance` | Server clock drift; sync with NTP |
| `Invalid Authorization header` | Value doesn't match exactly (missing `Bearer ` prefix, trailing whitespace, a different integration's value) |
