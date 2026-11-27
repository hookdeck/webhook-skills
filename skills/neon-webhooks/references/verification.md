# How to Verify Neon Auth Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is a public URL. Without verification, anyone could POST a fake
`user.created` (or approve a `user.before_create`) and manipulate your system. Verifying
the signature proves the request genuinely came from Neon Auth and was not tampered with.

## How It Works

Neon Auth signs each webhook with **EdDSA (Ed25519)** as a **detached JWS**. This is an
**asymmetric** scheme — Neon signs with a private key, and you verify with the matching
**public key** from the JWKS. **There is no shared secret**, and this is **not** Svix and
**not** HMAC. Do **not** install `svix` or force-fit an HMAC template.

The signature travels in `X-Neon-Signature` as a **detached JWS** with an empty payload
section:

```
<protected-header-b64url>..<signature-b64url>
```

(The middle section between the two dots is intentionally **empty** — the payload is
"detached" and reconstructed by you from the request.)

### The critical gotcha: double base64url encoding

A naive `` `${timestamp}.${body}` `` reconstruction will **always fail**. The JWS signing
input is built with **two** layers of base64url encoding:

```
payloadB64          = base64url(rawRequestBody)
signaturePayload    = timestamp + "." + payloadB64        # timestamp = X-Neon-Timestamp (ms)
signaturePayloadB64 = base64url(signaturePayload)
signingInput        = protectedHeaderB64 + "." + signaturePayloadB64
```

Then verify the Ed25519 signature (base64url-decoded from the third JWS segment) against
`signingInput` using the public key.

### Verification steps

1. Fetch the JWKS from `${NEON_AUTH_URL}/.well-known/jwks.json` and select the key whose
   `kid` matches the `X-Neon-Signature-Kid` header. **Cache keys by `kid`.**
2. Split `X-Neon-Signature` on `.` into `[header, "", signature]`; confirm the middle
   section is empty (detached JWS).
3. Reconstruct `signingInput` with the **double base64url** encoding shown above, using
   the **raw** request body bytes and `X-Neon-Timestamp` (milliseconds).
4. Verify the Ed25519 signature against `signingInput` with the JWKS public key.
5. Enforce a timestamp tolerance (e.g. 5 minutes) against `X-Neon-Timestamp` to block
   replays.

## Implementation

There is **no off-the-shelf SDK** for this scheme. Verify with a standard Ed25519 / JWS
crypto library: `node:crypto` in Node, or `cryptography` (or PyJWT) in Python.

### Node.js (manual, `node:crypto`)

```javascript
import crypto from 'node:crypto';

const jwksCache = new Map(); // kid -> KeyObject

async function getPublicKey(kid, jwksUrl) {
  if (jwksCache.has(kid)) return jwksCache.get(kid);
  const jwks = await fetch(jwksUrl).then((r) => r.json());
  const jwk = jwks.keys.find((k) => k.kid === kid);
  if (!jwk) throw new Error(`Key ${kid} not found in JWKS`);
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  jwksCache.set(kid, key);
  return key;
}

async function verifyNeonWebhook(rawBody, headers, jwksUrl, toleranceMs = 5 * 60 * 1000) {
  const signature = headers['x-neon-signature'];
  const kid = headers['x-neon-signature-kid'];
  const timestamp = headers['x-neon-timestamp'];
  if (!signature || !kid || !timestamp) throw new Error('Missing Neon signature headers');

  const [headerB64, emptyPayload, signatureB64] = signature.split('.');
  if (emptyPayload !== '') throw new Error('Expected detached JWS (header..signature)');

  const publicKey = await getPublicKey(kid, jwksUrl);

  // Double base64url encoding
  const payloadB64 = Buffer.from(rawBody, 'utf8').toString('base64url');
  const inner = `${timestamp}.${payloadB64}`;
  const signingInput = `${headerB64}.${Buffer.from(inner, 'utf8').toString('base64url')}`;

  const ok = crypto.verify(null, Buffer.from(signingInput), publicKey,
    Buffer.from(signatureB64, 'base64url'));
  if (!ok) throw new Error('Invalid signature');

  if (Date.now() - parseInt(timestamp, 10) > toleranceMs) {
    throw new Error('Timestamp too old');
  }
  return JSON.parse(rawBody);
}
```

### Python (manual, `cryptography`)

```python
import base64, json, time
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.exceptions import InvalidSignature

def _b64url_decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))

def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")

def verify_neon_webhook(raw_body: bytes, headers, jwks, tolerance_ms=5 * 60 * 1000):
    signature = headers["x-neon-signature"]
    kid = headers["x-neon-signature-kid"]
    timestamp = headers["x-neon-timestamp"]

    header_b64, empty, signature_b64 = signature.split(".")
    if empty != "":
        raise ValueError("Expected detached JWS (header..signature)")

    jwk = next((k for k in jwks["keys"] if k["kid"] == kid), None)
    if jwk is None:
        raise ValueError(f"Key {kid} not found in JWKS")
    public_key = Ed25519PublicKey.from_public_bytes(_b64url_decode(jwk["x"]))

    # Double base64url encoding
    payload_b64 = _b64url_encode(raw_body)
    inner = f"{timestamp}.{payload_b64}"
    signing_input = f"{header_b64}.{_b64url_encode(inner.encode())}"

    try:
        public_key.verify(_b64url_decode(signature_b64), signing_input.encode())
    except InvalidSignature:
        raise ValueError("Invalid signature")

    if int(time.time() * 1000) - int(timestamp) > tolerance_ms:
        raise ValueError("Timestamp too old")
    return json.loads(raw_body)
```

## Common Gotchas

- **Double base64url**: the payload is base64url-encoded, joined with the timestamp,
  then base64url-encoded **again**. Skipping the second layer fails verification.
- **Raw body**: verify the exact raw bytes. Do not `JSON.parse` / re-serialize first —
  key order and whitespace changes invalidate the signature.
- **Milliseconds**: `X-Neon-Timestamp` is in **milliseconds**, not seconds. Compare
  against `Date.now()` / `time.time() * 1000`.
- **Empty middle section**: the JWS is *detached* — `header..signature`. The empty part
  between the dots is expected; a non-empty middle section means it isn't detached JWS.
- **Wrong key**: always select the JWK by `kid` from `X-Neon-Signature-Kid`; JWKS may
  contain multiple keys during rotation. Cache by `kid`.
- **Neon Functions endpoint**: Neon strips client-set `X-Neon-*` headers from requests
  to functions. Read the `Neon-Better-Auth-Signature`, `Neon-Better-Auth-Signature-Kid`
  and `Neon-Better-Auth-Timestamp` copies instead.
- **No secret / no Svix**: don't look for a `whsec_` secret or use the `svix` package —
  this scheme is public-key only.

## How to Debug Verification Failures

- **Always "Invalid signature"** → you likely skipped the second base64url layer, or
  parsed/re-serialized the body instead of using raw bytes.
- **"Key not found in JWKS"** → wrong `NEON_AUTH_URL`, or you cached a stale key across a
  rotation; re-fetch the JWKS.
- **"Timestamp too old"** → clock skew, or you compared seconds against a millisecond
  timestamp (or vice versa).
- **Works locally, fails behind a proxy** → a proxy/body parser re-encoded the payload;
  ensure the raw body reaches your verifier untouched.
