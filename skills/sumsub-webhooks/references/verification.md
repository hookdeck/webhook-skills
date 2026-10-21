# How to Verify Sumsub Webhook Signatures

## How Does Sumsub Sign Webhooks?

Sumsub computes an HMAC over the **raw request body bytes**, keyed with the webhook's **Secret key**, and sends it **hex-encoded** in the `x-payload-digest` header. The hash function is chosen per webhook and announced in `x-payload-digest-alg`:

| `x-payload-digest-alg` | Hash | Hex digest length |
|------------------------|------|-------------------|
| `HMAC_SHA256_HEX` | SHA-256 | 64 |
| `HMAC_SHA512_HEX` | SHA-512 | 128 |
| `HMAC_SHA1_HEX` | SHA-1 (legacy, deprecated) | 40 |

There is no timestamp, no signed-content prefix, and no Standard Webhooks (`webhook-id` / `webhook-signature`) headers. Verification is optional on Sumsub's side, but the webhook only gets a digest if it has a secret key.

Steps from Sumsub's docs:

1. Read `x-payload-digest` and the body exactly as received, without converting it to JSON.
2. Compute the HMAC of the raw body bytes with the algorithm from `x-payload-digest-alg`.
3. Compare the result with `x-payload-digest`.

## Implementation

Sumsub has no SDK helper for webhook verification, so verify manually in every framework.

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

const DIGEST_ALGORITHMS = {
  HMAC_SHA1_HEX: 'sha1',
  HMAC_SHA256_HEX: 'sha256',
  HMAC_SHA512_HEX: 'sha512',
};

function verifySumsubWebhook(rawBody, digest, digestAlg, secret) {
  if (!digest || !secret) return false;

  // An absent alg header means SHA256; an unknown value is rejected
  const algorithm = DIGEST_ALGORITHMS[digestAlg || 'HMAC_SHA256_HEX'];
  if (!algorithm) return false;

  const expected = crypto.createHmac(algorithm, secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest.trim().toLowerCase()),
      Buffer.from(expected)
    );
  } catch {
    return false; // different lengths
  }
}
```

- **Express**: mount `express.raw({ type: '*/*' })` on the route so `req.body` is a `Buffer`.
- **Next.js App Router**: `Buffer.from(await request.arrayBuffer())`, and read headers with `request.headers.get('x-payload-digest')`.

### Python (FastAPI)

```python
import hashlib
import hmac

DIGEST_ALGORITHMS = {
    "HMAC_SHA1_HEX": hashlib.sha1,
    "HMAC_SHA256_HEX": hashlib.sha256,
    "HMAC_SHA512_HEX": hashlib.sha512,
}


def verify_sumsub_webhook(raw_body: bytes, digest: str | None, digest_alg: str | None, secret: str | None) -> bool:
    if not digest or not secret:
        return False
    algorithm = DIGEST_ALGORITHMS.get(digest_alg or "HMAC_SHA256_HEX")
    if algorithm is None:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, algorithm).hexdigest()
    return hmac.compare_digest(digest.strip().lower(), expected)
```

Use `raw_body = await request.body()` before any JSON parsing.

## Common Gotchas

- **Hard-coding SHA256.** Older webhooks with no explicit algorithm silently use `HMAC_SHA1_HEX`. Always switch on `x-payload-digest-alg`.
- **Header casing in Node.js.** Node lowercases incoming header names. `req.headers['X-Payload-Digest-Alg']` (as in Sumsub's own JS sample) is always `undefined`; use `req.headers['x-payload-digest-alg']`.
- **Parsed or re-serialised body.** `JSON.stringify(req.body)` or `json.dumps(payload)` changes whitespace and key order, so the digest won't match. Verify the raw bytes.
- **Non-constant-time compare.** Sumsub's samples use `===` / `==`. Use `crypto.timingSafeEqual` / `hmac.compare_digest` instead.
- **Wrong secret.** Each webhook has its own secret key. A digest that never matches for one event type usually means that webhook has a different key.
- **Missing alg header.** The examples treat an absent `x-payload-digest-alg` as `HMAC_SHA256_HEX` (the current default) and reject unknown values, which matches the Hookdeck Sumsub source.

## Which Status Code to Return on Failure

Return **400** for a missing or invalid digest. Sumsub treats **401, 403 and 404 as permanent failures** and doesn't retry them. With 400, a rotated or mistyped secret still leaves you the retry window (up to ~24 hours) to fix the key before deliveries are lost.

## How to Debug Verification Failures

1. Log `x-payload-digest-alg` and the length of `x-payload-digest` (40, 64 or 128 hex characters for SHA1, SHA256 or SHA512).
2. Confirm the body is a `Buffer` / `bytes` and not a parsed object.
3. Recompute locally with the same raw bytes:
   ```bash
   printf '%s' "$RAW_BODY" | openssl dgst -sha256 -hmac "$SUMSUB_WEBHOOK_SECRET"
   ```
4. Sumsub's `POST /resources/inspectionCallbacks/testDigest?secretKey=…&digestAlg=HMAC_SHA256_HEX` API endpoint (authenticated with your app token) returns the digest Sumsub would compute for a given body.
5. Click **Test webhook** in the Webhook manager. Test deliveries are signed like production ones.

## Using Hookdeck

The Hookdeck Event Gateway has a Sumsub source type that verifies `x-payload-digest` (SHA1/SHA256/SHA512 from `x-payload-digest-alg`) before forwarding. You can then verify Hookdeck's own signature in your handler instead, or keep verifying Sumsub's digest on the forwarded raw body.
