# How to Authenticate Quickbase Webhook Requests

## How Does Quickbase Authenticate Webhooks?

It doesn't sign them. There is no HMAC, no signing secret and no timestamp. The only mechanism is
a header you add yourself in the webhook's **Message header** list (up to 10 name/value pairs):

```
Authorization: Bearer your-secret
```

The name and value are yours. Your endpoint rejects any request whose header doesn't match.

## What This Does and Doesn't Protect

A static shared credential authenticates the **sender, not the body**. It gives **no replay
protection**: anyone who captures one request can resend it, and the body can be altered by
anything that holds the credential. So:

- Serve the endpoint over HTTPS only.
- Rotate the credential (edit the webhook header and `QUICKBASE_WEBHOOK_SECRET`) if it leaks.
- Make handlers idempotent, since a replayed request looks identical to a real one.
- Remember every admin of the Quickbase app can see and copy the webhook, including the secret.

## Implementation

Header name: `QUICKBASE_WEBHOOK_HEADER` (default `Authorization`), looked up case-insensitively.
Expected value: `QUICKBASE_WEBHOOK_SECRET`, compared **whole** (no `Bearer ` parsing) in constant time.

### Node.js

```javascript
const crypto = require('crypto');

function verifyQuickbaseRequest(headers, secret = process.env.QUICKBASE_WEBHOOK_SECRET) {
  if (!secret) return false;
  const name = (process.env.QUICKBASE_WEBHOOK_HEADER || 'Authorization').toLowerCase();
  const received = headers[name];
  if (typeof received !== 'string') return false;
  const a = Buffer.from(received, 'latin1');
  const b = Buffer.from(secret, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hmac

def verify_quickbase_request(headers, secret, header_name="Authorization") -> bool:
    received = headers.get(header_name)
    if not secret or received is None:
        return False
    return hmac.compare_digest(received.encode("latin-1"), secret.encode("utf-8"))
```

## Common Gotchas

- **Compare the whole value.** If the header is `Bearer abc123`, the expected value is
  `Bearer abc123`. Stripping the prefix on one side only causes 401s.
- **Header names are case-insensitive.** Node lowercases them; Starlette and `Headers` match
  case-insensitively.
- **Equal-length buffers.** `crypto.timingSafeEqual` throws on unequal lengths: check lengths first
  (or hash both sides). In Python pass **bytes** to `hmac.compare_digest`; `str` raises
  `TypeError` on non-ASCII.
- **Fail closed.** If `QUICKBASE_WEBHOOK_SECRET` is unset, reject everything.
- **Not POST-only.** The method is chosen in the webhook (POST, GET, PUT, PATCH, DELETE). Authenticate
  every method, and expect `GET`/`DELETE` to have no body.
- **Raw body, any content type.** Read it raw (`express.raw({ type: '*/*' })`) and parse only after
  the credential check; the body may be XML, JSON or RAW text.
- **Proxies.** A proxy that strips or renames the header causes 401s.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `QUICKBASE_WEBHOOK_SECRET` unset, or differs from the webhook's header value |
| 401 with the right secret | Wrong `QUICKBASE_WEBHOOK_HEADER`, or `Bearer ` typed in Quickbase but not in the env var (or vice versa) |
| 401 after editing the webhook | Header value changed in Quickbase; update the env var |
| 405 | The webhook uses a method the route doesn't accept (or the Hookdeck source doesn't allow it) |
| Handler sees an empty body | `GET`/`DELETE` webhooks, or an empty message body template |
