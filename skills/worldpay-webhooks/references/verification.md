# How to Verify Worldpay Webhook Signatures

## How Does Worldpay Sign Access Events?

Access Worldpay event webhooks use a symmetric HMAC in one custom header. There is no timestamp, no nonce, no asymmetric key and no field concatenation. The scheme is documented on the [Event-Signature page](https://docs.worldpay.com/access/products/events/signature). Account Payouts and Hosted Payment Pages webhooks use the same header.

| | |
|---|---|
| Header | `Event-Signature` |
| Format | `{keyId}/{hashFunction}/{signature}`, with several entries comma-separated during key renewal |
| `keyId` | Numeric reference to the shared secret that signed the message (the docs' example uses `1`) |
| `hashFunction` | `SHA256`, the only value Worldpay supports today |
| `signature` | **Hex** HMAC-SHA256 of the raw request body. The Account Payouts version of the page calls it "hex output" |
| Signed content | The raw request body bytes, exactly as received. No URL, method, headers or timestamp |
| Key | The per-merchant **shared secret** for that `keyId`, used as a UTF-8 string. It is not your Access Worldpay API username or password |

Example header during a renewal:

```
Event-Signature: 1/SHA256/6f1c...e2a9,2/SHA256/b04d...71c3
```

## Implementation

The examples implement the HMAC with the standard library, with no Worldpay SDK dependency. The docs describe the scheme, not a client library, so this is the normal path.

### Node.js

```javascript
const crypto = require('crypto');

// secrets: Map of keyId -> shared secret, from WORLDPAY_WEBHOOK_SECRET_<keyId>
function verifyWorldpaySignature(rawBody, header, secrets) {
  if (typeof header !== 'string') return false;
  for (const entry of header.split(',')) {
    const parts = entry.trim().split('/');
    if (parts.length !== 3) continue;                 // malformed: skip, don't throw
    const [keyId, hashFunction, signature] = parts;
    const secret = secrets.get(keyId);
    if (hashFunction.toUpperCase() !== 'SHA256' || !secret) continue;
    const expected = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'));
    const received = Buffer.from(signature.toLowerCase());
    if (received.length === expected.length && crypto.timingSafeEqual(received, expected)) {
      return true;                                    // ANY entry verifying is enough
    }
  }
  return false;
}
```

### Python

```python
import hashlib, hmac

def verify_worldpay_signature(raw_body: bytes, header: str | None, secrets: dict[str, str]) -> bool:
    for entry in (header or "").split(","):
        parts = [p.strip() for p in entry.strip().split("/")]
        if len(parts) != 3:
            continue
        key_id, hash_function, signature = parts
        secret = secrets.get(key_id)
        if hash_function.upper() != "SHA256" or not secret:
            continue
        expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
        if hmac.compare_digest(signature.lower().encode(), expected.encode()):
            return True
    return False
```

The example handlers add two refinements: they compute each `(keyId, hashFunction)` digest once, because the header is attacker-controlled and could repeat an entry hundreds of times, and they skip entries with empty fields.

## Why Does the keyId Matter? (Key Renewal)

"Due to our security policies, the key we use for generating HMAC signatures is subject to periodic renewal." While a renewal runs, each request carries **two** signatures, one per key, in no fixed order. The docs tell you to always use the keyId.

- Keep a **keyId → secret map**. The examples read it from `WORLDPAY_WEBHOOK_SECRET_<keyId>` env vars on every request.
- Try every entry, look up each secret by its own keyId, and accept the request if **any** entry verifies.
- Never test a signature against a secret held under a different keyId. A valid key-1 signature labelled as keyId 2 must fail.
- Skip entries whose keyId you don't hold, and entries whose `hashFunction` you don't support. Don't map an unknown hash function to a guess.
- When the renewal finishes, remove the old secret.

## What Status Code Do I Return on Failure?

Worldpay's contract: if you're set up for HMAC and the signature is missing, return `400`. If it doesn't match, discard the body and return `400`. The examples follow this and return `400`, not `401` or `403`, for a missing header, a mismatch, a tampered body and a malformed header.

If no secret is configured at all, the examples return `500` and log the problem. They fail closed instead of skipping verification, and they don't crash at import time.

## Is Signing Always On?

No. Signing is **opt-in**. Until your Implementation Manager enables the `Event-Signature` header, Worldpay sends events unsigned. The examples reject unsigned requests, so enable signing before you go live. Until then, rely on the source IP allowlist and the client certificate check described in [setup.md](setup.md#what-else-protects-the-endpoint-defence-in-depth).

## Common Gotchas

- **Raw body is mandatory.** A JSON parse and re-serialise changes the bytes: whitespace, key order and number formatting.
- **The Content-Type defeats JSON parsers.** Deliveries use `application/vnd.worldpay.events-v1.hal+json`. `express.json()` doesn't match it and leaves `req.body` empty. Use `express.raw({ type: '*/*' })` on the route in Express, `await request.text()` in Next.js, and `await request.body()` in FastAPI.
- **Hex, not base64.** A SHA-256 hex digest is 64 characters. Compare lower-case on both sides, because the docs never promise a case.
- **Send the whole entry format.** A bare digest without `{keyId}/SHA256/` doesn't verify.
- **Use the dedicated shared secret.** The API username and password for the Access Worldpay REST APIs won't verify anything.
- **No timestamp, no replay window.** Don't invent a tolerance check. Replay protection comes from **deduplicating on `eventId`**, which retries reuse.
- **Constant-time comparison.** Use `crypto.timingSafeEqual` after a length check (it throws on a length mismatch) or `hmac.compare_digest`.
- **WPG XML notifications are never signed.** Don't run this verifier on `<paymentService>` notifications. Their trust comes from the TLS client certificate and reverse DNS, and they need `200` with the literal body `[OK]`.
- **CSRF middleware** will reject deliveries. Exempt the route.

## Debugging Verification Failures

| Symptom | Likely cause | Fix |
|---|---|---|
| Every POST returns 400 "Invalid signature" | Body parsed before hashing | Hash the raw bytes |
| Empty `req.body` in Express | `express.json()` ignored the vendor Content-Type | `express.raw({ type: '*/*' })` on the route |
| 400 "Missing Event-Signature header" | Signing not enabled yet | Ask your Implementation Manager to enable `Event-Signature` |
| Verification breaks partway through a key renewal | Single secret, keyId ignored | Look up the secret by keyId and hold both keys during the renewal |
| Nothing verifies with the API credentials | Wrong secret | Use the `Event-Signature` shared secret |
| 500 on a malformed header | `timingSafeEqual` length mismatch | Check lengths first (the examples do) |

Compute a signature by hand to compare:

```bash
printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WORLDPAY_WEBHOOK_SECRET_1" | awk '{print $NF}'
```

Log the keyIds present and whether the check passed. Don't log the body or the secret.
