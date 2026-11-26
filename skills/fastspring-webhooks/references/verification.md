# FastSpring Signature Verification

## How It Works

FastSpring signs every webhook request (when an HMAC secret is configured) using
HMAC-SHA256. The signature is the base64-encoded digest of the **exact raw request
body**, sent in the `X-FS-Signature` header.

The signature is computed as:

```
base64( HMAC-SHA256( raw_request_body, hmac_sha256_secret ) )
```

The secret is the **HMAC SHA256 Secret** you set per-webhook in the FastSpring
dashboard (**Developer Tools → Webhooks → Configuration**). Your server recomputes
the digest with the same secret and compares it, timing-safe, to the header value.

FastSpring is **not** the Standard Webhooks (Svix) spec — there are no
`webhook-id` / `webhook-timestamp` / `webhook-signature` headers and no separate
signed timestamp.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyFastSpringWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false; // length mismatch = invalid
  }
}
```

### Python

```python
import hmac
import hashlib
import base64

def verify_fastspring_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header:
        return False
    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode("utf-8")
    return hmac.compare_digest(signature_header, expected)
```

## No Official SDK

FastSpring does not publish an official webhook-verification SDK, so verify the
HMAC manually in every framework using the snippets above.

## Batched Events

Each POST batches multiple events in an `events` array. **Verify the signature once
against the whole raw body**, then iterate `payload.events` and dispatch on each
`event.type`:

```javascript
if (!verifyFastSpringWebhook(rawBody, req.headers['x-fs-signature'], secret)) {
  return res.status(400).send('Invalid signature');
}
const { events } = JSON.parse(rawBody.toString());
for (const event of events) {
  // dedupe on event.id, then handle event.type
}
```

## Common Gotchas

### 1. Use the Raw Body

The signature is computed over the exact bytes FastSpring sent. Do **not** parse
JSON and re-serialize before verifying — key ordering and whitespace will differ
and the digest will not match.

**Express:**
```javascript
// WRONG - body is already parsed and re-serialized
app.use(express.json());
app.post('/webhooks/fastspring', (req, res) => {
  verifyFastSpringWebhook(JSON.stringify(req.body), ...); // Fails!
});

// CORRECT - use raw body
app.post('/webhooks/fastspring',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    verifyFastSpringWebhook(req.body, ...); // Works!
  }
);
```

### 2. Base64, Not Hex

FastSpring's signature is base64-encoded. A hex digest will never match:

```javascript
.digest('hex')     // WRONG
.digest('base64')  // CORRECT
```

### 3. Signing Only Active When the Secret Is Set

If the HMAC SHA256 Secret field is blank on the webhook, FastSpring sends **no**
`X-FS-Signature` header. Configure the secret so deliveries are signed, and reject
requests missing the header.

### 4. Header Casing

`X-FS-Signature` is case-insensitive and may arrive in varying cases. Node/Express
and FastAPI expose headers lowercased (`x-fs-signature`) — read it that way.

### 5. Timing-Safe Comparison

Always compare with a constant-time function (`crypto.timingSafeEqual` /
`hmac.compare_digest`) to avoid timing attacks. Guard against buffer length
mismatches (they throw with `timingSafeEqual`).

### 6. Idempotency on Retries

Automatic retries reuse the same event `id`; manual retries get new ids. FastSpring
retries an event for up to 7 days until a `200` (or a `202` listing its ID) marks it processed. Dedupe on `id` so repeated deliveries don't double-
process.

## Debugging Verification Failures

```javascript
const computed = crypto
  .createHmac('sha256', secret)
  .update(rawBody)
  .digest('base64');
console.log('Computed:', computed);
console.log('Received:', signatureHeader);
console.log('Body is Buffer:', Buffer.isBuffer(rawBody));
console.log('Body length:', rawBody.length);
```

If they don't match:
- Confirm you're hashing the **raw** body, not parsed/re-serialized JSON.
- Confirm base64 (not hex) encoding.
- Confirm the secret matches the **HMAC SHA256 Secret** on that exact webhook.

## Full Documentation

- [Message Security](https://developer.fastspring.com/reference/message-security)
- [Webhooks Overview](https://developer.fastspring.com/reference/webhooks-overview)
