# How to Verify Maximizer Webhook Requests

## How Does Maximizer Authenticate Webhooks?

It doesn't sign them. There is no HMAC, no signature header and no timestamp. When you create a
target you can set `Endpoint.Headers` (a list of `{ "Key": ..., "Value": ... }`), and Maximizer
sends those headers on every webhook request to that target. Your endpoint authenticates a request
by comparing one of them with the value you stored.

```
Authorization: Bearer your-long-random-secret      (header name and value are your choice)
```

## What This Does and Does Not Prove

A static shared credential authenticates the **sender**, not the body. Anyone who obtains the
header value can send forged webhooks, and because there is no signature or timestamp, a captured
request can be **replayed** and the payload can't be shown to be unmodified. Mitigate:

- Accept HTTPS only, and keep the header out of logs.
- Rotate the credential if it leaks (see [setup.md](setup.md)).
- Make handlers idempotent using each webhook's `Id`.
- Treat payloads as hints and re-read the record from the Maximizer API for anything sensitive.

## Implementation

The header name comes from `MAXIMIZER_WEBHOOK_HEADER` (default `Authorization`); the expected value
is `MAXIMIZER_WEBHOOK_SECRET`, the exact whole header value. Look the header up case-insensitively
and compare the whole value: do not strip or parse a `Bearer ` prefix.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyMaximizerRequest(headers,
    secret = process.env.MAXIMIZER_WEBHOOK_SECRET,
    headerName = process.env.MAXIMIZER_WEBHOOK_HEADER || 'Authorization') {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return typeof received === 'string' && safeEqual(received, secret);
}
```

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_maximizer_request(headers, secret=None, header_name=None) -> bool:
    secret = secret or os.environ.get("MAXIMIZER_WEBHOOK_SECRET")
    name = (header_name or os.environ.get("MAXIMIZER_WEBHOOK_HEADER") or "Authorization").lower()
    received = next((v for k, v in headers.items() if k.lower() == name), None)
    return bool(secret) and received is not None and safe_equal(received, secret)
```

## Common Gotchas

- **Compare the whole value.** If the target header is `Bearer abc`, `MAXIMIZER_WEBHOOK_SECRET`
  must be `Bearer abc`, not `abc`.
- **The header name is yours.** There is no standard Maximizer header; check the `Key` you set.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `hmac.compare_digest` on bytes.
- **Fail closed.** If `MAXIMIZER_WEBHOOK_SECRET` is unset, reject everything.
- **Body is an array.** Reject objects with `400` after authenticating; parse only after the check.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted.
- **Respond fast.** Return `200` within 2 seconds. A slow or non-200 answer is retried twice and
  then dropped.
- **Secret in the URL.** The docs also allow a secret in the target URL's query string. Prefer a
  header, since URLs end up in logs.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Secret unset, wrong header name, or the target has no `Endpoint.Headers` |
| 401 and the value looks right | `Bearer ` prefix present in one place but not the other |
| 401 began after editing the target | Target and `MAXIMIZER_WEBHOOK_SECRET` out of sync |
| 401 only behind a proxy | The proxy strips or renames the header |
| 400 after authentication | Body isn't a JSON array of objects |
| Webhooks arrive twice | A slow response triggered Maximizer's retry; respond first, dedupe on `Id` |
