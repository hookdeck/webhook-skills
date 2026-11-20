# How to Verify Recharge Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is a public URL. Verifying the signature proves the request genuinely came from
Recharge and that the body was not tampered with in transit. Reject any request that fails
verification with a `4xx` status before acting on it.

## Two Signature Schemes

Every webhook delivery includes **two signature schemes**: a **recommended timestamp-bound scheme**
that Recharge encourages for all new integrations, and a **legacy body-only scheme** that remains
supported for backward compatibility. Verify the timestamp-bound scheme when its header is present;
fall back to the legacy header only when it is absent.

## Recommended: Timestamp-Bound Scheme

Two headers accompany each delivery:

| Header | Description |
|--------|-------------|
| `X-Recharge-Webhook-Timestamp` | Unix epoch seconds (integer) at the time the request was signed |
| `X-Recharge-Webhook-Signature` | Comma-separated key/value pairs in the form `t=<epoch>,v1=<hex>`. Future schemes may add `v2=…` |

### Verification steps

1. **Parse the signature header** into key/value pairs and extract `t` (the epoch timestamp, which
   matches the timestamp header) and `v1` (the hex signature). Parse by key — future schemes may add
   `v2=…`.
2. **Enforce the replay window**: reject the delivery if `abs(now - t) > 172800` seconds (48 hours).
3. **Build the signing input**: `"<timestamp>.<payload_json>"` — the timestamp, a literal dot, then
   the **exact raw JSON bytes as transmitted**. Re-serializing the parsed body breaks verification.
4. **Compute HMAC-SHA-256** over that input, keyed by the **API Client Secret**, hex-encoded.
5. **Compare** the digest to `v1` with a constant-time comparison.

### Node.js

```javascript
const crypto = require('crypto');

function verifyRechargeWebhookTimestamped(rawBody, signatureHeader, clientSecret) {
  if (!signatureHeader) return false;

  // Parse `t=<epoch>,v1=<hex>` by key (future schemes may add v2=...).
  const parts = {};
  for (const pair of signatureHeader.split(',')) {
    const [key, value] = pair.split('=');
    if (key && value) parts[key.trim()] = value.trim();
  }
  const timestamp = parseInt(parts.t, 10);
  if (!Number.isFinite(timestamp) || !parts.v1) return false;

  // Reject the delivery if abs(now - t) > 48 hours (replay protection).
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 172800) return false;

  // HMAC-SHA-256 over "<timestamp>.<raw body>", keyed by the client secret.
  const digest = crypto
    .createHmac('sha256', clientSecret)
    .update(`${timestamp}.`)   // timestamp + literal dot
    .update(rawBody)           // exact raw body bytes (Buffer or string)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(parts.v1));
  } catch {
    return false; // length mismatch = invalid
  }
}
```

### Python

```python
import hashlib
import hmac
import time

def verify_recharge_webhook_timestamped(raw_body: bytes, signature_header: str, client_secret: str) -> bool:
    if not signature_header:
        return False

    # Parse `t=<epoch>,v1=<hex>` by key (future schemes may add v2=...).
    parts = {}
    for pair in signature_header.split(","):
        key, _, value = pair.partition("=")
        if key and value:
            parts[key.strip()] = value.strip()
    timestamp, signature = parts.get("t", ""), parts.get("v1", "")
    if not timestamp.isdigit() or not signature:
        return False

    # Reject the delivery if abs(now - t) > 48 hours (replay protection).
    if abs(int(time.time()) - int(timestamp)) > 172800:
        return False

    # HMAC-SHA-256 over "<timestamp>.<raw body>", keyed by the client secret.
    digest = hmac.new(
        client_secret.encode("utf-8"),
        f"{timestamp}.".encode("utf-8") + raw_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(digest, signature)
```

## Legacy: Body-Only Scheme (the big gotcha)

For backward compatibility, every webhook also includes the legacy **`X-Recharge-Hmac-Sha256`**
header. New integrations should use the timestamp-bound scheme above.

Despite the header being named `X-Recharge-Hmac-Sha256`, **the legacy scheme does not use HMAC**. The
signature is a plain **SHA-256** hash of the **API Client Secret concatenated directly with the raw
request body**, with the **secret placed first**, then hex-encoded:

```
signature = SHA256( client_secret + raw_request_body )   // hex-encoded
```

This is the single most common source of Recharge legacy verification failures — people reach for
`crypto.createHmac(...)` / `hmac.new(...)` and never match. Use a plain hash and **prepend the secret**.

Recharge's own documented Python example makes the construction explicit:

```python
import hashlib

def is_webhook_valid(client_secret, request_body, webhook_hmac):
    calculated = hashlib.sha256()
    calculated.update(client_secret.encode("UTF-8"))  # secret first
    calculated.update(request_body.encode("UTF-8"))   # then the raw body
    return calculated.hexdigest() == webhook_hmac
```

> The docs stress byte-exactness: "validation will fail even if one space is lost." Always hash the
> **raw** request body bytes, never a re-serialized/parsed version. (This applies to **both**
> schemes.)

### Node.js

