# eBay Signature Verification

eBay webhooks require **two** independent checks. Both must be implemented.

1. **Endpoint challenge** — a one-time SHA-256 handshake when a destination is
   saved (a `GET` with `challenge_code`).
2. **Per-notification signature** — an **ECDSA** signature on every `POST`,
   carried in the `x-ebay-signature` header and verified with a public key
   fetched from eBay.

eBay does **not** use an HMAC shared secret and does **not** follow the Standard
Webhooks spec.

## 1. Endpoint Challenge

When you register/update a destination, eBay calls:

```
GET https://<your-endpoint>?challenge_code=<code>
```

Respond **200** with `Content-Type: application/json` and:

```json
{ "challengeResponse": "<sha256_hex>" }
```

The hash input concatenation order is **mandatory**:

```
SHA-256( challengeCode + verificationToken + endpoint )   → hex
```

- `challengeCode` — from the query string.
- `verificationToken` — your 32–80 char token (`[A-Za-z0-9_-]`).
- `endpoint` — the **exact** URL eBay is configured to call (scheme + host +
  path), e.g. `https://your-domain.com/webhooks/ebay`.

```javascript
const crypto = require('crypto');

function challengeResponse(challengeCode, verificationToken, endpoint) {
  const hash = crypto.createHash('sha256');
  hash.update(challengeCode);
  hash.update(verificationToken);
  hash.update(endpoint);
  return hash.digest('hex');
}
```

```python
import hashlib

def challenge_response(challenge_code: str, verification_token: str, endpoint: str) -> str:
    h = hashlib.sha256()
    h.update(challenge_code.encode())
    h.update(verification_token.encode())
    h.update(endpoint.encode())
    return h.hexdigest()
```

## 2. Per-Notification Signature (ECDSA)

### The `x-ebay-signature` header

The header value is **Base64-encoded JSON**. eBay's SDKs read two fields from it:

- `kid` — the ID of the public key to fetch from eBay.
- `signature` — the Base64 ECDSA signature (DER-encoded) over the body.

The algorithm and digest come from the `getPublicKey` response (`algorithm`
ECDSA, `digest` SHA1); eBay's Node SDK verifies with `ssl3-sha1`.

### Steps

