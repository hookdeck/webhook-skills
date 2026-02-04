# FusionAuth Signature Verification

## How It Works

FusionAuth signs webhook events using a JWT in the `X-FusionAuth-Signature-JWT` header. This JWT contains:

1. A `request_body_sha256` claim - Base64-encoded SHA-256 hash of the request body
2. Standard JWT header with algorithm (`alg`) and key ID (`kid`)

Example header value:
```
X-FusionAuth-Signature-JWT: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZXF1ZXN0X2JvZHlfc2hhMjU2IjoiS2VWKy9IR29JUXJ4dUU1WVBDUlI2QXVRT0p2ZWxkWU5OaGJWaTFpMjJxaz0ifQ.signature
```

The JWT decodes to:

**Header:**
```json
{
  "alg": "HS256",
  "typ": "JWT",
  "kid": "webhook-signing-key-id"
}
```

**Payload:**
```json
{
  "request_body_sha256": "KeV+/HGoIQrxuE5YPCRR6AuQOJveldYNNhbVi1i22qk="
}
```

## Supported Signing Algorithms

FusionAuth supports multiple key types for signing:

| Key Type | Algorithms | Notes |
|----------|------------|-------|
| HMAC | HS256, HS384, HS512 | Fastest, requires manual secret distribution |
| RSA | RS256, RS384, RS512 | Public key available via JWKS endpoint |
| EC | ES256, ES384, ES512 | Strong security, public key via JWKS |
| EdDSA | EdDSA | Strongest cryptography, public key via JWKS |

## Implementation

### HMAC Verification (Manual Secret)

For HMAC keys, verify using the shared secret:

**Node.js:**
```javascript
const crypto = require('crypto');
const jose = require('jose');

async function verifyFusionAuthWebhook(rawBody, signatureJwt, hmacSecret) {
  if (!signatureJwt || !hmacSecret) return false;

  try {
    // Create key from HMAC secret
    const key = new TextEncoder().encode(hmacSecret);

    // Verify JWT signature and decode
    const { payload } = await jose.jwtVerify(signatureJwt, key, {
      algorithms: ['HS256', 'HS384', 'HS512']
    });

    // Calculate SHA-256 hash of request body
    const bodyHash = crypto
      .createHash('sha256')
      .update(rawBody)
      .digest('base64');

    // Compare hash from JWT claim with calculated hash
    return payload.request_body_sha256 === bodyHash;
  } catch (err) {
    console.error('Verification failed:', err.message);
    return false;
  }
}
```

**Python:**
```python
import hashlib
import base64
import jwt

def verify_fusionauth_webhook(raw_body: bytes, signature_jwt: str, secret: str) -> bool:
    if not signature_jwt or not secret:
        return False

    try:
        # Verify and decode JWT
        payload = jwt.decode(signature_jwt, secret, algorithms=['HS256', 'HS384', 'HS512'])

        # Calculate SHA-256 hash of request body
        body_hash = base64.b64encode(hashlib.sha256(raw_body).digest()).decode()

        # Compare hash from JWT claim with calculated hash
        return payload.get('request_body_sha256') == body_hash
    except jwt.InvalidTokenError:
        return False
```

### Asymmetric Key Verification (JWKS)

For RSA/EC/EdDSA keys, fetch the public key from FusionAuth's JWKS endpoint:

**Node.js:**
```javascript
const jose = require('jose');
const crypto = require('crypto');

const FUSIONAUTH_URL = process.env.FUSIONAUTH_URL;
const jwksUrl = new URL('/.well-known/jwks.json', FUSIONAUTH_URL);
const JWKS = jose.createRemoteJWKSet(jwksUrl);

async function verifyWithJwks(rawBody, signatureJwt) {
  try {
    // Verify JWT using JWKS endpoint (auto-fetches correct key by kid)
    const { payload } = await jose.jwtVerify(signatureJwt, JWKS);

    // Calculate SHA-256 hash of request body
    const bodyHash = crypto
      .createHash('sha256')
      .update(rawBody)
      .digest('base64');

    return payload.request_body_sha256 === bodyHash;
  } catch (err) {
    console.error('JWKS verification failed:', err.message);
    return false;
  }
}
```

## Common Gotchas

### 1. Raw Body Requirement

The signature is computed over the raw request body. You must verify BEFORE parsing JSON.

**Express:**
```javascript
// WRONG - body is already parsed
app.use(express.json());
app.post('/webhooks/fusionauth', (req, res) => {
  // req.body is already an object, signature verification will fail!
});

// CORRECT - use raw body for webhook route
app.post('/webhooks/fusionauth',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    // req.body is a Buffer, signature verification works
  }
);
```

### 2. Base64 Hash Comparison

The `request_body_sha256` claim is **Base64-encoded**, not hex. Make sure to encode your hash the same way:

```javascript
// WRONG - hex encoding
const hash = crypto.createHash('sha256').update(body).digest('hex');

// CORRECT - base64 encoding
const hash = crypto.createHash('sha256').update(body).digest('base64');
```

### 3. Algorithm Mismatch

Ensure your verification code accepts the algorithm FusionAuth is using:

```javascript
// Specify allowed algorithms
const { payload } = await jose.jwtVerify(jwt, key, {
  algorithms: ['HS256', 'HS384', 'HS512']  // Or RS256, ES256, etc.
});
```

### 4. Key ID (kid) for JWKS

When using asymmetric keys, the JWT header contains a `kid` (key ID) that identifies which key to use from the JWKS endpoint. The `jose` library handles this automatically with `createRemoteJWKSet`.

## Debugging Verification Failures

### Log Everything

```javascript
app.post('/webhooks/fusionauth', express.raw({ type: 'application/json' }), async (req, res) => {
  const signatureJwt = req.headers['x-fusionauth-signature-jwt'];
  
  console.log('Raw body type:', typeof req.body);
  console.log('Raw body length:', req.body?.length);
  console.log('Signature header present:', !!signatureJwt);
  
  // Decode JWT without verification to inspect
  const parts = signatureJwt?.split('.');
  if (parts?.length === 3) {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    console.log('JWT header:', header);
    console.log('JWT payload:', payload);
  }
  
  // Calculate expected hash
  const expectedHash = crypto.createHash('sha256').update(req.body).digest('base64');
  console.log('Expected body hash:', expectedHash);
});
```

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `JWTInvalid` | Wrong secret or algorithm | Check HMAC secret matches Key Master |
| `JWSSignatureVerificationFailed` | Secret mismatch | Verify exact secret value |
| Hash mismatch | Body was modified | Ensure raw body, check middleware order |
| `kid not found in JWKS` | Key ID mismatch | Verify JWKS endpoint is correct |

## Key Rotation

For asymmetric keys, FusionAuth's JWKS endpoint allows seamless key rotation:

1. Generate new key in Key Master
2. Update webhook to use new signing key
3. JWKS endpoint now returns both keys
4. Old key can be deleted after transition period

For HMAC keys, you must coordinate secret rotation manually:
1. Generate new HMAC key
2. Update webhook handler to accept both old and new secrets
3. Update FusionAuth webhook to use new key
4. Remove old secret from handler

## Full Documentation

For complete details, see [FusionAuth Webhook Signing Documentation](https://fusionauth.io/docs/extend/events-and-webhooks/signing).
