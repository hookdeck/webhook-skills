# Intercom Signature Verification

## How It Works

Intercom signs every webhook delivery with HMAC-SHA1 over the **raw JSON request
body**, using your app's `client_secret` as the key. The signature is sent in the
`X-Hub-Signature` header in the format:

```
X-Hub-Signature: sha1=<40-character-hex-digest>
```

The signature is computed as:

```
HMAC-SHA1(raw_request_body, client_secret) → hex encoded
```

The secret comes from **Developer Hub → your app → Basic Information → Client
secret**. There is no separate "webhook signing secret" — Intercom reuses the
app's client secret.

## Implementation

Intercom does not publish an official SDK helper for webhook verification, so all
three frameworks use manual HMAC verification.

### Node.js

```javascript
const crypto = require('crypto');

function verifyIntercomWebhook(rawBody, signatureHeader, clientSecret) {
  if (!signatureHeader || !clientSecret) return false;

  // Intercom sends: sha1=<hex>
  const [algorithm, signature] = signatureHeader.split('=');
  if (algorithm !== 'sha1' || !signature) return false;

  // Compute expected signature
  const expected = crypto
    .createHmac('sha1', clientSecret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false; // length mismatch ⇒ invalid
  }
}

// Usage in Express
app.post('/webhooks/intercom',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['x-hub-signature'];

    if (!verifyIntercomWebhook(req.body, signature, process.env.INTERCOM_CLIENT_SECRET)) {
      return res.status(401).send('Invalid signature');
    }

    // Process webhook...
  }
);
```

### Python

```python
import hmac
import hashlib

def verify_intercom_webhook(raw_body: bytes, signature_header: str, client_secret: str) -> bool:
    if not signature_header or not client_secret:
        return False

    try:
        algorithm, signature = signature_header.split("=", 1)
    except ValueError:
        return False
    if algorithm != "sha1" or not signature:
        return False

    expected = hmac.new(
        client_secret.encode("utf-8"),
        raw_body,
        hashlib.sha1,
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
```

## Common Gotchas

### 1. Raw Body Requirement

The signature is computed on the exact bytes Intercom sent. Re-serializing a
parsed JSON object will almost always produce a different string (key ordering,
whitespace, number formatting) and break verification.

**Express:**

```javascript
// WRONG — body is already parsed; re-stringifying changes the bytes
app.use(express.json());
app.post('/webhooks/intercom', (req, res) => {
  verifyIntercomWebhook(JSON.stringify(req.body), ...); // Fails!
});

// CORRECT — capture the raw body before JSON parsing
app.post('/webhooks/intercom',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    verifyIntercomWebhook(req.body, ...); // Works
  }
);
```

**Next.js App Router:** Read the body as text first:

```ts
const body = await request.text();
const signature = request.headers.get('x-hub-signature');
// verify against `body`, then JSON.parse(body)
```

**FastAPI:**

```python
raw_body = await request.body()  # bytes — do NOT use request.json() first
```

### 2. SHA-1, Not SHA-256

Intercom uses **HMAC-SHA1** for webhook signing (similar to GitHub's legacy
`X-Hub-Signature` header — not its modern `X-Hub-Signature-256`). If verification
fails, double-check you are not accidentally using SHA-256.

```javascript
// WRONG
crypto.createHmac('sha256', secret).update(body).digest('hex');

// CORRECT
crypto.createHmac('sha1', secret).update(body).digest('hex');
```

### 3. Strip the `sha1=` Prefix

The header value is `sha1=<hex>`, not a bare hex string:

```javascript
// WRONG — comparing "sha1=abc..." to "abc..."
const signature = req.headers['x-hub-signature'];

// CORRECT
const [algorithm, signature] = req.headers['x-hub-signature'].split('=');
if (algorithm !== 'sha1') return false;
```

### 4. Hex Encoding, Not Base64

Intercom's signature is hex-encoded (40 lowercase characters). Make sure your
`.digest()` call uses `hex`:

```javascript
.digest('hex')      // CORRECT
.digest('base64')   // WRONG — won't match
```

### 5. Timing-Safe Comparison

Always use timing-safe comparison to prevent timing attacks:

```javascript
// WRONG — vulnerable to timing attacks
if (computed === received) { ... }

// CORRECT
crypto.timingSafeEqual(
  Buffer.from(computed, 'hex'),
  Buffer.from(received, 'hex')
);
```

In Python: use `hmac.compare_digest(a, b)`.

### 6. Buffer Length Mismatch

`crypto.timingSafeEqual` throws when buffers are different lengths. Wrap it:

```javascript
try {
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex')
  );
} catch {
  return false; // different length ⇒ invalid
}
```

### 7. Header Case

Node.js and FastAPI both lowercase incoming header names, so read it as
`x-hub-signature`. Intercom transmits it as `X-Hub-Signature`.

## Debugging Verification Failures

### Inspect the Raw Body

```javascript
app.post('/webhooks/intercom',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    console.log('Body is Buffer:', Buffer.isBuffer(req.body));
    console.log('Body length:', req.body.length);
    console.log('Signature header:', req.headers['x-hub-signature']);
  }
);
```

### Compare Signatures

```javascript
const computed = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
console.log('Computed:', computed);
console.log('Received:', signature.replace('sha1=', ''));
```

### Verify Your Secret

The signing key is the **`client_secret`** from your app's Basic Information
page in the Developer Hub. Common mistakes:

- Using the **access token** instead of the **client secret**
- Trailing whitespace from copy-paste
- A different app's secret (each app has its own)
- The secret was rotated and the environment variable is stale

### Handling the `ping`

When a webhook is first saved, Intercom sends a `ping`. It is signed exactly
like every other delivery — verify it the same way and return `2xx`:

```javascript
if (topic === 'ping') {
  return res.status(200).send('OK');
}
```

## Full Documentation

- [Intercom Webhooks](https://developers.intercom.com/docs/webhooks)
- [Webhook Models](https://developers.intercom.com/docs/references/webhooks/webhook-models)
