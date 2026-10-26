# How to Verify Texture Webhook Signatures

## How It Works

Texture computes an HMAC-SHA256 over the request body using the destination's `secret` and
sends the lowercase hex digest in the `Texture-Signature` header.

| Item | Value |
|------|-------|
| Header | `Texture-Signature` (lowercase `texture-signature` in Express, Next.js and FastAPI) |
| Algorithm | HMAC-SHA256 |
| Encoding | Hex, 64 characters, no prefix |
| Signed content | The raw request body bytes only |
| Key | The secret's UTF-8 bytes, as-is (whole string, `whsec_` included) |
| Timestamp | `Texture-Timestamp` is sent but **not** signed |

There is no official verification SDK. Standard Webhooks and Svix libraries do not apply: the
secret only looks like a Standard Webhooks one.

## Implementation

### Node.js (Express)

```javascript
const crypto = require('crypto');

function verifyTextureSignature(rawBody, signature, secret) {
  if (!secret || typeof signature !== 'string') return false;
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false; // exact length and alphabet
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return crypto.timingSafeEqual(expected, received); // both are 32 bytes
}

app.post('/webhooks/texture', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyTextureSignature(req.body, req.headers['texture-signature'], process.env.TEXTURE_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  const event = JSON.parse(req.body.toString('utf8')); // parse after verifying
  // ...
});
```

### Next.js (App Router)

```typescript
import crypto from 'crypto';

export function verifyTextureSignature(rawBody: Buffer, signature: string | null, secret: string | undefined): boolean {
  if (!secret || !signature || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature.toLowerCase(), 'hex'));
}

// in the route handler:
const rawBody = Buffer.from(await request.arrayBuffer());
```

### Python (FastAPI)

```python
import hashlib, hmac, re

_HEX64 = re.compile(r"[0-9a-fA-F]{64}")

def verify_texture_signature(raw_body: bytes, signature: str | None, secret: str | None) -> bool:
    if not secret or not signature or not _HEX64.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # compare bytes, not str: compare_digest raises on non-ASCII str
    return hmac.compare_digest(expected.encode("ascii"), signature.lower().encode("ascii"))

# in the route:  raw_body = await request.body()
```

## Common Gotchas

- **Raw body, not re-serialized JSON.** Texture's docs sample hashes `JSON.stringify(payload)`,
  but also say to use the raw payload because order and whitespace matter. Verify the bytes you
  received; `JSON.parse` then `JSON.stringify` can change them and the check will fail.
- **Don't strip `whsec_`.** It is part of the key. A key without the prefix gives a different digest.
- **Don't base64-decode the secret.** That's Standard Webhooks behavior, not Texture's.
- **Header case.** Texture sends `Texture-Signature`; Express and Fastify lowercase it.
- **Validate before decoding.** `Buffer.from(sig, 'hex')` silently drops bad characters, so check
  64 hex characters first. Hex is compared case-insensitively.
- **Redacted payloads.** The signature covers the redacted body you receive, not the stored event.
- **No replay protection from the signature.** `Texture-Timestamp` is not signed, so don't treat
  it as authenticated. Dedupe on the event `key` instead.

## Debugging Verification Failures

1. Log the byte length of the raw body and compare it with the sender's `Content-Length`.
2. Confirm the secret is the whole destination `secret`, with no whitespace or quotes.
3. Check no middleware (`express.json()`, a body-parsing proxy) ran before the raw read.
4. Recompute with the secret and body from the request log (`openssl dgst -sha256 -hmac "$SECRET" body.json`)
   and compare with the header.
5. If the destination has `redactCategories`, verify against the received body, not a stored copy.
