# How to Verify Chatbase Webhook Signatures

## Why Signature Verification Matters

Anyone who learns your endpoint URL can `POST` to it. Checking the signature proves the request came from Chatbase and that the body was not changed. For the HIPAA webhook it is also required: Chatbase will not deliver conversations until your endpoint has shown that it rejects a forged request.

## How It Works

Chatbase uses two schemes. Neither has an official SDK helper, so verify manually in every language.

### Event webhooks (`leads.submit`, `phone_call.summary`, custom forms, Collect Data)

| Item | Value |
|------|-------|
| Header | `x-chatbase-signature` |
| Algorithm | HMAC-SHA1 |
| Signed content | The raw request body, nothing else |
| Encoding | Lowercase hex, no prefix (40 characters) |
| Timestamp | None, so there is no replay window to check |

```
x-chatbase-signature = hex(HMAC_SHA1(secret, rawBody))
```

### HIPAA conversation webhook (`conversation.deleted`)

| Item | Value |
|------|-------|
| Headers | `X-Chatbase-Signature`, `X-Chatbase-Timestamp`, `X-Chatbase-Delivery-Id` |
| Algorithm | HMAC-SHA256 |
| Signed content | `timestamp + "." + rawBody` |
| Encoding | `v1=` + lowercase hex |
| Key | The 64-character hex signing secret, used as-is as a UTF-8 string (do not hex-decode it) |
| Replay window | Reject timestamps more than about 5 minutes from now |

```
X-Chatbase-Signature = "v1=" + hex(HMAC_SHA256(secret, timestamp + "." + rawBody))
```

Compare the whole header value, `v1=` prefix included.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function verifyChatbaseSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
  return safeEqual(signature, expected);
}

function verifyChatbaseHipaaSignature(rawBody, signature, timestamp, secret) {
  if (!signature || !timestamp) return { ok: false, error: 'missing_headers' };
  if (!secret) return { ok: false, error: 'invalid_signature' };
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!/^\d+$/.test(timestamp) || !Number.isFinite(age) || age > 300) return { ok: false, error: 'stale_timestamp' };
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${timestamp}.`);
  hmac.update(rawBody);
  return safeEqual(signature, `v1=${hmac.digest('hex')}`)
    ? { ok: true }
    : { ok: false, error: 'invalid_signature' };
}
```

### Python

```python
import hashlib, hmac, re, time

def verify_chatbase_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha1).hexdigest()
    return hmac.compare_digest(signature.encode(), expected.encode())

def verify_chatbase_hipaa_signature(raw_body: bytes, signature: str, timestamp: str, secret: str):
    if not signature or not timestamp:
        return "missing_headers"
    if not secret:
        return "invalid_signature"
    if not re.fullmatch(r"\d+", timestamp) or abs(time.time() - int(timestamp)) > 300:
        return "stale_timestamp"
    expected = "v1=" + hmac.new(secret.encode(), f"{timestamp}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return None if hmac.compare_digest(signature.encode(), expected.encode()) else "invalid_signature"
```

### Reading the raw body

| Framework | Raw body |
|-----------|----------|
| Express | `express.raw({ type: '*/*' })` on the webhook route, not `express.json()` |
| Next.js App Router | `await request.text()`, not `request.json()` |
| Next.js Pages Router | `export const config = { api: { bodyParser: false } }` plus `raw-body` |
| FastAPI | `await request.body()` |
| Flask | `request.get_data()` |

## Common Gotchas

- **Chatbase's Express sample is wrong about the body.** It verifies `JSON.stringify(req.body)` after `express.json()`. Re-serializing changes whitespace, key order and Unicode escaping, so the HMAC stops matching. Hash the bytes you received.
- **Wrong algorithm for the webhook type.** Event webhooks are SHA-1 with no prefix; the HIPAA webhook is SHA-256 with `v1=` and a timestamp. Code written for one fails on the other.
- **Using `===` to compare.** Chatbase's sample does this; use `crypto.timingSafeEqual` or `hmac.compare_digest`. `timingSafeEqual` throws when lengths differ, so check length first.
- **HIPAA: timestamp from your own clock.** Read it from `X-Chatbase-Timestamp`; the signed input uses that exact string.
- **HIPAA: early 2xx.** If any middleware or health check returns 200 before the signature check, endpoint verification fails with `accepted_invalid_signature`.
- **HIPAA: storing the probes.** Verification requests carry `"test": true`. Acknowledge the valid one and do not save it as a real conversation.
- **Trailing whitespace in the secret.** A newline pasted into `.env` changes every digest.

## Debugging Verification Failures

1. Log the header you received and the digest you computed (never the secret).
2. Confirm the digest length: 40 hex characters for event webhooks, `v1=` + 64 for HIPAA.
3. Recompute with OpenSSL against the exact captured body:
   ```bash
   # Event webhook
   printf '%s' "$RAW_BODY" | openssl dgst -sha1 -hmac "$CHATBASE_WEBHOOK_SECRET"
   # HIPAA webhook
   printf '%s' "$TS.$RAW_BODY" | openssl dgst -sha256 -hmac "$CHATBASE_HIPAA_WEBHOOK_SECRET"
   ```
4. If OpenSSL matches but your code does not, your framework is changing the body before you hash it.
5. HIPAA verification failure reasons shown in the dashboard: `rejected_signed_request` (your endpoint rejected the valid probe, usually a raw-body problem), `accepted_invalid_signature` (you are not checking signatures), `redirect`, `timeout` (10 seconds), `dns`, `refused`.

## Status Codes

Return `200` once a request is verified and accepted. Return `400` for missing headers, a stale timestamp, an invalid signature, or invalid JSON. Chatbase's docs use `400` for event webhooks; for the HIPAA webhook any non-2xx counts as a rejection (Chatbase's own sample uses `401`).
