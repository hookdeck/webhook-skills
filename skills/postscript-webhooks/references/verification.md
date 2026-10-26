# How to Verify Postscript Webhook Requests

## Is Postscript-Signature an HMAC?

No. Despite the name, `Postscript-Signature` is not a signature of the body. It carries the
account's fixed webhook signing token as plain text. The
[Get Webhook Signing Token](https://developers.postscript.io/reference/get-webhook-signing-token)
docs say the token is a fixed MD5 hash that "can be compared to the Postscript-Signature request
header". Compare the whole header value with the token you fetched. If the header is missing or
the values differ, treat the request as suspicious and return `401`.

```
Postscript-Signature: <value from GET /api/v2/webhooks/token>
```

## What This Does and Doesn't Protect

A static shared credential authenticates the **sender**, not the **body**. It gives **no replay
protection** (no signature, no timestamp): anyone who captures one request can resend it, and a
tampered body carries the same header. So:

- Accept webhooks over HTTPS only.
- Guard the token: the docs describe it as fixed and document no way to rotate it. For a secret
  you control, add an optional `headers` object when creating the subscription; Postscript sends
  those key:value pairs as headers on every callback.
- Make handling idempotent. Payloads have no documented event id. `webhook_id` appears to be the subscription's id (same UUID form as the subscription `id`), so it repeats across events: don't dedupe on it. Use `event_data.id` where the event has one (e.g. `im_...` on `shop.incoming_message`), or `event` + `resource_id` + `event_time`.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyPostscriptRequest(headers, token = process.env.POSTSCRIPT_WEBHOOK_TOKEN) {
  if (!token) return false;
  const received = headers['postscript-signature'];
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hmac, os

def verify_postscript_request(headers, token=None) -> bool:
    token = token if token is not None else os.environ.get("POSTSCRIPT_WEBHOOK_TOKEN")
    received = headers.get("postscript-signature")
    if not token or not received:
        return False
    # Encode both sides: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(received.encode("utf-8"), token.encode("utf-8"))
```

## Common Gotchas

- **Not an HMAC.** Don't compute a digest of the body and compare it; compare the header to the token.
- **Compare the whole value.** No prefix, no `v1=` parsing, no timestamp.
- **Constant-time compare.** Check lengths before `timingSafeEqual` (it throws on unequal lengths);
  in Python use `hmac.compare_digest` on bytes, never on `str`.
- **Fail closed.** If `POSTSCRIPT_WEBHOOK_TOKEN` is unset, reject everything.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the token check.
- **Token is per account.** Serving several shops from separate Postscript accounts means one token each.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `POSTSCRIPT_WEBHOOK_TOKEN` unset, or copied from a different account |
| 401 behind a proxy | The proxy strips or renames `Postscript-Signature` |
| 401 with trailing whitespace | Token pasted with a newline; trim it |
| 400 after authentication | Body isn't a JSON object |
