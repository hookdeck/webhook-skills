# How to Verify Reditus Webhook Signatures

## How It Works

Reditus sends an `X-Signature` header. Its value is the lowercase hex digest of HMAC-SHA256 over the raw request body, keyed with your webhook secret. The docs state this only through seven code samples (Ruby, Go, Python, Node.js, .NET, PHP, Java), which agree.

| Item | Value |
|------|-------|
| Header | `X-Signature` |
| Algorithm | HMAC-SHA256 |
| Signed content | the raw body bytes only (no timestamp, id or other header) |
| Key | the secret's UTF-8 bytes, not decoded |
| Encoding | lowercase hex, 64 characters, no prefix |

Hookdeck's Reditus source uses the same scheme (HMAC, `sha256`, `x-signature`, hex) and compares hex case-insensitively.

## Implementation

Node.js (see [examples/express/](../examples/express/)):

```javascript
const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;
const received = Buffer.from(signature.toLowerCase(), 'hex');
return received.length === expected.length && crypto.timingSafeEqual(received, expected);
```

Python (see [examples/fastapi/](../examples/fastapi/)):

```python
expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
if not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
    return False
return hmac.compare_digest(bytes.fromhex(signature), expected)
```

Reditus publishes no SDK for verification, so every example verifies manually.

## Common Gotchas

- **Raw body.** Verify the bytes as received. Parsing and re-serializing JSON changes whitespace and key order and breaks the signature. Express: `express.raw({ type: '*/*' })`; Next.js: `request.arrayBuffer()`; FastAPI: `await request.body()`.
- **Validate before decoding.** Check exactly 64 hex characters first: `Buffer.from(sig, 'hex')` silently drops bad characters.
- **Constant-time compare** on equal-length bytes. `hmac.compare_digest` on `str` raises for non-ASCII input.
- **No prefix, no list.** Compare the whole header value as one digest.
- **No replay window.** Nothing time-based is signed, so don't invent one from `created_at` (a date with no time) or other fields. Use idempotency instead.
- **Any HTTP method.** The docs don't name it. A body-less request (e.g. GET) is signed over zero bytes.
- **Secret as-is.** Don't hex- or base64-decode it.

## Debugging Verification Failures

1. Log the header and the length of the raw body; the header must be 64 hex characters.
2. Confirm the secret is exactly what Reditus holds (no quotes or trailing newline from `.env`).
3. Confirm nothing in your stack re-serializes the body before verification (global `express.json()` is the usual cause).
4. Recompute with the raw bytes in a REPL and compare.
