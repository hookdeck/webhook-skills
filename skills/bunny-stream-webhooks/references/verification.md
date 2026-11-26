# How to Verify Bunny Stream Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is publicly reachable, so anyone could POST a fake "encoding finished" payload. Verifying the `X-BunnyStream-Signature` proves the request came from Bunny and that the body was not tampered with in transit.

## How It Works

Bunny Stream signs each webhook with **HMAC-SHA256**:

- **Signed content:** the **exact raw HTTP request body bytes**, as received (not re-serialized JSON).
- **Key:** your video library's **Read-Only API key** (UTF-8 encoded).
- **Encoding:** lowercase **hex** (64 characters).
- **Header:** `X-BunnyStream-Signature`.

```
X-BunnyStream-Signature = hex( HMAC_SHA256( key = ReadOnlyApiKey, message = rawBody ) )
```

Each signed request also carries two headers naming the scheme:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-BunnyStream-Signature-Version` | `v1` | Signature scheme version |
| `X-BunnyStream-Signature-Algorithm` | `hmac-sha256` | Algorithm identifier |

Bunny's validation steps check both values before computing the digest, then compare against `X-BunnyStream-Signature`.

> **Not Standard Webhooks.** There are no `webhook-id` / `webhook-timestamp` / `webhook-signature` headers. The URL, method and headers aren't signed; the body, including its `EventId` and `Timestamp` fields, is.
>
> **Not Bunny (bunny.com).** That's an unrelated billing platform with its own webhook scheme. Bunny Stream is bunny.net's video product.

## Implementation

There is **no official Bunny SDK** for webhook verification (community SDKs only), so verify manually with your language's crypto library.

### Node.js

```javascript
const crypto = require('crypto');

function verifyBunnyStream(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    // Compare the decoded bytes so timingSafeEqual gets equal-length buffers
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false; // malformed hex or length mismatch
  }
}
```

`rawBody` must be the **raw bytes / string** of the request. In Express, use `express.raw({ type: 'application/json' })` so the body isn't parsed before verification. In Next.js App Router, use `await request.text()`.

### Python (FastAPI)

```python
import hmac, hashlib

def verify_bunny_stream(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header, expected)
```

Use `await request.body()` to get the raw bytes before parsing.

## Common Gotchas

- **Use the raw body, not parsed JSON.** Re-serializing (`JSON.stringify`/`json.dumps`) changes whitespace and key order, producing a different digest. Verify the untouched body.
- **The secret is the Read-Only API key**, not an AccessKey or a dashboard "webhook secret". Using the wrong key is the most common cause of failures.
- **Encoding is hex, not base64.** The signature is 64 lowercase hex characters.
- **Compare timing-safe.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`, and guard against length mismatches (a non-hex or wrong-length header should return `false`, not throw).
- **Header casing.** HTTP headers are case-insensitive; frameworks lowercase them (`x-bunnystream-signature`). Read it case-insensitively.

## Debugging Verification Failures

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Always `401`, even for real deliveries | Body parsed before verification | Read the raw body (`express.raw`, `request.text()`, `request.body()`) |
| Works locally, fails in production | Wrong secret (used AccessKey) | Set `BUNNY_STREAM_WEBHOOK_SECRET` to the library **Read-Only API key** |
| Intermittent failures | Re-serialized JSON | HMAC the raw body, never a re-stringified object |
| `timingSafeEqual` throws | Signature header not valid hex / wrong length | Wrap in try/catch and return `false` |
