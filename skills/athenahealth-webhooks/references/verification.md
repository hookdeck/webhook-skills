# How to Verify athenahealth Webhook Signatures

## How Does athenahealth Sign Webhooks?

athenahealth uses WebSub content signing ([W3C WebSub](https://www.w3.org/TR/websub/#signing-content)). Every notification for a subscription created with an `X-Hub-Secret` carries:

```
X-Hub-Signature: sha256=<hex digest>
```

The digest is HMAC-SHA256 of the **raw request body**, keyed with the `X-Hub-Secret` value you chose when you created the Subscription. Only the body is signed: no timestamp, no message ID. If no secret was set, the header is absent and notifications are unsigned.

athenahealth states that the method "may change from `sha256` in future" and receivers should check the method in the header. The examples require the `sha256=` prefix and reject any other method, so a future method change would fail verification until you add support for it.

## Implementation

athenahealth publishes no SDK helper for this, so verification is manual in all frameworks.

### Node.js

```javascript
const crypto = require('crypto');

function verify(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret || !signatureHeader.startsWith('sha256=')) return false;
  const sig = signatureHeader.slice('sha256='.length);
  // Validate hex first: Buffer.from(x, 'hex') silently truncates at the first invalid character
  if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig.toLowerCase()), Buffer.from(expected));
}
```

Both sides are 64 ASCII characters, so the Buffers always have equal length and `timingSafeEqual` cannot throw.

### Python

```python
import hmac, hashlib

def verify(raw_body: bytes, signature_header: str, secret: str) -> bool:
    method, _, sig = (signature_header or "").partition("=")
    if method != "sha256" or not sig:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig.lower().encode(), expected.encode())
```

## Common Gotchas

- **Use the raw body.** Parsing JSON and re-serializing changes bytes. In Express use `express.raw({ type: '*/*' })` (not `express.json()`); in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **Don't depend on Content-Type.** Notifications are FHIR JSON (`application/fhir+json` is the configured payload type), which `express.json()` does not match by default. `express.raw({ type: 'application/json' })` would skip other content types and leave `req.body` unparsed; `'*/*'` always yields a Buffer.
- **Check the method.** Reject anything that is not `sha256=`; split the prefix off before comparing.
- **Validate hex before `Buffer.from(x, 'hex')`.** Invalid hex is silently truncated rather than rejected. The examples check `/^[0-9a-f]{64}$/i` and compare the lowercase hex strings as UTF-8 Buffers.
- **In Python compare bytes.** `hmac.compare_digest` raises `TypeError` for non-ASCII `str` arguments, which would turn a bad header into a 500. Encode both sides.
- **The secret is yours.** It is the `X-Hub-Secret` you sent when creating the Subscription, per subscription. Subscriptions are per topic and per practice, so either reuse one secret across them or send each subscription to its own endpoint path.
- **No timestamp.** There is no replay protection in the signature; dedupe on `notificationEvent[].id`.
- **Unsigned when no secret was set.** An endpoint that requires a signature will reject those notifications, as intended.

## Debugging Verification Failures

- 401 on every request: wrong `ATHENAHEALTH_WEBHOOK_SECRET` (it must equal the `X-Hub-Secret` sent when creating or last updating the Subscription; no quotes or trailing whitespace).
- 401 with no `X-Hub-Signature` header on the request: the Subscription was created without `X-Hub-Secret`, or a proxy stripped the header. Update the Subscription with `PUT` and a secret.
- 401 and the header starts with something other than `sha256=`: athenahealth changed the signing method. Add support for the new method.
- Works for some subscriptions only: they were created with different secrets.
- Intermittent failures: a middleware (JSON parser, proxy) is altering the body before verification.
