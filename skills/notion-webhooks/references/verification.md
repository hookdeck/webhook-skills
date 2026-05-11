# Notion Signature Verification

## How It Works

Notion signs every webhook request (after the initial handshake) using
HMAC-SHA256. The signature is included in the `X-Notion-Signature` header
in the format:

```
X-Notion-Signature: sha256=<hex-encoded-signature>
```

The signature is computed as:

```
HMAC-SHA256(raw_request_body, verification_token) → hex encoded
```

The signing key is the `verification_token` your endpoint captured during
the one-time handshake — **not** the integration's API token.

## The Handshake (No Signature)

The first POST to a new subscription is a verification handshake. It carries
**no `X-Notion-Signature` header** and the body is just:

```json
{ "verification_token": "secret_..." }
```

Do **not** attempt to verify a signature on this request. Capture the token,
return `200`, and paste it into the Notion UI to activate the subscription.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyNotionSignature(rawBody, signatureHeader, verificationToken) {
  if (!signatureHeader || !verificationToken) return false;

  const expected = `sha256=${crypto
    .createHmac('sha256', verificationToken)
    .update(rawBody)
    .digest('hex')}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signatureHeader)
    );
  } catch {
    return false;
  }
}
```

### Python

```python
import hmac
import hashlib

def verify_notion_signature(raw_body: bytes, signature_header: str, token: str) -> bool:
    if not signature_header or not token:
        return False
    expected = "sha256=" + hmac.new(
        token.encode("utf-8"), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)
```

## Common Gotchas

### 1. Use the Raw Body

The signature is computed over the exact bytes Notion sent. Re-serialising
the parsed JSON will reorder fields or change spacing and the comparison will
fail.

```javascript
// WRONG - body is parsed and re-serialised
app.use(express.json());
app.post('/webhooks/notion', (req, res) => {
  verifyNotionSignature(JSON.stringify(req.body), ...); // fails
});

// CORRECT - keep the raw body
app.post('/webhooks/notion',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    verifyNotionSignature(req.body, ...); // works
  }
);
```

### 2. Don't Verify the Handshake

The first POST has no `X-Notion-Signature` header. If you reject every
request without a signature you'll never get past the handshake. Detect
the handshake by absence of the header **and** presence of a
`verification_token` field in the body, and return 200.

### 3. Sign with the verification_token, Not the API Token

The HMAC key is the `verification_token` returned during the handshake. It
is distinct from the integration's API token (`ntn_...` / `secret_...` used
for REST calls). Mixing them up will silently fail every signature check.

### 4. Use a Timing-Safe Comparison

```javascript
// WRONG - vulnerable to timing attacks
if (computedSignature === receivedSignature) { ... }

// CORRECT - timing-safe
crypto.timingSafeEqual(Buffer.from(computedSignature), Buffer.from(receivedSignature));
```

### 5. Hex Encoding

Notion's signature is hex-encoded, not base64. Use `.digest('hex')` /
`.hexdigest()`.

### 6. Header Case

Most frameworks lowercase incoming header names. Use
`req.headers['x-notion-signature']` in Node, `request.headers.get('x-notion-signature')`
in Next.js, and `request.headers.get("x-notion-signature")` in FastAPI.

## Debugging Verification Failures

```javascript
const computed = `sha256=${crypto.createHmac('sha256', token).update(rawBody).digest('hex')}`;
console.log('Computed:', computed);
console.log('Received:', req.headers['x-notion-signature']);
console.log('Body is Buffer:', Buffer.isBuffer(req.body));
console.log('Body length:', req.body.length);
```

If they differ even by one byte, you almost certainly re-serialised the
body or are using the wrong token.

## Full Documentation

- [Notion Webhooks reference](https://developers.notion.com/reference/webhooks)
