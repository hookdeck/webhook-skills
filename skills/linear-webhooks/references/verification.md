# Linear Signature Verification

## How It Works

Linear signs every webhook request using **HMAC-SHA256** over the **raw request body**, with the workspace's webhook signing secret as the key. The hex-encoded digest is sent in the `Linear-Signature` header:

```
Linear-Signature: <hex_hmac_sha256(raw_body, secret)>
```

> Unlike GitHub, Linear does **not** prefix the signature with `sha256=`. The header value is a bare 64-character hex string.

In addition, every payload includes a `webhookTimestamp` field (UNIX milliseconds). Linear recommends rejecting any delivery whose timestamp is more than **1 minute** away from your server's current time. This prevents replay of captured requests.

## SDK Availability

Linear's official `@linear/sdk` is focused on the GraphQL API and **does not ship a webhook verification helper**. Verify signatures manually in both Node.js and Python.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyLinearWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

function isFreshTimestamp(webhookTimestamp) {
  if (typeof webhookTimestamp !== 'number') return false;
  return Math.abs(Date.now() - webhookTimestamp) <= 60 * 1000;
}

// Express usage
app.post('/webhooks/linear',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['linear-signature'];

    if (!verifyLinearWebhook(req.body, signature, process.env.LINEAR_WEBHOOK_SECRET)) {
      return res.status(400).send('Invalid signature');
    }

    const payload = JSON.parse(req.body.toString());

    if (!isFreshTimestamp(payload.webhookTimestamp)) {
      return res.status(400).send('Stale webhook');
    }

    // Process webhook...
  }
);
```

### Python

```python
import hmac
import hashlib
import time


def verify_linear_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:
        return False

    expected = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(signature_header, expected)


def is_fresh_timestamp(webhook_timestamp_ms: int) -> bool:
    if not isinstance(webhook_timestamp_ms, int):
        return False
    now_ms = int(time.time() * 1000)
    return abs(now_ms - webhook_timestamp_ms) <= 60_000
```

## Common Gotchas

### 1. Use the raw request body

The signature is computed over the **exact bytes Linear sent**. Parsing JSON before verifying changes the byte representation (key ordering, whitespace, escaping) and verification will fail.

**Express:**
```javascript
// WRONG — body is already parsed
app.use(express.json());
app.post('/webhooks/linear', (req, res) => {
  verifyLinearWebhook(JSON.stringify(req.body), ...); // Fails!
});

// CORRECT — keep the raw body
app.post('/webhooks/linear',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    verifyLinearWebhook(req.body, ...); // Works
  }
);
```

**Next.js App Router:** call `await request.text()` (not `request.json()`) and pass the string to your verifier.

**FastAPI:** call `await request.body()` (not `request.json()`) and pass the bytes to your verifier.

### 2. No `sha256=` prefix

Linear sends the raw hex digest. Do not strip a prefix and do not add one.

```javascript
// WRONG — Linear does not use this format
const signature = signatureHeader.replace('sha256=', '');

// CORRECT — use the header value as-is
const signature = signatureHeader;
```

### 3. Hex encoding (not base64)

Linear's digest is hex-encoded.

```javascript
// WRONG
.digest('base64')

// CORRECT
.digest('hex')
```

### 4. Timing-safe comparison

Always compare with `crypto.timingSafeEqual` / `hmac.compare_digest`. A plain `===` comparison is vulnerable to timing attacks. Wrap the call in `try/catch` (or pre-check length) because `timingSafeEqual` throws when buffers have different lengths.

### 5. webhookTimestamp is in milliseconds

`payload.webhookTimestamp` is **milliseconds** since epoch, not seconds. Compare to `Date.now()` (ms) in JavaScript or `int(time.time() * 1000)` in Python.

### 6. Use `Linear-Delivery` for idempotency

Linear retries failed deliveries. Persist the `Linear-Delivery` UUID and skip work if you have already processed it. The signing secret only verifies *authenticity*, not *uniqueness*.

## Debugging Verification Failures

### Inspect the raw body and header

```javascript
app.post('/webhooks/linear',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    console.log('Body is Buffer:', Buffer.isBuffer(req.body));
    console.log('Body bytes:', req.body.length);
    console.log('Signature header:', req.headers['linear-signature']);
    console.log('Event:', req.headers['linear-event']);
    console.log('Delivery:', req.headers['linear-delivery']);
  }
);
```

### Compare digests manually

```javascript
const computed = crypto
  .createHmac('sha256', secret)
  .update(rawBody)
  .digest('hex');

console.log('Computed:', computed);
console.log('Received:', req.headers['linear-signature']);
```

### Verify the secret

The secret is shown **only once** when the webhook is created in Linear. Watch out for:
- Leading/trailing whitespace from copy-paste
- Confusing it with the OAuth client secret or a personal API key
- A different secret per webhook — recreate the webhook to rotate

## Full Documentation

For Linear's official verification guide, see the [Linear webhooks documentation](https://linear.app/developers/webhooks).
