# How to Verify Bitrise Webhook Requests

## How Does Bitrise Authenticate Webhooks?

It doesn't sign them. There is no HMAC, signature header or timestamp. Instead, you add a custom
header (name and value of your choosing) to the outgoing webhook's **Headers** section, and your
endpoint checks that the header is present with the exact value you set.

```
X-Webhook-Secret: your-long-random-value
```

The header value can be hidden in the Bitrise UI after you save it.

## A Static Credential Is Not a Signature

A static shared header authenticates the **sender**, not the **body**. Anyone who learns the value
can forge requests, and anyone who captures a valid request can replay it, because nothing ties
the credential to the payload or to a point in time. So:

- Serve your endpoint over **HTTPS** only.
- **Rotate** the header value if it leaks (update the webhook in Bitrise and your environment).
- Treat webhook payloads as notifications, and fetch authoritative state from the Bitrise API
  before taking high-impact actions.
- Deduplicate on `webhook_event_unique_id` for Release Management events.

## Implementation

The header name comes from `BITRISE_WEBHOOK_HEADER` (default `Authorization`) and the expected
value from `BITRISE_WEBHOOK_SECRET`. Look the header up case-insensitively and compare the
**whole** value. Don't strip or parse a `Bearer ` prefix: if you typed `Bearer abc123` into
Bitrise, the stored secret is `Bearer abc123`.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyBitriseRequest(
  headers,
  secret = process.env.BITRISE_WEBHOOK_SECRET,
  headerName = process.env.BITRISE_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def verify_bitrise_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("BITRISE_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("BITRISE_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return bool(received) and hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

## Common Gotchas

- **Compare the whole value.** Don't strip `Bearer `; the stored secret includes whatever you typed.
- **Header names are user-chosen.** Match case-insensitively (HTTP header names are
  case-insensitive, and Node lowercases them).
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `hmac.compare_digest` on bytes, never on `str`.
- **Fail closed.** If `BITRISE_WEBHOOK_SECRET` is unset, reject everything.
- **Hidden values can't be read back.** If you tick **Hide** and lose the value, set a new one.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the header check.
- **Telling payloads apart.** `trigger_event` identifies Release Management events. Bitrise
  documents no payload for CI build events, so treat any other body as undocumented and inspect a
  real delivery before relying on its fields.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `BITRISE_WEBHOOK_SECRET` unset, or wrong `BITRISE_WEBHOOK_HEADER` |
| 401 with `Authorization` | Secret missing the `Bearer ` prefix you typed into Bitrise |
| 401 only behind a proxy | The proxy strips or renames the custom header |
| 401 after editing the webhook | The header value was changed or re-hidden; update your secret |
| 400 after authentication | Body isn't a JSON object |
