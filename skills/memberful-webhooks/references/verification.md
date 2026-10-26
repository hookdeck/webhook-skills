# How to Verify Memberful Webhook Signatures

## How It Works

Memberful sends an `X-Memberful-Webhook-Signature` header. Its value is the hex digest of HMAC-SHA256 over the raw request body, keyed with your webhook secret. The docs state this in prose plus Ruby and Node.js samples, both of which use hex.

| Item | Value |
|------|-------|
| Header | `X-Memberful-Webhook-Signature` |
| Algorithm | HMAC-SHA256 |
| Signed content | the raw body bytes only (no timestamp, id or other header) |
| Key | the secret's UTF-8 bytes, not decoded |
| Encoding | lowercase hex, 64 characters, no prefix |

Hookdeck's Memberful source uses the same scheme (HMAC, `sha256`, `x-memberful-webhook-signature`, hex) and compares hex case-insensitively.

## Implementation

Memberful publishes no SDK for verification, so every example verifies manually.

Node.js (see [examples/express/](../examples/express/)):

```javascript
if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;
const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
const received = Buffer.from(signature.toLowerCase(), 'hex');
return received.length === expected.length && crypto.timingSafeEqual(received, expected);
```

Python (see [examples/fastapi/](../examples/fastapi/)):

```python
if not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
    return False
expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
return hmac.compare_digest(bytes.fromhex(signature), expected)
```

## Common Gotchas

- **Raw body.** Verify the bytes as received. Parsing and re-serializing JSON changes whitespace and key order and breaks the signature. Express: `express.raw({ type: '*/*' })`; Next.js: `request.arrayBuffer()`; FastAPI: `await request.body()`.
- **Validate before decoding.** Check exactly 64 hex characters first. The Node sample in Memberful's docs calls `Buffer.from(signature, 'hex')` directly, which silently drops bad characters and can throw in `timingSafeEqual` on a length mismatch; these examples avoid both.
- **Constant-time compare** on equal-length bytes. `hmac.compare_digest` on `str` raises for non-ASCII input.
- **No prefix, no list.** Compare the whole header value as one digest.
- **No replay window.** Nothing time-based is signed, so don't invent one from unsigned fields. Use idempotency instead.
- **Secret as-is.** Don't hex- or base64-decode it.

## Debugging Verification Failures

1. Log the header and the length of the raw body; the header must be 64 hex characters.
2. Confirm the secret is exactly what Memberful shows for this webhook (no quotes or trailing newline from `.env`).
3. Confirm nothing in your stack re-serializes the body before verification (a global `express.json()` is the usual cause).
4. Recompute with the raw bytes in a REPL and compare.
