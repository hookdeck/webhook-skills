# How to Verify Clickatell Webhook Requests

## How Does Clickatell Authenticate Callbacks?

Clickatell One API callbacks are **not signed**: there is no HMAC and no timestamp. Instead, you
add a **Custom Security Header** (name and secret value of your choosing) to each callback URL in
the portal, and Clickatell includes it on every callback. Your endpoint compares it with the value
it stored.

```
X-Webhook-Secret: your-secret-value
```

If you name the header `Authorization`, Clickatell sends only your custom value and ignores any Basic
Auth credentials for that URL. Compare the whole value, including any `Bearer ` prefix you typed;
do not strip or parse it.

Hookdeck's Clickatell source works the same way (header name plus exact whole header value) and
covers One API callbacks only: "Covers One API callbacks only. Add a Custom Security Header to the callback URL." Basic Auth alone and legacy SMS Gateway callbacks are not covered.

## What Does This Protect Against?

A static shared credential authenticates the **sender**, not the **body**, and gives **no replay
protection** (no signature, no timestamp). Anyone who captures a request can replay it, or reuse
the header with a different body. Mitigate:

- Serve the endpoint over HTTPS only
- Rotate the header value in the portal if it leaks
- Deduplicate on `messageId` (retries already cause duplicates)
- Keep the value out of logs

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyClickatellRequest(headers, {
  name = process.env.CLICKATELL_WEBHOOK_HEADER || 'Authorization',
  expected = process.env.CLICKATELL_WEBHOOK_SECRET,
} = {}) {
  if (!expected) return false;
  const received = headers[name.toLowerCase()];
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hmac, os

def verify_clickatell_request(headers, name=None, expected=None) -> bool:
    name = name or os.environ.get("CLICKATELL_WEBHOOK_HEADER") or "Authorization"
    expected = expected if expected is not None else os.environ.get("CLICKATELL_WEBHOOK_SECRET")
    if not expected:
        return False
    received = headers.get(name.lower())
    if not received:
        return False
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), expected.encode("utf-8"))
```

## Common Gotchas

- **Header name is yours.** Read it from `CLICKATELL_WEBHOOK_HEADER`; look it up case-insensitively.
- **Whole value.** `Bearer abc` is a different value from `abc`. Store exactly what you typed in the portal.
- **`Authorization` overrides Basic Auth.** A custom header named `Authorization` replaces the Basic Auth header.
- **Values can't be read back.** If you lose the value, update it in the portal and your env at once.
- **Constant-time compare.** `timingSafeEqual` throws on unequal lengths: check lengths first
  (Node) and encode to bytes (Python).
- **Fail closed.** If `CLICKATELL_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the header check.
- **Separate URLs.** Status and reply callback URLs each need the header configured.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | Header not added to this callback URL, wrong `CLICKATELL_WEBHOOK_HEADER`, or `CLICKATELL_WEBHOOK_SECRET` unset |
| 401 only on replies (or only on status) | Header configured on just one of the two callback URLs |
| 401 with a Bearer value | Env holds the token without the `Bearer ` prefix you typed in the portal |
| 401 right after rotating | Clickatell caches header values for a few seconds |
| 401 only behind a proxy | The proxy strips or renames the header |
| 400 after authentication | Body isn't a JSON object, or has no `event` object |
