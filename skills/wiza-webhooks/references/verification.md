# How to Verify Wiza Webhook Requests

## How Does Wiza Authenticate Webhooks?

Wiza does not sign payloads. Webhook requests include an `x-auth-key` header containing a SHA-256
hash of your API key: the lowercase hex digest, the same on every request.

```
x-auth-key: <lowercase hex SHA-256 of your Wiza API key>
```

There is no HMAC over the body, no timestamp and no prefix.

## What This Does and Doesn't Protect

A static shared credential authenticates the sender, not the body, and gives no replay protection
(no signature, no timestamp). Anyone who captures one request can replay it or send a different
body. Use HTTPS, and rotate the credential if it leaks. Rotating the Wiza API key changes the
header value, so update your configuration when you do.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyWizaRequest(headers, apiKey = process.env.WIZA_API_KEY) {
  if (!apiKey) return false;
  const received = headers['x-auth-key'];
  if (!received) return false;
  const expected = crypto.createHash('sha256').update(apiKey, 'utf8').digest('hex');
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hashlib, hmac, os

def verify_wiza_request(headers, api_key=None) -> bool:
    api_key = api_key if api_key is not None else os.environ.get("WIZA_API_KEY")
    received = headers.get("x-auth-key")
    if not api_key or not received:
        return False
    expected = hashlib.sha256(api_key.encode("utf-8")).hexdigest()
    return hmac.compare_digest(received.encode("utf-8"), expected.encode("utf-8"))
```

## Common Gotchas

- **Compare the hash, not the key.** `x-auth-key` is the SHA-256 of the API key. Comparing it with
  `WIZA_API_KEY` directly always fails. In Hookdeck, enter the lowercase hex SHA-256 hash of your
  Wiza API key, as sent in `x-auth-key`, not the API key itself.
- **Constant-time compare.** Check lengths before `crypto.timingSafeEqual`, which throws on unequal
  lengths. In Python pass **bytes** to `hmac.compare_digest`; a `str` with non-ASCII characters raises
  `TypeError` and would turn a bad header into a 500.
- **Fail closed.** If `WIZA_API_KEY` is unset, reject every request.
- **Authenticate before parsing.** Read the raw body (`express.raw({ type: '*/*' })`, `await
  request.text()`, `await request.body()`) so any content type works, then parse JSON after the check.
- **Header name is case-insensitive.** Frameworks lowercase it; use `x-auth-key`.
- **Retries.** A non-2xx response is retried up to 3 times; return `401` only for authentication failures.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Comparing against the raw API key, or hashing with a trailing newline (use `printf %s`, not `echo`) |
| 401 after rotating the API key | The header value changed; update `WIZA_API_KEY` (or the Hookdeck source key) |
| 401 only in Hookdeck | The configured key is the API key instead of its lowercase hex SHA-256 |
| 500 on odd header values | `hmac.compare_digest` was given `str`; encode to bytes first |
