# How to Authenticate PingOne Subscription Webhooks

## How It Works

PingOne subscription requests are **unsigned**: no HMAC, no timestamp, no signature header. The
only credential is the header you configured on the subscription (`httpEndpoint.headers`). The
docs' own example is `"Authorization": "Basic username:password"`, and note it is *not*
base64-encoded: PingOne sends whatever string you typed.

Because the header name and value are free-form, the examples take both from the environment:

| Variable | Meaning |
|----------|---------|
| `PINGONE_WEBHOOK_HEADER` | Header name you set (default `Authorization`), looked up case-insensitively |
| `PINGONE_WEBHOOK_SECRET` | The exact, whole header value, including any `Bearer ` or `Basic ` prefix you typed |

Compare the **whole value**. Don't strip or parse a `Bearer ` prefix, and don't base64-decode a
`Basic ` value: if you typed `Basic username:password`, that literal string is what arrives.
A missing header or a mismatch gets `401`. This matches Hookdeck's PingOne source (API key
verification: header name plus exact whole value).

## Implementation

There's no SDK; verification is a constant-time string comparison.

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

// Hash both sides so the buffers are equal length: timingSafeEqual can't throw
// and the secret's length isn't revealed.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyPingOneRequest(headers, config = process.env) {
  const secret = config.PINGONE_WEBHOOK_SECRET;
  if (!secret) return false;
  const name = (config.PINGONE_WEBHOOK_HEADER || 'Authorization').toLowerCase();
  const received = headers[name];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}
```

Next.js route handlers get a `Headers` object; `headers.get(name)` is already case-insensitive.

### Python (FastAPI)

```python
import hmac

def safe_equal(a: str, b: str) -> bool:
    # Bytes, not str: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

def verify_pingone_request(headers, config) -> bool:
    secret = config.get("PINGONE_WEBHOOK_SECRET")
    if not secret:
        return False
    name = (config.get("PINGONE_WEBHOOK_HEADER") or "Authorization").lower()
    received = next((v for k, v in headers.items() if k.lower() == name), None)
    return bool(received) and safe_equal(received, secret)
```

In FastAPI, wrap this in a dependency (`dependencies=[Depends(require_pingone_auth)]`) so the
route never runs for unauthenticated requests.

## What This Does and Doesn't Protect

A static shared credential **authenticates the sender, not the body**, and gives **no replay
protection**: there is no signature over the payload and no timestamp, so anyone who captures a
request can resend or alter it. Mitigate:

- Serve the endpoint over HTTPS only (the credential is in a header on every request).
- Rotate the header value on the subscription (and `PINGONE_WEBHOOK_SECRET`) if it leaks.
- Dedupe on each event's `id` if replays matter.
- Optionally add outbound mutual TLS on the subscription (`tlsClientAuthKeyPair`).

## Common Gotchas

- **Don't use `===` / `==`.** Plain comparison returns early on the first differing character.
- **`timingSafeEqual` throws on unequal lengths.** Hash both values first (as above) or guard lengths.
- **`hmac.compare_digest` raises `TypeError` on non-ASCII `str`.** Encode both sides to bytes.
- **Empty secret.** If `PINGONE_WEBHOOK_SECRET` is unset, reject everything.
- **Use the raw body, any content type.** In Express use `express.raw({ type: '*/*' })`; `ND_JSON`
  isn't `application/json`, so `express.json()` would skip it. Authenticate, then parse.
- **Both body formats.** `JSON_ARRAY` is one JSON document; `ND_JSON` is one event per line. Try
  the whole body first, then fall back to line-by-line.
- **Return 200 only when handled.** PingOne retries the current event until it gets a `200` and
  doesn't move on to the next one until then.

## Debugging Authentication Failures

| Symptom | Likely cause |
|---------|--------------|
| `401` on every delivery | `PINGONE_WEBHOOK_SECRET` differs from the subscription's header value (trailing whitespace/newline, or a missing `Bearer ` prefix) |
| `401` but the secret looks right | `PINGONE_WEBHOOK_HEADER` isn't the header name on the subscription |
| `401` with a `Basic` value | You base64-encoded it. PingOne sends the literal string you typed |
| `400 Invalid body` | Body isn't a JSON array or ND_JSON (check the subscription `format` is `ACTIVITY`) |
| Same events keep arriving | Your endpoint isn't returning `200` |
| Nothing arrives | Subscription `enabled` is false, or `includedActionTypes` doesn't match |
