# How to Verify LoyaltyLion Webhook Signatures

## How It Works

Every webhook carries an `x-loyaltylion-hmac-sha256` header: the base64 encoded SHA-256 HMAC of the raw JSON
request body, keyed with the secret.

- Algorithm: HMAC-SHA256
- Header: `x-loyaltylion-hmac-sha256`, standard padded base64 (44 characters), the whole value, no prefix
- Signed content: the raw request body bytes only. No timestamp, id or other header is signed.
- Key: the secret's UTF-8 bytes, as-is
- Secret: Paste the OAuth client secret for webhooks registered with an OAuth client, or your site secret for other webhooks.
- No timestamp is signed, so there is no replay window to check. Dedupe on the body's `id` instead.

## Implementation

LoyaltyLion's docs show the TypeScript, Ruby and PHP checks; they all compute the base64 digest and compare it
to the header. There is no SDK helper for webhook verification, so verify manually. These versions also check
the header's format first and compare in constant time.

### Node.js (Express)

```javascript
const crypto = require('crypto');
const FORMAT = /^[A-Za-z0-9+/]{43}=$/;

function verifyLoyaltyLionSignature(rawBody, signature, secret) {   // rawBody: Buffer
  if (!secret || typeof signature !== 'string' || !FORMAT.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(signature), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.post('/webhooks/loyaltylion', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyLoyaltyLionSignature(req.body, req.get('x-loyaltylion-hmac-sha256'), process.env.LOYALTYLION_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid or missing signature' });
  }
  const body = JSON.parse(req.body.toString('utf8'));
  // handle body.topic ...
  res.status(200).json({ received: true });
});
```

### Python (FastAPI)

```python
import base64, hashlib, hmac, re
from typing import Optional
FORMAT = re.compile(r"[A-Za-z0-9+/]{43}=")

def verify_loyaltylion_signature(raw_body: bytes, signature: Optional[str], secret: Optional[str]) -> bool:
    if not secret or not signature or not FORMAT.fullmatch(signature):
        return False
    expected = base64.b64encode(hmac.new(secret.encode(), raw_body, hashlib.sha256).digest())
    return hmac.compare_digest(signature.encode("ascii"), expected)

@app.post("/webhooks/loyaltylion")
async def webhook(request: Request):
    raw_body = await request.body()
    if not verify_loyaltylion_signature(raw_body, request.headers.get("x-loyaltylion-hmac-sha256"), os.getenv("LOYALTYLION_WEBHOOK_SECRET")):
        return JSONResponse({"error": "Invalid or missing signature"}, status_code=401)
    ...
```

### Next.js (App Router)

```typescript
export async function POST(request: NextRequest) {
  const rawBody = Buffer.from(await request.arrayBuffer());   // exact bytes, before any parsing
  if (!verifyLoyaltyLionSignature(rawBody, request.headers.get('x-loyaltylion-hmac-sha256'), process.env.LOYALTYLION_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid or missing signature' }, { status: 401 });
  }
  const body = JSON.parse(rawBody.toString('utf8'));
  return NextResponse.json({ received: true });
}
```

`verifyLoyaltyLionSignature` for TypeScript is in [examples/nextjs/lib/verify-loyaltylion.ts](../examples/nextjs/lib/verify-loyaltylion.ts).

## Common Gotchas

- **Use the raw body.** `JSON.parse` then `JSON.stringify` (or a body parser that re-serialises, or pretty-printing) changes the bytes and breaks the signature. In Express use `express.raw({ type: '*/*' })`, not `express.json()`.
- **Don't decode the signature to compare.** A base64 value whose last character has stray low bits decodes to the same bytes, but it is a different string and Hookdeck rejects it, so reject it too. Check the 44-character format, then compare strings.
- **Base64, not hex.** A hex digest never matches. Compare case-sensitively.
- **Two secrets.** Which secret signs depends on how the webhook was registered: the OAuth client secret for webhooks registered with an OAuth client, otherwise the site secret. Using the wrong one is the usual cause of failures.
- **Use the secret as-is.** It is not hex- or base64-decoded.
- **`rewards/store_fulfilment`** goes to a custom reward's own URL and has no envelope or `topic`. The docs don't separately describe its signature; run the same check on it.

## Debugging Verification Failures

1. Log the raw body length and the header value; a 44-character base64 string ending in `=` is expected.
2. Recompute the digest from the raw bytes with the secret you think signed it. If it matches the header, your code path is changing the body; if not, you have the wrong secret (OAuth client secret vs site secret).
3. Check for middleware that parses the body before your route runs.
4. Check that the secret has no stray whitespace or newline (common in `.env` files).
