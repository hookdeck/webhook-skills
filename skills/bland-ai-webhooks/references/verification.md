# How to Verify Bland AI Webhook Signatures

## How It Works

Bland computes an HMAC with SHA-256 over the request body, keyed with your account webhook signing secret, and sends the lowercase hex digest in the `X-Webhook-Signature` header.

| Item | Value |
|------|-------|
| Header | `X-Webhook-Signature` |
| Algorithm | HMAC-SHA256 |
| Encoding | Hex |
| Signed content | The request body (no timestamp, no message id) |
| Key | The signing secret, used as-is (Dev Portal → Account Settings → Keys → Replace Secret) |
| Standard Webhooks? | No (`webhook-id` / `webhook-timestamp` headers are not used) |

Bland's docs only show Node.js and sign `JSON.stringify(req.body)`. Use the raw body bytes instead. For the compact JSON Bland sends the two are identical, but the raw body doesn't depend on how your framework re-serialises.

## Implementation

Bland ships no webhook-verification SDK, so verify manually.

### Node.js (Express)

```javascript
const crypto = require('crypto');

function verifyBlandSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature.trim().toLowerCase()), Buffer.from(expected));
  } catch {
    return false; // length mismatch
  }
}

app.post('/webhooks/bland-ai', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyBlandSignature(req.body, req.get('x-webhook-signature'), process.env.BLAND_WEBHOOK_SECRET)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }
  const payload = JSON.parse(req.body.toString('utf8'));
  res.json({ received: true });
});
```

### Next.js (App Router)

```typescript
const rawBody = await request.text(); // not request.json()
const ok = verifyBlandSignature(rawBody, request.headers.get('x-webhook-signature'), process.env.BLAND_WEBHOOK_SECRET);
```

### Python (FastAPI)

```python
import hashlib, hmac

raw_body = await request.body()
expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
valid = hmac.compare_digest(signature.strip().lower().encode(), expected.encode())
```

## Common Gotchas

- **Use the raw body.** `express.raw({ type: '*/*' })` gives bytes for any content type; `express.json()` first can break the match. In Next.js use `request.text()`, in FastAPI `await request.body()`.
- **No timestamp.** There is nothing to check for freshness, so a captured delivery can be replayed. Dedupe on `call_id` + `event_type`.
- **One secret for the account.** Every webhook on the account is signed with the same key, and it is only shown when you click Replace Secret.
- **Create the secret first.** Bland's docs require a signing secret to exist before you can verify. Fail closed (500) when `BLAND_WEBHOOK_SECRET` is unset instead of skipping verification.
- **Compare in constant time,** and guard for length mismatches (`timingSafeEqual` throws on different lengths).
- **JWT webhooks are different.** Enterprise accounts using JWT signatures verify an RS256 token against Bland's JWKS; this HMAC check doesn't apply.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always invalid | Wrong or stale secret (a secret is shown once; Replace Secret issues a new one), or the body was parsed and re-serialised before hashing |
| Invalid for only some payloads | Body re-serialisation changes spacing, key order or unicode escaping; hash the raw bytes |
| No `X-Webhook-Signature` header | Likely no signing secret created on the account, or the request isn't from the account's call (e.g. a pathway Webhook node request, which isn't signed this way) |
| Header present, secret set, still fails | Proxy or middleware altered the body (compression, charset conversion); inspect the bytes your server receives |
