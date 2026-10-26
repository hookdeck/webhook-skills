# How to Verify Teamwork Webhook Signatures

## How It Works

For Version 2 webhooks with a token, Teamwork computes `HMAC-SHA256(token, body)` over the body of the HTTP POST and sends the **lowercase hex** digest in the `X-Projects-Signature` header. The token is used as UTF-8 bytes. There is no prefix, no timestamp and no signed ID.

Teamwork's reference implementation (Go):

```go
func generateSignature(data string, token string) (string, error) {
    sig := hmac.New(sha256.New, []byte(token))
    if _, err := sig.Write([]byte(data)); err != nil {
        return "", err
    }
    return hex.EncodeToString(sig.Sum(nil)), nil
}
```

## Implementation

There is no official verification SDK, so verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyTeamworkWebhook(rawBody, signature, token) {
  if (!signature || !token || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', token).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}
```

Alternative: compare lowercase hex strings as equal-length UTF-8 Buffers with `crypto.timingSafeEqual` after a length check.

### Python

```python
import hmac, hashlib

def verify_teamwork_webhook(raw_body: bytes, signature: str | None, token: str | None) -> bool:
    if not signature or not token:
        return False
    expected = hmac.new(token.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature.lower().encode("utf-8"), expected.encode("utf-8"))
```

## Common Gotchas

- **No token, no signature.** The token is optional. If the webhook is Version 1 or has no token, the header is absent.
- **Validate hex before decoding.** `Buffer.from('zz...', 'hex')` silently truncates invalid input, which can produce a shorter buffer and a thrown length error or a wrong comparison. Check `/^[0-9a-f]{64}$/i` first.
- **Compare bytes in Python.** `hmac.compare_digest` raises `TypeError` for non-ASCII `str` arguments, turning a bad header into a 500. Encode both sides.
- **Raw body.** Use `express.raw({ type: '*/*' })` so any content type is captured as a Buffer. Don't re-serialize parsed JSON.
- **Event name is in a header.** `X-Projects-Event`, not in the body.
- **No timestamp.** There's nothing to check for replay protection; use idempotency.

## Debugging Verification Failures

- Confirm the webhook is Version 2 and has a token set.
- Confirm the env var matches the token exactly (no whitespace).
- Print the raw body length and compare with Teamwork's delivery log.
- Return `401` for failures during development so they're easy to spot.
