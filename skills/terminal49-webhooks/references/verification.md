# How to Verify Terminal49 Webhook Signatures

## How Does Terminal49 Sign Webhooks?

Terminal49 computes an HMAC-SHA256 digest of the **raw request body**, keyed with the webhook's
`secret`, and sends it as lowercase hex in the `X-T49-Webhook-Signature` header:

```
X-T49-Webhook-Signature: <64 hex characters>
```

- No prefix (no `sha256=`), no list of signatures: compare the whole header value as one digest.
- Only the body is signed. No timestamp, id or header is part of the signed content, so there is
  no timestamp tolerance and no replay window to check.
- The key is the secret string's UTF-8 bytes, used as-is.
- Terminal49 has no verification SDK; its docs show Ruby, Node.js, Python and Go snippets.

## Implementation

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyTerminal49Signature(rawBody, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

### Python (FastAPI)

```python
import hashlib, hmac, re

def verify_terminal49_signature(raw_body: bytes, signature, secret: str) -> bool:
    if not secret or not isinstance(signature, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(signature), expected)  # bytes, never str
```

The full handlers are in [../examples/](../examples/).

## Common Gotchas

- **Use the raw body.** Express: `express.raw({ type: '*/*' })`; Next.js: `await request.arrayBuffer()`;
  FastAPI: `await request.body()`. Don't decode to a string and re-encode, and don't `JSON.parse` /
  `JSON.stringify` before verifying (key order and whitespace change the bytes).
- **Validate before decoding.** `Buffer.from(sig, 'hex')` silently drops invalid characters, so a
  malformed header can decode to a shorter buffer. Check for exactly 64 hex characters first. In
  Python use `re.fullmatch` (not `match` with `$`, which accepts a trailing newline).
- **Compare bytes in constant time.** `crypto.timingSafeEqual` throws on unequal lengths, so check
  lengths; `hmac.compare_digest` raises `TypeError` on a non-ASCII `str`, so compare bytes.
- **Hex case.** Hex is case-insensitive; lowercase (or decode) both sides before comparing.
- **Don't decode the secret.** It is not hex or base64; use its UTF-8 bytes.
- **Don't invent a replay window.** Nothing time-based is signed. Dedupe on `data.id` instead.
- **Don't prefix.** Terminal49's header has no `sha256=`; don't strip or require one.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| `401` on every request | Wrong `TERMINAL49_WEBHOOK_SECRET` (use the webhook's `secret` attribute, not your API key) |
| Works with curl, fails from Terminal49 | A body parser ran first, so the bytes differ from what was signed |
| Intermittent `401` | Middleware re-serializing JSON, or a proxy changing the body |
| `401` with the right secret | Secret has stray whitespace/newline in `.env`, or header missing (check the proxy forwards `X-T49-Webhook-Signature`) |

Use the Trigger Webhook endpoint to send a test payload, and `GET /v2/webhook_notifications` to
inspect recent deliveries and their `delivery_status`.
