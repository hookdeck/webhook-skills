# How to Verify Treet Webhook Signatures

## How It Works

Treet signs the raw request body with HMAC-SHA256 and sends the result, base64-encoded, in the `X-Treet-Signature` header. Treet's docs show only a Node sample (`createHmac("sha256", secret).update(body, "utf8").digest("base64")`, compared to `req.get("X-Treet-Signature")`), so the details below come from that sample and from how Hookdeck's Treet source verifies.

| Item | Value |
|------|-------|
| Header | `X-Treet-Signature` |
| Algorithm | HMAC-SHA256 |
| Signed content | The raw request body bytes only (no timestamp, id or other header) |
| Key | The secret key as UTF-8 bytes, used as-is |
| Encoding | Standard base64, padded: 44 characters, `[A-Za-z0-9+/]{43}=` |
| Header value | The whole value is the digest: no prefix, no list |

Signing is opt-in. Treet support issues the secret on request; without it no signature header is sent.

## Implementation

Treet has no webhook SDK, so verification is manual.

### Node.js

```javascript
const crypto = require('crypto');

const SIGNATURE_RE = /^[A-Za-z0-9+/]{43}=$/;

function verifyTreetSignature(rawBody, signature, secret) {
  if (!secret) return false;
  if (typeof signature !== 'string' || !SIGNATURE_RE.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

### Python

```python
import base64, hashlib, hmac, re
from typing import Optional

SIGNATURE_RE = re.compile(r"^[A-Za-z0-9+/]{43}=$")

def verify_treet_signature(raw_body: bytes, signature: Optional[str], secret: Optional[str]) -> bool:
    if not secret or not signature or not SIGNATURE_RE.match(signature):
        return False
    expected = base64.b64encode(hmac.new(secret.encode(), raw_body, hashlib.sha256).digest())
    return hmac.compare_digest(signature.encode("ascii"), expected)
```

## Common Gotchas

- **Raw body, as bytes.** Don't decode to a string and re-encode, and never `JSON.parse`/`JSON.stringify` before verifying. Express: `express.raw({ type: '*/*' })`. Next.js: `await request.arrayBuffer()`. FastAPI: `await request.body()`.
- **Exact base64.** Hookdeck compares the base64 string exactly (case-sensitive). A value whose last character carries stray low bits decodes to the same bytes, so a decode-only check would accept something Hookdeck rejects. Validate the 44-character form and compare the strings.
- **Validate before decoding.** In Node, `Buffer.from(sig, 'base64')` silently drops bad characters. In Python use `hmac.compare_digest` on bytes (a `str` with non-ASCII characters raises).
- **Empty bodies.** A request with no body (such as a GET) is verified over zero bytes. Once verified, acknowledge it with `200` rather than failing JSON parsing.
- **No replay window.** No timestamp is signed, so don't invent one from unsigned headers or body fields. Make handlers idempotent instead.
- **Hookdeck.** Hookdeck's Treet source verifies the signature with these same rules (HMAC, `sha256`, header `x-treet-signature`, base64).

## Debugging Verification Failures

- **401 on every request:** check that Treet has issued a key and that `TREET_WEBHOOK_SECRET` is that exact string. Without a key, deliveries are unsigned.
- **Header missing:** the secret was never issued, or the sender is not Treet.
- **Header present but mismatch:** the body was parsed or re-serialized before hashing, a proxy changed it, or the key was decoded.
- **Test locally:** `printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$TREET_WEBHOOK_SECRET" -binary | base64`.
