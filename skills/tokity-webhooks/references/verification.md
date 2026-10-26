# How to Verify Tokity Webhook Signatures

## How It Works

Every Tokity webhook and Events action request carries one header:

```
x-dd-signature: sha256=<base64>
```

The value is `sha256=` followed by the **standard base64** (padded, 44 characters) of
`HMAC-SHA256(secret, raw request body)`:

- Key: the webhook's secret as **UTF-8 bytes**, used as-is (not hex- or base64-decoded).
- Message: the **raw body bytes** exactly as received. Nothing else is signed, so there is no
  timestamp, id or other header to include and **no replay window to check**.
- Tokity's reference code (C#) builds `$"sha256={Convert.ToBase64String(sha256Bytes)}"` and
  compares it to the header with an ordinal, case-sensitive string comparison.

Strip a leading `sha256=` if present. Accepting the bare digest as well is fine.

## Implementation

There is no SDK. Verification is an HMAC plus a constant-time comparison.

### Node.js (Express)

```javascript
const crypto = require('crypto');
const BASE64_SHA256 = /^[A-Za-z0-9+/]{43}=$/;

function verifyTokitySignature(rawBody, header, secret = process.env.TOKITY_WEBHOOK_SECRET) {
  if (!secret || typeof header !== 'string' || !Buffer.isBuffer(rawBody)) return false;
  const received = header.startsWith('sha256=') ? header.slice(7) : header;
  if (!BASE64_SHA256.test(received)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(received), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.post('/webhooks/tokity', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyTokitySignature(rawBody, req.headers['x-dd-signature'])) return res.status(401).end();
  const payload = JSON.parse(rawBody.toString('utf8')); // parse only after verifying
  // ...
});
```

### Next.js (App Router)

```typescript
export async function POST(request: NextRequest) {
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyTokitySignature(rawBody, request.headers.get('x-dd-signature'))) {
    return NextResponse.json({ error: 'Invalid or missing x-dd-signature' }, { status: 401 });
  }
  const payload = JSON.parse(rawBody.toString('utf8'));
  // ...
}
```

`verifyTokitySignature` is the same function as above, typed (see
`examples/nextjs/lib/verify-tokity.ts`).

### Python (FastAPI)

```python
import base64, hashlib, hmac, os, re

BASE64_SHA256 = re.compile(r"[A-Za-z0-9+/]{43}=")

def verify_tokity_signature(raw_body: bytes, header, secret=None) -> bool:
    secret = secret or os.environ.get("TOKITY_WEBHOOK_SECRET")
    if not secret or not isinstance(header, str):
        return False
    received = header.removeprefix("sha256=")
    if not BASE64_SHA256.fullmatch(received):
        return False
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(received.encode("ascii"), base64.b64encode(digest))
```

## Common Gotchas

- **Use the raw bytes.** Do not `JSON.parse` then `JSON.stringify`, decode to a string and
  re-encode, or let a body parser touch the body first. Whitespace, key order and non-ASCII
  characters all change the digest. Express needs `express.raw({ type: '*/*' })`; FastAPI needs
  `await request.body()`; Next.js needs `await request.arrayBuffer()`.
- **Compare the base64 text, don't decode it.** `Buffer.from(sig, 'base64')` silently drops bad
  characters, and a value whose last character carries stray low bits decodes to the same bytes
  but is rejected by Tokity's exact string comparison. Check the 44-character
  `[A-Za-z0-9+/]{43}=` shape, then compare strings in constant time.
- **Match lengths before `timingSafeEqual`.** It throws on unequal-length buffers. In Python use
  `hmac.compare_digest` on bytes, not `str`.
- **The secret is text.** Use it as shown in "Display detail". Do not base64- or hex-decode it.
- **One secret per webhook or event.** Each registration has its own; use the matching one for each route.
- **No timestamp is signed.** Do not invent a replay window from unsigned headers or body
  fields. Make handlers idempotent instead.
- **The prefix is lowercase `sha256=`.** The digest is base64, not hex.
- **After verifying, treat the body as untrusted.** Check types before reading nested fields.

## Debugging Verification Failures

1. Log the byte length of the body you verified and compare with `Content-Length`. A mismatch
   means something parsed or re-encoded it.
2. Confirm the secret is the one for **this** webhook or event (Admin Portal > Advanced >
   Webhook > Display detail), with no extra whitespace or quotes from `.env`.
3. Compute the digest by hand and compare:
   ```bash
   printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$TOKITY_WEBHOOK_SECRET" -binary | base64
   ```
4. Check the header: a request without `x-dd-signature` is not a signed Tokity webhook or event
   delivery, so reject it.
5. Behind a proxy or Hookdeck, make sure the body reaches your handler unmodified.
