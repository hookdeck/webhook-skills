# How to Verify KnowBe4 Webhook Requests

## How Does KnowBe4 Authenticate Webhooks?

KnowBe4 does not sign payloads, and no signature header, algorithm or timestamp is documented.
The admin adds a custom header (Key and Value) to the KSAT or PhishER webhook, and your endpoint
checks that header against the value you stored:

```
<your-header-name>: <your-secret-value>
```

The header name is user-chosen, so the examples read it from `KNOWBE4_WEBHOOK_HEADER` (default
`Authorization`) and the expected value from `KNOWBE4_WEBHOOK_SECRET`. This is what Hookdeck's
KnowBe4 source does too (API key verification: header name plus exact whole header value).

**A static shared credential authenticates the sender, not the body, and gives no replay
protection** (no signature, no timestamp). Anyone who learns the value can send forged or replayed
requests. Use HTTPS only, and rotate the credential in KnowBe4 and in `KNOWBE4_WEBHOOK_SECRET` if
it leaks. Make handlers idempotent.

Basic Auth (a PhishER option) is not covered by Hookdeck's KnowBe4 source. Use the custom header.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyKnowbe4Request(headers, config = process.env) {
  const expected = config.KNOWBE4_WEBHOOK_SECRET;
  if (!expected) return false;
  const name = (config.KNOWBE4_WEBHOOK_HEADER || 'Authorization').toLowerCase();
  const received = headers[name];
  return Boolean(received) && safeEqual(received, expected);
}
```

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_knowbe4_request(headers, config=os.environ) -> bool:
    expected = config.get("KNOWBE4_WEBHOOK_SECRET")
    if not expected:
        return False
    name = (config.get("KNOWBE4_WEBHOOK_HEADER") or "Authorization").lower()
    received = headers.get(name)
    return bool(received) and safe_equal(received, expected)
```

Missing header or mismatch: respond `401`.

## Common Gotchas

- **Compare the whole value.** If you typed `Bearer abc` as the header value in KnowBe4,
  `KNOWBE4_WEBHOOK_SECRET` is `Bearer abc`. Do not strip or parse a `Bearer ` prefix.
- **Case-insensitive lookup.** Header names are case-insensitive; Node lowercases them, so lowercase
  the configured name.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `hmac.compare_digest` on bytes; passing `str` raises
  `TypeError` on non-ASCII.
- **Fail closed.** If `KNOWBE4_WEBHOOK_SECRET` is unset, reject everything rather than comparing
  against `undefined`.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the header check.
- **Failures deactivate KSAT webhooks.** More than 1,000 failed responses in an hour deactivates
  the webhook, so a wrong secret left in place can switch it off. Fix it and set the status back
  to Active.
- **Retries.** KSAT retries a failed request up to three more times, 15 minutes apart, so a
  handler can see the same event again.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `KNOWBE4_WEBHOOK_SECRET` unset, or `KNOWBE4_WEBHOOK_HEADER` doesn't match the Key in KnowBe4 |
| 401 with a `Bearer` secret | The env var omits the `Bearer ` prefix typed in KnowBe4 (or the reverse) |
| 401 only behind a proxy | The proxy strips or renames the custom header |
| 401 using Basic Auth | Basic Auth sends `Authorization: Basic ...`; use the custom header instead |
| 400 after authentication | Body isn't a JSON object |
| Webhook stopped sending | KSAT deactivated it after more than 1,000 failures in an hour |
