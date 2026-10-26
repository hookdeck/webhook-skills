# How to Verify 100ms Webhook Requests

## How Does 100ms Authenticate Webhooks?

100ms does not sign payloads. There is no HMAC and no timestamp. The docs say: "You can specify
headers that will be passed transparently to your webhook endpoint. At your end, verify the
contents of the HTTP header (key) and value." Secret headers are configured on the 100ms dashboard.

So you choose a header name and value, 100ms sends them on every webhook, and your endpoint
compares the received value with the one you stored:

```
Authorization: Bearer your-secret
```

The header name is user-chosen. The examples read it from `HUNDRED_MS_WEBHOOK_HEADER` (default
`Authorization`) and the expected value from `HUNDRED_MS_WEBHOOK_SECRET`, the exact, whole header
value including any `Bearer ` prefix you typed.

## Security Limits

A static shared credential authenticates the **sender**, not the **body**, and gives **no replay
protection** (no signature, no timestamp). Anyone who captures one request can replay it, and a
leaked value works until you change it. Use HTTPS only, dedupe on the event `id`, rotate the
credential if it leaks, and consider allowlisting the 100ms IP addresses too.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(received, expected) {
  const a = crypto.createHash('sha256').update(Buffer.from(received, 'latin1')).digest();
  const b = crypto.createHash('sha256').update(Buffer.from(expected, 'utf8')).digest();
  return crypto.timingSafeEqual(a, b);
}

function verify100msRequest(headers, secret = process.env.HUNDRED_MS_WEBHOOK_SECRET) {
  if (!secret) return false;
  const name = (process.env.HUNDRED_MS_WEBHOOK_HEADER || 'Authorization').toLowerCase();
  const received = headers[name];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def safe_equal(received: str, expected: str) -> bool:
    # compare_digest raises TypeError on non-ASCII str, so compare bytes.
    return hmac.compare_digest(received.encode("latin-1"), expected.encode("utf-8"))

def verify_100ms_request(headers, secret=None) -> bool:
    secret = secret or os.environ.get("HUNDRED_MS_WEBHOOK_SECRET")
    name = os.environ.get("HUNDRED_MS_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(name.lower())
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Compare the whole value.** Don't strip or parse a `Bearer ` prefix; 100ms sends what you typed.
  The same applies to Hookdeck's 100ms source (header name plus exact whole header value).
- **Header names are case-insensitive.** Node lowercases them; look the name up lowercase.
- **Constant-time compare.** Hash both sides or check lengths before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `hmac.compare_digest` on bytes, never `str`.
- **Fail closed.** If `HUNDRED_MS_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the header check.
- **Respond 200.** Any other status triggers three retries, so always dedupe on `id`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `HUNDRED_MS_WEBHOOK_SECRET` unset, or the header isn't configured in the dashboard |
| 401, values look identical | The `Bearer ` prefix is missing from one side, or `HUNDRED_MS_WEBHOOK_HEADER` names a different header |
| 401 only behind a proxy | The proxy strips or renames the header |
| 400 after authentication | Body isn't a JSON object with a `type` |
| Same event processed twice | Retries after a non-200; dedupe on `id` |
