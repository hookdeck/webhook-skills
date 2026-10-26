# How to Verify Violet Webhook Signatures

## How Does Violet Sign Webhooks?

Every delivery carries an `X-Violet-Hmac` header:

```
X-Violet-Hmac: X6+KKoN/xePC3yN6i+DVbDza3JqoasnMNDX1dz2c5fA=
```

- Algorithm: HMAC-SHA256
- Key: your Violet **app secret** as UTF-8 bytes (not hex- or base64-decoded)
- Signed content: the **raw request body bytes** only. No timestamp, event id or header is signed
- Encoding: standard base64 with padding, always 44 characters (`[A-Za-z0-9+/]{43}=`), no prefix

Because no timestamp is signed, there is no replay window to enforce. Don't invent one from unsigned headers or body fields; use `X-Violet-Event-Id` for idempotency instead.

## Implementation

Violet doesn't ship a verification SDK; its docs show the computation with `crypto-js`, Java and Python standard libraries. Use the standard library of your framework.

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyVioletSignature(rawBody, header, secret) {
  if (typeof header !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(header)) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('base64'));
  const received = Buffer.from(header);
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

`rawBody` must be a `Buffer` of the bytes as received: `express.raw({ type: '*/*' })` in Express, `Buffer.from(await request.arrayBuffer())` in Next.js.

### Python (FastAPI)

```python
import base64, hashlib, hmac, re

def verify_violet_signature(raw_body: bytes, header: str | None, secret: str) -> bool:
    if not header or not re.fullmatch(r"[A-Za-z0-9+/]{43}=", header, re.ASCII):
        return False
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(header.encode("ascii"), base64.b64encode(digest))
```

`raw_body` comes from `await request.body()`.

## Common Gotchas

- **Use the raw bytes.** Don't decode to a string and re-encode, and never `JSON.parse`/`JSON.stringify` the body before verifying: whitespace and key order must match exactly
- **The secret is text.** The app secret looks like hex (`3c989fdb...`) but is the HMAC key as UTF-8, not decoded bytes
- **Validate the format before decoding.** `Buffer.from(sig, 'base64')` silently drops invalid characters, so check length and alphabet first
- **Compare the base64 string exactly.** The last base64 character carries two unused bits; a value that differs only there decodes to the same digest but isn't what Violet sent. Hookdeck's Violet source compares the string exactly, so the skill does too
- **Respond 401** for a missing, malformed or mismatched signature, and answer quickly: Violet needs a 2XX within 10 seconds
- **Name the event from the header.** The body has no event field, so read `X-Violet-Topic`

## How Does Hookdeck Verify Violet Webhooks?

When Violet sends through Hookdeck, Hookdeck's `Violet` source verifies the signature for you (HMAC-SHA256, base64, header `x-violet-hmac`) using the same app secret. Your own endpoint can then rely on Hookdeck's verification, or keep verifying as shown above.

## How to Debug Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong secret (use the app secret, not an API token) or the secret was hex-decoded |
| Fails only for some events | Body was parsed or re-serialised before verifying |
| Fails for bodies with non-ASCII text | Body decoded as a string with another charset: verify the bytes |
| Header looks fine but fails | Proxy or middleware changed the body (compression, re-encoding) |
| `Buffer.timingSafeEqual` throws | Compared buffers of different lengths: check length first |