1. Base64-decode `x-ebay-signature` and JSON-parse it.
2. Fetch the public key for `kid` via
   [`getPublicKey`](https://developer.ebay.com/api-docs/commerce/notification/resources/public_key/methods/getPublicKey)
   (`GET /commerce/notification/v1/public_key/{kid}`). **Cache it ~1 hour** keyed
   by `kid`.
3. Verify the ECDSA signature over the **raw request body** using **SHA-1**.

### Getting the public key (`getPublicKey`)

The call needs an **application OAuth token** (client-credentials grant):

```javascript
async function getAppToken({ apiHost, clientId, clientSecret }) {
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(`https://${apiHost}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=' +
      encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
  });
  if (!res.ok) throw new Error(`OAuth token failed: ${res.status}`);
  return (await res.json()).access_token;
}
```

The `getPublicKey` response `key` field is a Base64 SubjectPublicKeyInfo. If it
lacks PEM line breaks, wrap it:

```javascript
function toPem(key) {
  if (key.includes('BEGIN PUBLIC KEY')) {
    return key
      .replace('-----BEGIN PUBLIC KEY-----', '-----BEGIN PUBLIC KEY-----\n')
      .replace('-----END PUBLIC KEY-----', '\n-----END PUBLIC KEY-----');
  }
  return `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
}
```

### Verifying (manual)

**Node.js:**

```javascript
const crypto = require('crypto');

async function verifyEbaySignature(rawBody, signatureHeader, getPublicKey) {
  if (!signatureHeader) return false;
  let sig;
  try { sig = JSON.parse(Buffer.from(signatureHeader, 'base64').toString('utf8')); }
  catch { return false; }
  if (!sig.kid || !sig.signature) return false;

  let pem;
  try { pem = await getPublicKey(sig.kid); } catch { return false; }

  const verifier = crypto.createVerify('sha1'); // ECDSA + SHA-1
  verifier.update(rawBody);                     // raw body bytes
  verifier.end();
  try { return verifier.verify(pem, sig.signature, 'base64'); }
  catch { return false; }
}
```

**Python (`cryptography`):**

```python
import base64, json
from cryptography.hazmat.primitives.serialization import load_pem_public_key
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes
from cryptography.exceptions import InvalidSignature

def verify_ebay_signature(raw_body: bytes, signature_header: str, get_public_key) -> bool:
    if not signature_header:
        return False
    try:
        sig = json.loads(base64.b64decode(signature_header))
    except Exception:
        return False
    kid, signature_b64 = sig.get("kid"), sig.get("signature")
    if not kid or not signature_b64:
        return False
    try:
        pem = get_public_key(kid)
        public_key = load_pem_public_key(pem.encode())
        public_key.verify(
            base64.b64decode(signature_b64),
            raw_body,                       # raw body bytes
            ec.ECDSA(hashes.SHA1()),        # ECDSA + SHA-1
        )
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False
```

## Official SDK (Node.js)

eBay maintains [`event-notification-nodejs-sdk`](https://github.com/eBay/event-notification-nodejs-sdk),
which implements exactly the two mechanisms above:

```javascript
const EventNotificationSDK = require('event-notification-nodejs-sdk');

// POST — verify signature and dispatch by topic. Resolves with an HTTP status:
//   204 success, 412 signature mismatch, 500 error.
EventNotificationSDK.process(req.body, req.headers['x-ebay-signature'], config, environment);

// GET — build the challenge response string.
const challengeResponse = EventNotificationSDK.validateEndpoint(req.query.challenge_code, config);
```

`config` holds per-environment `clientId` / `clientSecret` / `devId` /
`redirectUri` / `baseUrl`, plus top-level `endpoint` and `verificationToken`.

The examples in this skill use the **manual** implementation instead because it
is testable offline: the SDK's signature path makes a live OAuth + `getPublicKey`
call that cannot run in CI without credentials. In production, either approach is
valid — the crypto is identical.

> **Note on the signed content:** eBay's Node SDK verifies over
> `JSON.stringify(parsedBody)` and its Java SDK re-serialises with Jackson, so
> the signed bytes are the compact JSON eBay sends. The examples verify the raw
> request body, which is the same bytes while eBay sends compact JSON; don't
> pretty-print or reorder the body before verifying.

## Common Gotchas

- **Challenge hash order is strict:** `challengeCode + verificationToken +
  endpoint`. Any other order fails endpoint validation.
- **`endpoint` must match exactly** — the same scheme/host/path eBay calls,
  including through a tunnel. `localhost` will not match the registered URL.
- **Verify the raw body**, not a parsed-then-re-stringified object. Use
  `express.raw()` / `await request.text()` / `await request.body()`.
- **Digest is SHA-1**, not SHA-256, for the notification signature (SHA-256 is
  only for the challenge).
- **Cache the public key ~1 hour** keyed by `kid` — but not forever; eBay
  rotates keys, signalled by a new `kid`.
- **Return 2xx (204)** promptly. Persistent failures can get your destination
  marked down; for account deletion, eBay marks the URL down after 24 hours of
  unacknowledged notifications.
- **Idempotency:** deduplicate on `notification.notificationId`; eBay may retry.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Endpoint save fails immediately | Wrong challenge hash order, wrong `endpoint` string, or not returning `200` + `{"challengeResponse": ...}` |
| Every signature fails | Verifying parsed JSON instead of raw body, or using SHA-256 instead of SHA-1 |
| Intermittent signature failures | Public key cache stale after a key rotation — evict on new `kid` |
| `getPublicKey` returns 401/403 | OAuth token missing/expired, or wrong `EBAY_ENV` host for the keyset |
| Signature fails only in one framework | Body was mutated by a JSON body parser before verification |
