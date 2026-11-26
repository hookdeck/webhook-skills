# How to Verify Alchemy Webhook Signatures

## How It Works

Alchemy signs every webhook request with **HMAC-SHA256** and sends the result, **hex-encoded**, in a
single header:

```
X-Alchemy-Signature: <hex-encoded-hmac-sha256>
```

The signature is computed as:

```
HMAC-SHA256(raw_request_body, per_webhook_signing_key) → hex
```

Key facts:

- **One header only.** There is **no** `sha256=` prefix, **no** `webhook-id`, and **no** timestamp.
  Alchemy is **not** Standard Webhooks compliant, so don't reach for a Svix-style verifier.
- **Key is per-webhook**, copied from the top-right of the webhook's detail page (or fetched via the
  Notify API, which returns it as `signing_key` on each webhook). It is **not** your team Auth Token.
- **Sign the raw body.** The digest must be computed over the exact bytes Alchemy sent. Re-serializing
  parsed JSON (`JSON.stringify(req.body)`) reorders/reformats fields and will not match.

## Why Signature Verification Matters

Your endpoint is public. Without verification, anyone could POST fake "deposit received" or
"transaction mined" events and trick your app into crediting balances or unlocking features. Verifying
the HMAC proves the request came from Alchemy and the body wasn't tampered with in transit.

## Implementation

Alchemy ships no verification helper (and its `alchemy-sdk` is deprecated and archived), so verify
manually in every language.

### Node.js

```javascript
const crypto = require('crypto');

function verifyAlchemySignature(rawBody, signature, signingKey) {
  if (!signature) return false;

  const digest = crypto
    .createHmac('sha256', signingKey)
    .update(rawBody, 'utf8')   // rawBody = raw string/Buffer, never re-stringified JSON
    .digest('hex');

  // Timing-safe comparison; both are hex strings of equal length when valid
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch {
    return false; // different lengths = invalid
  }
}
```

### Python

```python
import hmac
import hashlib

def verify_alchemy_signature(raw_body: bytes, signature: str, signing_key: str) -> bool:
    if not signature:
        return False

    digest = hmac.new(
        signing_key.encode("utf-8"),
        raw_body,               # raw request bytes, not parsed JSON
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(signature, digest)
```

## Common Gotchas

### 1. Raw Body Requirement

Compute the HMAC over the **raw** request body. Parsing then re-serializing breaks the signature.

**Express:**
```javascript
// WRONG - body is already parsed and re-stringified
app.use(express.json());
app.post('/webhooks/alchemy', (req, res) => {
  verifyAlchemySignature(JSON.stringify(req.body), sig, key); // Fails!
});

// CORRECT - capture the raw body
app.post('/webhooks/alchemy',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    verifyAlchemySignature(req.body, sig, key); // req.body is a Buffer
  }
);
```

**Next.js App Router:** read `await request.text()` and hash that string before `JSON.parse`.

**FastAPI:** read `await request.body()` (bytes) and hash that before `json.loads`.

### 2. No `sha256=` Prefix

Unlike GitHub, the Alchemy header value is the bare hex digest. Do **not** strip a `sha256=` prefix —
there isn't one. Compare the whole header value against your computed hex digest.

### 3. Hex Encoding, Not Base64

Alchemy uses hex. `.digest('hex')` in Node and `.hexdigest()` in Python. Using base64 will never match.

### 4. Use the Right Key

- **Signing key** (per-webhook) → verifies incoming deliveries. Store as `ALCHEMY_SIGNING_KEY`.
- **Auth Token** (per-app) → only for the Notify API / SDK when creating/managing webhooks.

Mixing these up is the most common cause of "every signature fails".

### 5. Timing-Safe Comparison

Always compare with a constant-time function (`crypto.timingSafeEqual` / `hmac.compare_digest`) to avoid
leaking the correct signature via response timing. Guard `timingSafeEqual` against length mismatches
(it throws) by wrapping it in try/catch.

## Debugging Verification Failures

```javascript
const computed = crypto.createHmac('sha256', signingKey).update(rawBody, 'utf8').digest('hex');
console.log('Body is Buffer/string (not object):', Buffer.isBuffer(rawBody) || typeof rawBody === 'string');
console.log('Computed:', computed);
console.log('Received:', signature);
```

If they differ:

- Confirm you're hashing the **raw** body, not `JSON.stringify(parsedBody)`.
- Confirm the key is the **signing key** for *this* webhook (`webhookId` in the payload), not the Auth Token.
- Check for leading/trailing whitespace or copy-paste errors in the key.
- Ensure no proxy/middleware mutated the body before you read it.

## Full Documentation

See the [Alchemy Notify signature & security docs](https://www.alchemy.com/docs/reference/notify-api-quickstart#webhook-signature--security).
