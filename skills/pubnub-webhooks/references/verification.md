# How to Verify PubNub Webhook Requests

## How Does PubNub Authenticate Webhooks?

It doesn't sign them. A Webhook action sends no signature header and no timestamp. The only
authentication is a **custom header you add to the action**, whose value comes from a keyset
secret. Your endpoint checks that header on every request.

```
Authorization: Bearer your-shared-secret      # header name and value are yours to choose
```

A static shared credential **authenticates the sender, not the body**, and gives **no replay
protection** (no signature, no timestamp). Anyone who captures one request can resend it. Use
HTTPS, keep the secret out of logs, rotate it if it leaks, and dedupe on the event `id` or
`timetoken` if duplicate processing matters.

## Implementation

The header name comes from `PUBNUB_WEBHOOK_HEADER` (default `Authorization`) and the expected
value from `PUBNUB_WEBHOOK_SECRET`: the exact, whole header value, including any `Bearer ` prefix
you typed. Look the header up case-insensitively and compare the whole value. Do not strip or
parse a `Bearer ` prefix.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyPubNubRequest(headers, secret = process.env.PUBNUB_WEBHOOK_SECRET,
                             name = process.env.PUBNUB_WEBHOOK_HEADER || 'Authorization') {
  if (!secret) return false;
  const received = headers[name.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}
```

### Python

```python
import hmac, os

def safe_equal(a: str, b: str) -> bool:
    # bytes, never str: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))

def verify_pubnub_request(headers, secret=None, header_name=None) -> bool:
    secret = secret if secret is not None else os.environ.get("PUBNUB_WEBHOOK_SECRET")
    if not secret:
        return False
    name = header_name or os.environ.get("PUBNUB_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(name)  # Starlette/Flask headers are case-insensitive
    return bool(received) and safe_equal(received, secret)
```

## Event Type From `dataSchema`

After the header check passes, parse the JSON and derive the type from `dataSchema`:
`pubnub.com/schemas/events/messages.pubsub.publish?v=1.0.0` becomes `messages.pubsub.publish`
(drop the `pubnub.com/schemas/events/` prefix and the `?v=...` suffix). Compare it as an exact string.

## Common Gotchas

- **Compare the whole value.** If you configured `Bearer abc123`, the expected value is
  `Bearer abc123`, not `abc123`.
- **Header name is yours.** There is no fixed PubNub header. Match `PUBNUB_WEBHOOK_HEADER`
  case-insensitively.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which
  throws on unequal lengths. In Python use `compare_digest` on bytes.
- **Fail closed.** If `PUBNUB_WEBHOOK_SECRET` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the header check.
- **Enveloped payloads.** With **Is Enveloped** on, the layout differs (`schema` rather than
  `dataSchema`), so the type lookup returns nothing. Turn it off.
- **Don't use the legacy Keysets webhooks.** They have no auth option.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `PUBNUB_WEBHOOK_SECRET` unset, or the action has no custom header |
| 401 with the right secret | Prefix mismatch (`Bearer ` configured but not in the env var), or wrong header name |
| 401 only behind a proxy | The proxy strips or renames the header |
| 400 after authentication | Body isn't a No Envelope payload (enveloped, or batched) |
