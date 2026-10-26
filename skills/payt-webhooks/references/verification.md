# How to Verify Payt Webhook Signatures

## How It Works

Every request carries an `X-PAYT-SIGNATURE` header: the hex HMAC-SHA256 digest of the raw request body, keyed with
the webhook secret.

- Algorithm: HMAC-SHA256
- Header: `X-PAYT-SIGNATURE` (case-insensitive name), lowercase hex (64 characters), the whole value, no prefix
- Signed content: the raw request body bytes only. No timestamp, id or other header is signed.
- Key: the secret's UTF-8 bytes, as-is
- Secret: generated on the webhook settings page and shown once
- No timestamp is signed, so there is no replay window to check; don't invent one from unsigned fields

## Implementation

Payt's docs show a Node.js check that decodes both sides as hex and uses `timingSafeEqual`. There is no SDK helper,
so verify manually. These versions also check the header's format first (Node's `Buffer.from(x, 'hex')` silently
drops invalid characters) and compare in constant time.

### Node.js (Express)

```javascript
const crypto = require('crypto');
const FORMAT = /^[0-9a-fA-F]{64}$/;

function verifyPaytSignature(rawBody, signature, secret) {   // rawBody: Buffer
  if (!secret || typeof signature !== 'string' || !FORMAT.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signature.toLowerCase()), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

app.post('/webhooks/payt', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyPaytSignature(req.body, req.get('x-payt-signature'), process.env.PAYT_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid or missing signature' });
  }
  const { event } = JSON.parse(req.body.toString('utf8'));
  // handle event.event_name ...
  res.status(200).json({ received: true });
});
```

### Next.js (App Router)

```typescript
export async function POST(request: NextRequest) {
  const rawBody = Buffer.from(await request.arrayBuffer());
  if (!verifyPaytSignature(rawBody, request.headers.get('x-payt-signature'), process.env.PAYT_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Invalid or missing signature' }, { status: 401 });
  }
  const { event } = JSON.parse(rawBody.toString('utf8'));
  return NextResponse.json({ received: true });
}
```

### Python (FastAPI)

```python
import hashlib, hmac, re
FORMAT = re.compile(r"[0-9a-fA-F]{64}")

def verify_payt_signature(raw_body: bytes, signature, secret) -> bool:
    if not secret or not signature or not FORMAT.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature.lower().encode("ascii"), expected.encode("ascii"))

@app.post("/webhooks/payt")
async def payt_webhook(request: Request):
    raw_body = await request.body()
    if not verify_payt_signature(raw_body, request.headers.get("x-payt-signature"), os.getenv("PAYT_WEBHOOK_SECRET")):
        return JSONResponse({"error": "Invalid or missing signature"}, status_code=401)
    event = json.loads(raw_body)["event"]
    return {"received": True}
```

## Common Gotchas

- **Raw body.** Verify the bytes as received. Parsing and re-serialising changes whitespace and key order and breaks the signature. Use `express.raw({ type: '*/*' })`, `request.arrayBuffer()`, `request.body()`.
- **Hex is case-insensitive.** Lowercase the header before comparing (or decode both sides).
- **Whole value, no prefix.** There is no `sha256=` prefix and no list of signatures to split.
- **Constant-time compare on equal-length values.** `timingSafeEqual` throws on a length mismatch; check lengths first. In Python compare `bytes`, not `str`.
- **Secret shown once.** If you didn't save it, generate a new one on the settings page.
- **Rotation overlap.** For a short time both the old and the new secret can sign requests.

## Debugging Verification Failures

- `401` on every request: wrong secret, or the secret was copied with whitespace.
- `401` only on some requests: a body parser ran before verification, or you are in the secret rotation window.
- Works locally but not behind a proxy: check that nothing re-encodes or compresses the body before your handler.
- Compute the digest by hand: `printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$PAYT_WEBHOOK_SECRET"`.
