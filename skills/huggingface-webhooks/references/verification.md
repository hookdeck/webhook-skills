# Hugging Face Webhook Secret Verification

## How It Works

Hugging Face uses a **shared-secret token**, not HMAC signing:

1. You set a secret when configuring the webhook.
2. Hugging Face sends that secret **verbatim** in the `X-Webhook-Secret` HTTP header on every request.
3. Your application compares the header value with your stored secret using a timing-safe comparison.

The secret can alternatively be sent as a `?secret=XXX` query parameter on the handler URL — useful when reading HTTP headers is difficult in your environment.

This is different from signature-based verification (GitHub, Stripe, Shopify): there is no HMAC, no timestamp, no signed digest. The header is the secret itself.

## Implementation

### JavaScript (Node.js)

```javascript
const crypto = require('crypto');

function verifyHuggingFaceWebhook(secretHeader, secret) {
  if (!secretHeader || !secret) {
    return false;
  }

  // Hugging Face sends the secret verbatim — compare directly,
  // but use timing-safe comparison to prevent timing attacks.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(secretHeader),
      Buffer.from(secret)
    );
  } catch {
    // Buffers must be same length for timingSafeEqual
    return false;
  }
}

// Usage in Express
app.post('/webhooks/huggingface', express.json(), (req, res) => {
  // Accept header OR ?secret= query parameter (header takes precedence)
  const secretHeader = req.headers['x-webhook-secret'] || req.query.secret;

  if (!verifyHuggingFaceWebhook(secretHeader, process.env.HUGGINGFACE_WEBHOOK_SECRET)) {
    return res.status(401).send('Unauthorized');
  }

  // Process webhook…
});
```

### Python

```python
import secrets

def verify_huggingface_webhook(secret_header: str | None, secret: str | None) -> bool:
    if not secret_header or not secret:
        return False

    # Hugging Face sends the secret verbatim — timing-safe comparison.
    return secrets.compare_digest(secret_header, secret)

# Usage in FastAPI
from fastapi import Header, Request, HTTPException

@app.post("/webhooks/huggingface")
async def handle(
    request: Request,
    x_webhook_secret: str | None = Header(None),
):
    expected = os.getenv("HUGGINGFACE_WEBHOOK_SECRET")
    # Header first, then fall back to ?secret= query parameter
    provided = x_webhook_secret or request.query_params.get("secret")

    if not verify_huggingface_webhook(provided, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
```

## Common Gotchas

### 1. It's a shared secret, not HMAC

Don't try to compute an HMAC of the raw body. The `X-Webhook-Secret` header contains the literal secret string. Compare it byte-for-byte with timing-safe comparison.

### 2. Header name casing

Different frameworks normalize header names differently. Node.js / Express lowercase headers:

```javascript
req.headers['x-webhook-secret']   // ✓
req.headers['X-Webhook-Secret']   // ✗ may be undefined
```

In FastAPI, the parameter name `x_webhook_secret` automatically maps to the `X-Webhook-Secret` header.

### 3. Query parameter fallback

Hugging Face supports `?secret=XXX` as an alternative to the header. If you accept both, **verify whichever is present with the same timing-safe comparison** — don't trust one over the other implicitly:

```javascript
const secretHeader = req.headers['x-webhook-secret'] || req.query.secret;
```

### 4. ASCII only

Hugging Face only supports ASCII secrets. Generate with `openssl rand -hex 32` to be safe (hex output is ASCII).

### 5. Use raw body? Not for verification

Because there's no signature over the body, you don't need the raw body to verify Hugging Face webhooks — parsed JSON is fine. (You still need the raw body for signature-based providers like GitHub or Stripe; that gotcha doesn't apply here.)

## Security Best Practices

1. **Strong secrets** — use a cryptographically random value (`openssl rand -hex 32`).
2. **Timing-safe comparison** — never use `===` / `==` to compare secrets.
   - ✓ `crypto.timingSafeEqual()` (Node.js)
   - ✓ `secrets.compare_digest()` (Python)
3. **HTTPS only** — the secret travels in cleartext over the wire; TLS is non-negotiable.
4. **Prefer the header** — query strings can leak through logs, proxies, and browser history. Use the header in production unless you can't.
5. **Fail closed** — return 401 on any verification failure, including missing headers.
6. **Rotate** — update both the Hugging Face setting and your env var together when rotating.

## Debugging Verification Failures

### 1. Inspect the request

```javascript
console.log('Headers:', req.headers);
console.log('Secret header:', req.headers['x-webhook-secret']);
console.log('Query secret:', req.query.secret);
```

### 2. Check the env var has no whitespace

```bash
node -e "console.log(JSON.stringify(process.env.HUGGINGFACE_WEBHOOK_SECRET))"
```

A trailing newline in `.env` is the most common cause of 401s.

### 3. Test with curl

```bash
curl -X POST http://localhost:3000/webhooks/huggingface \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: your_secret_value" \
  -d '{"event":{"action":"update","scope":"repo.content"},"repo":{"type":"model","name":"u/r","id":"x","private":false,"url":{"web":"","api":""},"headSha":"abc","owner":{"id":"o"}},"updatedRefs":[],"webhook":{"id":"w","version":3}}'
```

### 4. Use the Activity tab

Hugging Face logs every delivery in **Settings → Webhooks → Activity** with the full request/response. Use **Replay** to retry against your current endpoint after fixing a bug.

## No SDK Required

Hugging Face does not ship a webhook-verification SDK because the scheme is trivially simple: it's a constant-time string compare. The built-in `crypto.timingSafeEqual` (Node.js) or `secrets.compare_digest` (Python) is all you need.
