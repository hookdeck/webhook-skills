# How to Verify Chatbase Webhook Signatures

## Why Signature Verification Matters

Anyone who learns your endpoint URL can `POST` to it. Checking the signature proves the request came from Chatbase and that the body wasn't changed. Chatbase's guide recommends it.

## How It Works

| Item | Value |
|------|-------|
| Header | `x-chatbase-signature` |
| Algorithm | HMAC-SHA1 |
| Signed content | The raw request body, nothing else |
| Encoding | Hex, no prefix (40 characters) |
| Timestamp | None, so there's no replay window to check |

```
x-chatbase-signature = hex(HMAC_SHA1(secret, rawBody))
```

The key is your webhook secret's UTF-8 bytes, used as-is. Chatbase's guide doesn't say where the secret is shown; its examples read it from a `SECRET_KEY` environment variable.

## Implementation

Validate the header's format first (exactly 40 hex characters), then compare case-insensitively in constant time.

### Node.js

```javascript
const crypto = require('crypto');

function verifyChatbaseSignature(rawBody, signature, secret) {
  if (!signature || !secret || !/^[0-9a-f]{40}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature.toLowerCase()), Buffer.from(expected));
}
```

### Python

```python
import hashlib, hmac, re

def verify_chatbase_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    if not signature or not secret or not re.fullmatch(r"[0-9a-fA-F]{40}", signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha1).hexdigest()
    return hmac.compare_digest(signature.lower().encode("ascii"), expected.encode("ascii"))
```

### Reading the raw body

| Framework | Raw body |
|-----------|----------|
| Express | `express.raw({ type: '*/*' })` on the webhook route, not `express.json()` |
| Next.js App Router | `Buffer.from(await request.arrayBuffer())`, not `request.json()` |
| Next.js Pages Router | `export const config = { api: { bodyParser: false } }` plus `raw-body` (Chatbase's own Next.js example) |
| FastAPI | `await request.body()` |
| Flask | `request.get_data()` |

## Common Gotchas

- **Re-serialized JSON.** Chatbase's Node.js example hashes `JSON.stringify(req.body)` after the body has been parsed. That only matches when the re-serialized bytes are identical to what Chatbase sent. Hash the bytes you received.
- **Using `===` to compare.** Chatbase's examples compare with `!==`; use `crypto.timingSafeEqual` or `hmac.compare_digest`. `timingSafeEqual` throws when lengths differ, which the format check rules out.
- **Case-sensitive hex.** Lowercase the received value before comparing, so an uppercase digest still matches.
- **Trailing whitespace in the secret.** A newline pasted into `.env` changes every digest.
- **The wrong webhook.** HIPAA conversation webhooks and Helpdesk webhooks also send an `X-Chatbase-Signature` header but aren't signed this way. This scheme is for Action webhooks only.

## Debugging Verification Failures

1. Log the header you received and the digest you computed (never the secret).
2. Confirm the header is 40 hex characters.
3. Recompute with OpenSSL against the exact captured body:
   ```bash
   printf '%s' "$RAW_BODY" | openssl dgst -sha1 -hmac "$CHATBASE_WEBHOOK_SECRET"
   ```
4. If OpenSSL matches but your code doesn't, your framework is changing the body before you hash it.

## Status Codes

Return `200` once a request is verified and accepted. Return `400` for a missing or invalid signature, or invalid JSON, as Chatbase's examples do, and `500` if your secret isn't configured. Chatbase's guide documents no retry policy, so don't rely on a status code to get a delivery sent again.
