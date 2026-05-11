# Gemini Signature Verification

Gemini supports two signing schemes depending on how the webhook is registered:

| Mode | Algorithm | Header | Verified Against |
|------|-----------|--------|------------------|
| Static (project-level) | HMAC-SHA256 (Standard Webhooks) | `webhook-signature` (`v1,<base64>`) | Shared `whsec_` secret |
| Dynamic (per-request) | RS256 JWT | `Webhook-Signature` (JWT) | Google JWKS endpoint |

The examples in this skill use **static** webhooks. Dynamic JWT verification is
documented at the bottom.

## Static Webhooks (HMAC, Standard Webhooks)

Each request includes three headers:

- `webhook-id` — unique message id (e.g. `msg_2KWPBgLlAfxdpx2AI54pPJ85f4W`)
- `webhook-timestamp` — Unix seconds (e.g. `1746374400`)
- `webhook-signature` — `v1,<base64-signature>`

The signature is HMAC-SHA256 over:

```
webhook_id.webhook_timestamp.request_body
```

with the base64-decoded secret (after stripping the `whsec_` prefix) as the key.

### Manual Verification (Node.js)

```javascript
const crypto = require('crypto');

function verifyGeminiSignature(payload, webhookId, webhookTimestamp, webhookSignature, secret) {
  if (!webhookId || !webhookTimestamp || !webhookSignature || !webhookSignature.includes(',')) {
    return false;
  }

  // Reject payloads older than 5 minutes
  const currentTime = Math.floor(Date.now() / 1000);
  const timestampDiff = currentTime - parseInt(webhookTimestamp);
  if (timestampDiff > 300 || timestampDiff < -300) return false;

  const [version, signature] = webhookSignature.split(',');
  if (version !== 'v1') return false;

  const payloadStr = payload instanceof Buffer ? payload.toString('utf8') : payload;
  const signedContent = `${webhookId}.${webhookTimestamp}.${payloadStr}`;

  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const secretBytes = Buffer.from(secretKey, 'base64');

  const expected = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent, 'utf8')
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
```

### Manual Verification (Python)

```python
import hmac, hashlib, base64, time

def verify_gemini_signature(payload, webhook_id, webhook_timestamp, webhook_signature, secret):
    if not (webhook_id and webhook_timestamp and webhook_signature) or ',' not in webhook_signature:
        return False

    try:
        if abs(int(time.time()) - int(webhook_timestamp)) > 300:
            return False
    except ValueError:
        return False

    version, signature = webhook_signature.split(',', 1)
    if version != 'v1':
        return False

    signed = f"{webhook_id}.{webhook_timestamp}.{payload.decode('utf-8')}"
    secret_key = secret[6:] if secret.startswith('whsec_') else secret
    secret_bytes = base64.b64decode(secret_key)

    expected = base64.b64encode(
        hmac.new(secret_bytes, signed.encode('utf-8'), hashlib.sha256).digest()
    ).decode('utf-8')

    return hmac.compare_digest(signature, expected)
```

### SDK Option: `standardwebhooks`

Because Gemini follows the Standard Webhooks spec exactly, you can also use the official
`standardwebhooks` library:

```python
from standardwebhooks import Webhook

wh = Webhook(os.environ["GEMINI_WEBHOOK_SECRET"])
event = wh.verify(request.get_data(as_text=True), dict(request.headers))
```

```javascript
import { Webhook } from "standardwebhooks";

const wh = new Webhook(process.env.GEMINI_WEBHOOK_SECRET);
const event = wh.verify(rawBody, {
  "webhook-id": req.headers["webhook-id"],
  "webhook-timestamp": req.headers["webhook-timestamp"],
  "webhook-signature": req.headers["webhook-signature"],
});
```

The manual implementation above is preferred when you want zero runtime dependencies
or when you need to inspect intermediate values for debugging.

## Common Gotchas

### 1. Raw Body Requirement

The signature is computed over the **raw bytes** of the request body. If your framework
parses JSON before you see the body, the signed content won't match.

**Express:**
```javascript
// WRONG — express.json() mutates req.body to an object
app.use(express.json());

// CORRECT — keep the body as a Buffer for the webhook route
app.post('/webhooks/gemini',
  express.raw({ type: 'application/json' }),
  handler
);
```

**Next.js:** call `await request.text()` instead of `await request.json()`, verify,
then `JSON.parse` after the check passes.

**FastAPI:** call `await request.body()` to get the raw bytes; pass them to the
verifier before `await request.json()`.

### 2. Header Case

HTTP headers are case-insensitive, but always read them lowercased to be safe:

```javascript
req.headers['webhook-id']
req.headers['webhook-timestamp']
req.headers['webhook-signature']
```

### 3. Secret Format

The secret returned by the WebhookService API is the literal string `whsec_` followed
by a base64 key. Don't double-decode and don't trim the `whsec_` prefix before
storing — the verification code strips it at use time.

### 4. Timestamp Tolerance

Reject any payload where `|now - webhook-timestamp| > 300` seconds. This is the
Standard Webhooks default and what Gemini documents.

### 5. Timing-Safe Comparison

Never compare signatures with `===` / `==`. Use `crypto.timingSafeEqual` (Node) or
`hmac.compare_digest` (Python).

## Debugging Verification Failures

1. Confirm `req.body` is a Buffer/bytes/string, not a parsed object.
2. Log the three headers and the first 80 chars of the body.
3. Re-compute the signature locally with the secret and confirm it matches.
4. Check server clock skew — NTP drift breaks timestamp validation.
5. Confirm the env var contains the full `whsec_…` value.

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `Invalid signature` on every request | Body was parsed before verification | Use raw body middleware / `request.text()` |
| Works locally, fails in prod | Wrong env var, secret rotated | Re-read from secret manager |
| Random failures | Clock skew > 5 min | Sync NTP |
| Fails only for some requests | Trailing newline / proxy modification | Make sure your reverse proxy isn't rewriting the body |

## Dynamic Webhooks (RS256 JWT)

When a webhook is configured per-request via `webhook_config`, Gemini signs each
delivery with an RS256 JWT placed in the `Webhook-Signature` header. The JWT header
contains a `kid` that maps to a public key at:

```
https://generativelanguage.googleapis.com/.well-known/jwks.json
```

Verification flow:

1. Read the `Webhook-Signature` header value (the JWT).
2. Decode the JWT header without verifying to read the `kid`.
3. Fetch and cache the JWKS document.
4. Find the JWK with the matching `kid`.
5. Verify the JWT signature with RS256 against that key.
6. Validate `iss`, `aud` (your endpoint URL), and `exp`.
7. The JWT payload contains the event; you can also recover `user_metadata`.

### Node.js (using `jose`)

```javascript
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('https://generativelanguage.googleapis.com/.well-known/jwks.json')
);

export async function verifyDynamicGeminiJWT(jwt, expectedAudience) {
  const { payload } = await jwtVerify(jwt, JWKS, {
    algorithms: ['RS256'],
    audience: expectedAudience, // your webhook URL
  });
  return payload;
}
```

### Python (using `PyJWT[crypto]`)

```python
import jwt
from jwt import PyJWKClient

jwks_client = PyJWKClient("https://generativelanguage.googleapis.com/.well-known/jwks.json")

def verify_dynamic_gemini_jwt(token: str, expected_audience: str) -> dict:
    signing_key = jwks_client.get_signing_key_from_jwt(token).key
    return jwt.decode(
        token,
        signing_key,
        algorithms=["RS256"],
        audience=expected_audience,
    )
```

The same payload-validation rules apply (5-minute freshness, deduplication on `webhook-id`).
