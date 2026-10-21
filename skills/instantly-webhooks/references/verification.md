# How to Verify Instantly Webhooks

## How It Works

Instantly **does not sign webhooks**:

- No signature header, no HMAC, no public-key signature
- No timestamp header (the payload's `timestamp` is the event time, not a
  delivery time)
- Not Standard Webhooks (no `webhook-id` / `webhook-signature`)
- No published IP allowlist

What Instantly does offer is **custom headers**: key/value pairs you attach to
a webhook, either in the UI ("Add headers (optional) — attach custom HTTP
headers for authentication") or in the API v2 `headers` object. The API's own
example is `Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=`. Instantly sends
these headers unchanged on every delivery, so you authenticate by comparing the
received value to the one you configured.

## Implementation

There's no Instantly SDK for webhook verification. All three examples compare
the header manually.

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

const HEADER = (process.env.INSTANTLY_WEBHOOK_HEADER || 'authorization').toLowerCase();
const EXPECTED = process.env.INSTANTLY_WEBHOOK_SECRET;

function verifyInstantlyHeader(received, expected) {
  if (!received || !expected) return false;
  const a = Buffer.from(String(received), 'utf8');
  const b = Buffer.from(String(expected), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Express: req.headers[HEADER]   Next.js: request.headers.get(HEADER)
```

### Python (FastAPI)

```python
import hmac, os

HEADER = os.getenv("INSTANTLY_WEBHOOK_HEADER", "Authorization")
EXPECTED = os.getenv("INSTANTLY_WEBHOOK_SECRET")

def verify_instantly_header(received: str | None, expected: str | None) -> bool:
    if not received or not expected:
        return False
    return hmac.compare_digest(received.encode(), expected.encode())

# request.headers.get(HEADER)  (Starlette headers are case-insensitive)
```

## Common Gotchas

- **Compare the whole value.** For Basic Auth, `INSTANTLY_WEBHOOK_SECRET` must
  include the `Basic ` prefix, because that's what Instantly sends.
- **Use a constant-time compare.** `===` / `==` leaks timing. In Node,
  `timingSafeEqual` throws on different lengths, so check length first.
- **Fail closed.** If the secret env var is missing, reject the request (the
  examples return 500) instead of accepting everything.
- **Header names are case-insensitive.** Node lowercases incoming header
  names, so look up `INSTANTLY_WEBHOOK_HEADER` lowercased.
- **No raw-body requirement.** Nothing is signed over the body, but the
  examples still read it raw so they authenticate before parsing and can
  return a clean 400 on malformed JSON.
- **Replays aren't detected.** A captured request stays valid until you rotate
  the header value. Use HTTPS, deduplicate (see
  [overview.md](overview.md#idempotency)), and rotate if a value leaks.
- **Webhooks created without headers** have no credential at all. Edit them to
  add one before relying on the endpoint.

## Status Codes

| Situation | Code |
|-----------|------|
| Authenticated and processed | `200` |
| Missing header | `401` |
| Wrong header value | `401` |
| Invalid JSON (after auth) | `400` |
| `INSTANTLY_WEBHOOK_SECRET` not set | `500` |

Instantly retries non-2xx responses and eventually disables the webhook, so
a misconfigured secret shows up as a disabled webhook (`status: -1`).

## Debugging Verification Failures

1. Inspect a real delivery in the Hookdeck CLI web UI (or Instantly's Webhook
   Activity Monitoring) and confirm the header name and value Instantly sends.
2. Check `INSTANTLY_WEBHOOK_HEADER` matches that name (case doesn't matter).
3. Check `INSTANTLY_WEBHOOK_SECRET` matches the value byte for byte: scheme
   prefix, no quotes from `.env`, no trailing whitespace or newline.
4. If you edited the header in Instantly, update `.env` and restart.
5. Use `POST /api/v2/webhooks/{id}/test` and read `status_code` in the response.