```javascript
const crypto = require('crypto');

function verifyRechargeWebhookLegacy(rawBody, signatureHeader, clientSecret) {
  if (!signatureHeader) return false;
  // Plain SHA-256 of (clientSecret + rawBody). NOT HMAC. Secret is prepended.
  const digest = crypto
    .createHash('sha256')
    .update(clientSecret)   // secret first
    .update(rawBody)        // then the raw body (Buffer or string)
    .digest('hex');
  try {
    // Timing-safe compare; throws on length mismatch, which we treat as invalid.
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}
```

### Python

```python
import hashlib
import hmac  # only for compare_digest (constant-time comparison)

def verify_recharge_webhook_legacy(raw_body: bytes, signature_header: str, client_secret: str) -> bool:
    if not signature_header:
        return False
    # Plain SHA-256 of (client_secret + raw_body). NOT HMAC. Secret is prepended.
    digest = hashlib.sha256(client_secret.encode("utf-8") + raw_body).hexdigest()
    return hmac.compare_digest(digest, signature_header)
```

## Combining the Two Schemes

There is **no official Recharge SDK for webhook verification** — `@rechargeapps/storefront-client`
covers only the Storefront API. Verify manually in every framework:

```javascript
const verified = timestampedSignatureHeader
  ? verifyRechargeWebhookTimestamped(rawBody, timestampedSignatureHeader, clientSecret)
  : verifyRechargeWebhookLegacy(rawBody, legacySignatureHeader, clientSecret);
```

Do **not** fall back to the legacy header when the timestamp-bound header is present but fails —
treat that as a failed verification.

## Common Gotchas

### 1. The legacy scheme is NOT HMAC

Using `crypto.createHmac('sha256', secret)` (Node) or `hmac.new(secret, body, sha256)` (Python)
against the legacy `X-Recharge-Hmac-Sha256` header will **never** match. Use a plain SHA-256 hash and
concatenate the secret in front of the body. (The **timestamp-bound** scheme, by contrast, IS a real
HMAC-SHA-256 — don't mix the two constructions up.)

### 2. Secret goes first (legacy)

The legacy order is `secret + body`, not `body + secret`. Reversing it fails.

### 3. Use the raw body (both schemes)

Compute the hash over the exact bytes Recharge sent. If you let your framework parse the JSON and then
re-serialize it, key ordering and whitespace change and the hash won't match.

- **Express:** mount `express.raw({ type: 'application/json' })` on the route and hash `req.body`
  (a `Buffer`). Do not apply `express.json()` to this route.
- **Next.js App Router:** read `await request.text()` and hash that string. Do not `await request.json()`
  first.
- **FastAPI:** read `await request.body()` (bytes) and hash that. Do not use a Pydantic model / parsed body.

### 4. Don't forget the dot (timestamp-bound)

The signing input is `<timestamp>.<payload_json>` — timestamp, **literal dot**, raw body. Signing the
body alone, or concatenating without the dot, fails.

### 5. Enforce the replay window (timestamp-bound)

Reject deliveries where `abs(now - t) > 172800` seconds (48 hours). A valid signature with a stale
timestamp is a replay.

### 6. Hex, not base64

Both digests are hex-encoded (64 lowercase hex characters). Don't `.digest('base64')`.

### 7. Client Secret, not access token

Both schemes use the **API Client Secret** from your API token's settings (Recharge Dashboard →
Integrations → API Tokens → click your token → Edit API Token page) — not the
`X-Recharge-Access-Token` value you use to call the API.

### 8. Use a constant-time comparison

Compare with `crypto.timingSafeEqual` (Node) or `hmac.compare_digest` (Python) to avoid timing attacks.
A plain `===` / `==` leaks information about how many characters matched.

## Debugging Verification Failures

```javascript
// Timestamp-bound scheme
const [t, v1] = [parts.t, parts.v1];
const digest = crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex');
console.log('Body is Buffer:', Buffer.isBuffer(rawBody));
console.log('Timestamp age (s):', Math.floor(Date.now() / 1000) - Number(t));
console.log('Computed:', digest);
console.log('Received:', v1);
console.log('Match:', digest === v1);
```

If they don't match, check, in order: (1) you parsed `t` and `v1` from the signature header, not the
whole header value; (2) the signing input is `<timestamp>.<raw body>` with the literal dot; (3) you're
hashing the raw body, not parsed-then-reserialized JSON; (4) the key is the **API Client Secret**;
(5) output is hex; (6) the timestamp is within 48 hours.

For the legacy scheme:

```javascript
const digest = crypto.createHash('sha256').update(secret).update(rawBody).digest('hex');
console.log('Computed:', digest);
console.log('Received:', signatureHeader);
```

If they don't match, check, in order: (1) you're using a plain hash, not HMAC; (2) the secret is
prepended, not appended; (3) you're hashing the raw body; (4) the secret is the **API Client Secret**;
(5) output is hex.

## Full Documentation

- [Webhooks (API reference)](https://developer.rechargepayments.com/2021-11/webhooks_endpoints)
- [Validating webhooks](https://docs.getrecharge.com/docs/webhooks-overview#validating-webhooks)
