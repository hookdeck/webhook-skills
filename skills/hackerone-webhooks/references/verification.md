# How to Verify HackerOne Webhook Signatures

## How Does HackerOne Sign Webhooks?

`X-H1-Signature` carries `sha256=<hex>`: the lowercase hex HMAC-SHA256 of the **raw request body**, keyed with the secret set on the webhook.

```
X-H1-Signature: sha256=bc3a344f9214bff0100b4dfc9eec47aa281935bfc0da0db1575ae7d4204eefe2
```

- Only the body is signed. No timestamp, delivery ID or other header is included, so there is no replay window to check. Do not invent one from unsigned headers or body fields.
- The part before `=` is always `sha256` for HackerOne requests. Strip a leading `sha256=`; also accept the bare digest.
- The key is the secret's UTF-8 bytes, used as-is (not hex- or base64-decoded).
- HackerOne provides no SDK for verification; this is a manual check.

Set a secret on the HackerOne webhook and paste it here. Without one, HackerOne signs with an empty key, which this source cannot verify.

If no secret is set, HackerOne still sends a signature, keyed with the empty string. Anyone can compute that, so it proves nothing. The examples treat an empty `HACKERONE_WEBHOOK_SECRET` as a configuration error and reject requests.

## Implementation

Steps: take the raw bytes, strip `sha256=`, require exactly 64 hex characters, compute the HMAC over the bytes, and compare in constant time. Never decode an unvalidated signature (`Buffer.from(sig, 'hex')` silently drops bad characters).

### Node.js (Express)

```javascript
const crypto = require('crypto');

function verifyHackerOne(rawBody, signatureHeader, secret) {
  if (!secret || !Buffer.isBuffer(rawBody) || typeof signatureHeader !== 'string') return false;
  let digest = signatureHeader.trim();
  if (digest.startsWith('sha256=')) digest = digest.slice('sha256='.length);
  if (!/^[0-9a-fA-F]{64}$/.test(digest)) return false;
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(rawBody).digest();
  const received = Buffer.from(digest.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

app.post('/webhooks/hackerone', express.raw({ type: '*/*' }), (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyHackerOne(raw, req.headers['x-h1-signature'], process.env.HACKERONE_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  // parse JSON only now; the event name is req.headers['x-h1-event']
});
```

### Next.js (App Router)

```typescript
import crypto from 'crypto';

export function verifyHackerOne(rawBody: Buffer, signatureHeader: string | null, secret?: string): boolean {
  if (!secret || !signatureHeader) return false;
  let digest = signatureHeader.trim();
  if (digest.startsWith('sha256=')) digest = digest.slice('sha256='.length);
  if (!/^[0-9a-fA-F]{64}$/.test(digest)) return false;
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(rawBody).digest();
  const received = Buffer.from(digest.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// in POST(request): const raw = Buffer.from(await request.arrayBuffer());
```

### Python (FastAPI)

```python
import hashlib, hmac, re

_HEX64 = re.compile(r"[0-9a-fA-F]{64}")

def verify_hackerone(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    if not secret or not signature_header:
        return False
    digest = signature_header.strip()
    if digest.startswith("sha256="):
        digest = digest[len("sha256="):]
    if not _HEX64.fullmatch(digest):  # fullmatch: "$" would allow a trailing newline
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(digest), expected)

# in the route: raw_body = await request.body()
```

## Common Gotchas

- **Raw bytes only.** Re-serialising parsed JSON changes whitespace and key order and breaks the signature. In Express use `express.raw({ type: '*/*' })`; in Next.js `request.arrayBuffer()`; in FastAPI `await request.body()`.
- **Don't decode the secret.** It is used as UTF-8 text.
- **Case.** Compare hex case-insensitively (lowercase both sides, or decode both to bytes).
- **No secret = no authenticity.** An empty-key signature is valid for anyone.
- **Event name.** It is in `X-H1-Event`, not in the body.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Always 401 | Secret mismatch, or the body was parsed before verifying |
| 401 only on some requests | A proxy re-encodes the body; verify the exact bytes received |
| Signature verifies with an empty key | No secret is set on the HackerOne webhook; set one |
| 500 "secret not configured" | `HACKERONE_WEBHOOK_SECRET` is unset in your environment |
