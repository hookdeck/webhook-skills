# How to Verify AiPrise Webhook Signatures

## Why Signature Verification Matters

Your callback endpoint is public, so anyone could POST fake verification outcomes to
it. Verifying the `X-HMAC-SIGNATURE` header proves the request genuinely came from
AiPrise and was not tampered with in transit. Never act on a callback (approve a
user, unlock features) before verifying.

## How It Works

AiPrise signs every callback with **HMAC-SHA256** over the **raw request body**:

```
X-HMAC-SIGNATURE: <lowercase hex of HMAC-SHA256(raw_body, api_private_key)>
```

Key facts:

- **Header:** `X-HMAC-SIGNATURE`
- **Algorithm:** HMAC-SHA256
- **Encoding:** lowercase hexadecimal (no `sha256=` prefix)
- **Signing key:** your **AiPrise API private key** directly — there is **no**
  separate signing/endpoint secret, and this is **not** Standard Webhooks
  (no `webhook-id` / `webhook-timestamp` / `webhook-signature` headers)
- **Signed content:** the exact raw request body bytes (unparsed UTF-8)

The provider computes the signature as:

```
HMAC-SHA256(raw_request_body, api_private_key) → hex → lowercase
```

## Implementation

AiPrise's official SDKs (`aiprise-web-sdk`, `aiprise-types`,
`aiprise-react-native-sdk`) are **client-side / mobile only** — there is no
server-side verification SDK. Verify callbacks manually with your standard library
crypto primitives.

### Node.js

```javascript
const crypto = require('crypto');

function verifyAiPriseWebhook(rawBody, signatureHeader, apiKey) {
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac('sha256', apiKey)
    .update(rawBody)              // Buffer or string of the raw HTTP body
    .digest('hex')
    .toLowerCase();

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader.toLowerCase(), 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;                // length mismatch / malformed hex
  }
}
```

### Python

```python
import hmac
import hashlib

def verify_aiprise_webhook(raw_body: bytes, signature_header: str, api_key: str) -> bool:
    if not signature_header:
        return False

    expected = hmac.new(
        api_key.encode("utf-8"),
        raw_body,                 # raw request body bytes
        hashlib.sha256,
    ).hexdigest().lower()

    return hmac.compare_digest(signature_header.lower(), expected)
```

## Common Gotchas

### 1. Raw Body Requirement

The signature covers the raw request body bytes. If you parse JSON and re-serialize
it, key order and whitespace change, the bytes change, and the HMAC will not match.

**Express:**
```javascript
// WRONG - body is already parsed and re-serialized
app.use(express.json());
app.post('/webhooks/aiprise', (req, res) => {
  verifyAiPriseWebhook(JSON.stringify(req.body), ...); // Fails!
});

// CORRECT - use the raw body
app.post('/webhooks/aiprise',
  express.raw({ type: '*/*' }),
  (req, res) => {
    verifyAiPriseWebhook(req.body, ...); // Works!
  }
);
```

**Next.js / FastAPI:** read the body as text/bytes (`await request.text()` /
`await request.body()`) and verify that before `JSON.parse` / `json.loads`.

### 2. The Signing Key Is Your API Private Key

There is no `whsec_`-style endpoint secret. Use your AiPrise **API private key** as
the HMAC key. A common failure is generating a separate "webhook secret" in another
provider's mental model — AiPrise has none.

### 3. Lowercase Hex, No Prefix

The header is bare lowercase hex — unlike GitHub there is no `sha256=` prefix to
strip. Compare `digest('hex').toLowerCase()` against the header value directly.

### 4. Timing-Safe Comparison

Always compare with a constant-time function (`crypto.timingSafeEqual` /
`hmac.compare_digest`) to avoid leaking the signature via timing.

```javascript
// WRONG - vulnerable to timing attacks
if (expected === signatureHeader) { ... }

// CORRECT - timing-safe (wrap in try/catch for length mismatch)
crypto.timingSafeEqual(Buffer.from(signatureHeader, 'hex'), Buffer.from(expected, 'hex'));
```

### 5. Buffer Length Mismatch

`timingSafeEqual` throws if the two buffers differ in length (e.g. a malformed
header). Wrap it in `try/catch` and return `false` on error.

## Debugging Verification Failures

### Check the Raw Body

```javascript
app.post('/webhooks/aiprise', express.raw({ type: '*/*' }), (req, res) => {
  console.log('Body is Buffer:', Buffer.isBuffer(req.body));
  console.log('Signature header:', req.headers['x-hmac-signature']);
});
```

### Compare Signatures

```javascript
const expected = crypto.createHmac('sha256', apiKey).update(rawBody).digest('hex');
console.log('Computed:', expected);
console.log('Received:', signatureHeader);
```

If they differ, the most likely causes are: the body was parsed/re-serialized before
verification, the wrong key was used (must be the API private key), or an upstream
proxy altered the body.

### Check Your Key

Ensure `AIPRISE_API_KEY` matches your AiPrise API private key exactly — watch for
leading/trailing whitespace and copy-paste errors.

## Retry Behaviour

AiPrise retries a failed callback up to three times with exponential backoff
([changelog](https://docs.aiprise.com/changelog/changelog-feb-28-mar-7-2026)), and team
members can retry one by hand from the callback logs. The intervals aren't documented.
Return a `2xx` quickly and make handlers idempotent. Don't deduplicate on
`verification_session_id` alone: one session produces many different events. Apply each
event as a state change you can repeat safely, such as setting a case's status.

## Full Documentation

For complete verification details, see
[AiPrise Callbacks & Authentication](https://docs.aiprise.com/docs/callbacks-authentication).
