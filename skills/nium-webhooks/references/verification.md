# How to Verify Nium Webhook Requests

## How Does Nium Authenticate Webhooks?

Nium does not sign payloads. There is no HMAC, no signature header and no timestamp. Instead, you
agree a static header with Nium during client setup, and Nium sends it on every webhook:

```
x-partner-key: <the value you agreed>
```

`x-partner-key` is only the example name in Nium's docs. The name is yours to choose, so read it
from configuration (`NIUM_WEBHOOK_HEADER`, default `x-partner-key`). The expected value is
`NIUM_WEBHOOK_SECRET`: the exact, whole header value, including any prefix such as `Bearer `.
Compare the whole value. Do not strip or parse a `Bearer ` prefix.

## What Does This Protect Against, and What Doesn't It?

A static shared credential **authenticates the sender, not the body**, and gives **no replay
protection**: there is no signature over the payload and no timestamp.

- Anyone who learns the value can send forged webhooks.
- Anyone who captures a request can replay it, and a tampered body is not detectable.
- So: serve the endpoint over HTTPS only, keep the value out of logs, **rotate the credential with
  Nium if it leaks**, deduplicate on `x-request-id`, and fetch current state from the Nium API
  before acting on payouts or balances.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

// Hash both sides: equal-length buffers, so timingSafeEqual never throws.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyNiumRequest(
  headers,
  secret = process.env.NIUM_WEBHOOK_SECRET,
  headerName = process.env.NIUM_WEBHOOK_HEADER || 'x-partner-key'
) {
  if (!secret) return false;
  const received = headers[headerName.toLowerCase()];
  return Boolean(received) && safeEqual(received, secret);
}
```

Alternatively check lengths first, then `crypto.timingSafeEqual` on equal-length `Buffer`s.

### Python

```python
import hmac, os

def verify_nium_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("NIUM_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("NIUM_WEBHOOK_HEADER") or "x-partner-key"
    received = headers.get(header_name)  # Starlette/Flask headers are case-insensitive
    if not secret or not received:
        return False
    # Encode both sides: compare_digest raises TypeError for non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))
```

Missing header or mismatch: respond `401`.

## Common Gotchas

- **Don't assume the header name.** `x-partner-key` is an example; use what you agreed with Nium.
- **Compare the whole value.** If you typed `Bearer abc123` at setup, configure
  `NIUM_WEBHOOK_SECRET="Bearer abc123"`. Don't parse the prefix.
- **Look the header up case-insensitively.** Node lowercases names in `req.headers`; `Headers.get`
  and Starlette are case-insensitive.
- **Constant-time compare.** `===` leaks timing. `timingSafeEqual` throws on unequal lengths, so
  hash both sides or check lengths first. In Python, encode to bytes before `compare_digest`.
- **Fail closed.** If `NIUM_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the credential check.
- **Non-200 is a failure.** Nium doesn't retry by default, so a 401 or 500 can lose the event.
- **RFI events have no `template`.** Use `rfiDetails.status`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `NIUM_WEBHOOK_SECRET` unset, or Nium wasn't set up to send the header yet |
| 401 and the header is present | Header name differs from `NIUM_WEBHOOK_HEADER`, or the value lacks/has a `Bearer ` prefix |
| 401 only behind a proxy | The proxy strips or renames the custom header |
| 401 began suddenly | The credential was rotated at Nium; update `NIUM_WEBHOOK_SECRET` |
| 400 after authentication | Body isn't a JSON object |
