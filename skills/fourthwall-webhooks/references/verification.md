# How to Verify Fourthwall Webhook Signatures

## How It Works

Fourthwall computes an HMAC-SHA256 over the entire raw request body, keyed with your shop's secret key, and sends the base64-encoded digest in the `X-Fourthwall-Hmac-SHA256` header:

```
base64( HMAC-SHA256(key = secret key as UTF-8, message = raw request body) )
```

There is no timestamp, no signed-content prefix, and no `v1=`-style header format. The header value is the bare base64 string.

| Item | Value |
|------|-------|
| Header | `X-Fourthwall-Hmac-SHA256` (platform apps: `X-Fourthwall-Hmac-Apps-SHA256`) |
| Algorithm | HMAC-SHA256 |
| Encoding | base64 |
| Signed content | The raw request body |
| Key | Shop secret key (UUID-like string) used as UTF-8 text |
| Official SDK | None for verification, so verify manually |

## Implementation

### Node.js (Express)

```javascript
const crypto = require('crypto');

function verifyFourthwallSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

// express.raw with '*/*' gives a Buffer whatever Content-Type is sent
app.post('/webhooks/fourthwall', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.get('X-Fourthwall-Hmac-SHA256');
  if (!verifyFourthwallSignature(req.body, signature, process.env.FOURTHWALL_WEBHOOK_SECRET)) {
    return res.status(400).send('Invalid signature');
  }
  const event = JSON.parse(req.body.toString('utf8'));
  // dispatch on event.type
  res.sendStatus(200);
});
```

### Next.js (App Router)

```typescript
const rawBody = await request.text();           // raw body, before any JSON parsing
const signature = request.headers.get('x-fourthwall-hmac-sha256');
```

Then run the same HMAC and compare as above. See [examples/nextjs/](../examples/nextjs/).

### Python (FastAPI)

```python
import base64, hashlib, hmac

def verify_fourthwall_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header:
        return False
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode("utf-8")
    return hmac.compare_digest(expected, signature_header)
```

## Common Gotchas

- **Use the raw body.** Parsing and re-serializing JSON changes whitespace and key order and breaks the signature. In Express use `express.raw({ type: '*/*' })`, not `express.json()`.
- **Do not match on Content-Type.** A raw parser limited to `application/json` skips bodies with another content type and leaves `req.body` unset. Use `*/*`.
- **The key is the secret key as plain text.** It is a UUID-like string; do not decode it as hex or base64.
- **Base64, not hex.** Comparing a hex digest never matches.
- **Shop vs app webhooks.** Platform App webhooks use `X-Fourthwall-Hmac-Apps-SHA256` and the app's HMAC key. A shop secret will not verify app webhooks, and the reverse.
- **No replay protection built in.** The signature has no timestamp, so deduplicate on the event `id` (delivery is at-least-once).
- **Header names are case-insensitive** in HTTP; frameworks often lowercase them (`x-fourthwall-hmac-sha256`).
- **Length mismatch.** `crypto.timingSafeEqual` throws when buffers differ in length; catch it and treat it as invalid.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always invalid | Body was parsed or re-encoded before verification |
| Always invalid | Wrong secret (copied from a different shop, or an app HMAC key) |
| Always invalid | Comparing against the wrong header (`X-Fourthwall-Hmac-Apps-SHA256` for an app webhook) |
| `req.body` is `{}` or undefined | Raw parser did not match the content type; use `type: '*/*'` |
| Works locally, fails behind a proxy | Proxy altered the body (compression, re-encoding); verify against the exact bytes received |

To debug, compute the digest yourself:

```bash
printf '%s' '{"id":"weve_test"}' | openssl dgst -sha256 -hmac "$FOURTHWALL_WEBHOOK_SECRET" -binary | base64
```

Compare it with the header on a test delivery from **Send test notification**.
