# How to Authenticate Baserow Webhooks

## Does Baserow Sign Webhooks?

No. There is no signature header, no HMAC and no timestamp. Baserow sends `X-Baserow-Event` and
`X-Baserow-Delivery` plus the custom headers you configure. Authentication is a secret header you
add to the webhook and check on your endpoint.

**A static shared credential authenticates the sender, not the body, and gives no replay
protection.** Anyone who captures one request can replay it, and the body is not bound to the
secret. Use HTTPS only, make handlers idempotent with `event_id` + `batch_id`, and rotate the
credential (change the Baserow header and `BASEROW_WEBHOOK_SECRET` together) if it leaks.

## How It Works

1. Read the header named `BASEROW_WEBHOOK_HEADER` (default `Authorization`), case-insensitively.
2. Compare its **whole value** with `BASEROW_WEBHOOK_SECRET` in constant time.
3. Missing header, missing secret or mismatch: respond `401`.
4. Only then parse the body.

Do not strip or parse a `Bearer ` prefix. If you typed `Bearer abc123` in Baserow, the secret is
`Bearer abc123`.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb); // equal-length digests: never throws
}

function verifyBaserowRequest(headers, name = process.env.BASEROW_WEBHOOK_HEADER || 'Authorization',
                              secret = process.env.BASEROW_WEBHOOK_SECRET) {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    # Encode to bytes: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )

def verify_baserow_request(headers, name=None, secret=None) -> bool:
    name = name or os.environ.get("BASEROW_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("BASEROW_WEBHOOK_SECRET")
    if not secret:
        return False
    received = headers.get(name.lower())
    return bool(received) and safe_equal(received, secret)
```

## Common Gotchas

- **The method is yours to choose.** Accept POST, PUT, PATCH, GET and DELETE on the route. A JSON
  body is sent even on GET, and the body may be empty, so don't assume one.
- **Raw body, any content type.** Express: `express.raw({ type: '*/*' })`. Authenticate first.
- **Whole-value comparison.** `Authorization: Bearer abc` is compared as the full string.
- **Hookdeck source methods.** The Baserow source pre-selects POST; allow any other method your
  webhook uses.
- **Return `200`.** The docs say success requires `200 OK` and failed calls are retried a limited
  number of times (Baserow's source accepts any status below 400). Duplicates can happen; dedupe on
  `event_id` + `batch_id`, because a large `rows.*` payload is split into several calls that share one `event_id` and carry `batch_id` 1, 2, ... (Baserow source; `batch_id` is absent when there is one call).

## Debugging 401s

| Symptom | Likely cause |
|---------|--------------|
| Always 401, header present | Value differs from `BASEROW_WEBHOOK_SECRET` (missing `Bearer ` prefix, trailing space) |
| Always 401, no header | Custom header not saved on the webhook, or `BASEROW_WEBHOOK_HEADER` names a different header |
| 401 for everything | `BASEROW_WEBHOOK_SECRET` unset (the handler refuses when unconfigured) |
| 405 on PUT/PATCH/GET/DELETE | Route or Hookdeck source only allows POST |

The **Call log** in the Baserow webhook details shows the request and your response.
