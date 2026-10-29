# Modem Pay Signature Verification

## How It Works

Each delivery carries one header:

```
x-modem-signature: 1f0c…e9a4   (128 hex characters)
```

The value is `hex(HMAC-SHA512(key = webhook secret, message = request body))`:

- **Key:** the webhook secret from Developers > Webhooks, as UTF-8 bytes, exactly as shown.
- **Message:** the request body bytes exactly as received. No timestamp, ID or delimiter is added.
- **Encoding:** hex, with no `sha512=` or other prefix. Modem Pay produces lowercase; Hookdeck compares hex case-insensitively, and so do the examples.

There's no timestamp, so there's no replay window to configure. Deduplicate retries on `(event, payload.id)` instead.

## Implementation

### SDK Verification

Modem Pay's SDKs expose `webhooks.composeEventDetails(payload, signature, secret)` (Node `modem-pay`, Python `compose_event_details`, PHP `composeEventDetails`), which checks the signature and returns `{ event, payload }`. In the Node SDK, a string `payload` is hashed as-is and an object is passed through `JSON.stringify` first, so pass the **raw body string**, not a parsed object. The Node SDK also compares the hex case-sensitively and throws on any mismatch.

The examples in this skill verify manually, because it takes a few lines, needs no API key, and lets them answer 401 without exceptions.

### Manual Verification (Node.js)

```javascript
const crypto = require('crypto');

function verifyModemPay(rawBody, signatureHeader, secret) {
  if (!secret || typeof signatureHeader !== 'string') return false;
  const signature = signatureHeader.trim();
  if (!/^[0-9a-fA-F]{128}$/.test(signature)) return false;
  const expected = Buffer.from(crypto.createHmac('sha512', secret).update(rawBody).digest('hex'));
  const received = Buffer.from(signature.toLowerCase());
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

`crypto.timingSafeEqual` throws on buffers of different lengths, so the format check (exactly 128 hex characters) runs first. Never call `Buffer.from(sig, 'hex')` on an unchecked value: it silently drops invalid characters.

### Manual Verification (Python)

```python
import hashlib, hmac, re

def verify_modem_pay(raw_body: bytes, header, secret: str) -> bool:
    if not secret or not header:
        return False
    sig = header.strip()
    if not re.fullmatch(r"[0-9a-fA-F]{128}", sig):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha512).hexdigest().encode()
    return hmac.compare_digest(sig.lower().encode(), expected)
```

Compare `bytes`, not `str`: `hmac.compare_digest` raises `TypeError` on non-ASCII `str` values, which would turn a forged header into a 500.

### Getting the Raw Body

| Framework | Raw body |
|-----------|----------|
| Express | `express.raw({ type: '*/*' })` on the route, no `express.json()` before it |
| Next.js (App Router) | `Buffer.from(await request.arrayBuffer())` |
| FastAPI | `await request.body()` |

## Common Gotchas

1. **Re-serialised JSON.** Modem Pay's snippets hash `JSON.stringify(req.body)` (Node) or `json.dumps(request.json)` (Flask). `json.dumps` puts a space after `:` and `,`, unlike `JSON.stringify`, and any round trip can change key order, number formatting or Unicode escapes. Hash the raw bytes.
2. **SHA-256 instead of SHA-512.** A SHA-256 hex digest is 64 characters; Modem Pay's is 128. (A comment in the Node SDK says "SHA256", but its code uses `sha512`.)
3. **Wrong secret for the mode.** `modempay listen` prints a test-mode secret; live deliveries use the live secret.
4. **Body parser order.** With `app.use(express.json())` registered first, the raw bytes are gone by the time your route runs.

## Debugging Verification Failures

1. Log the length of `x-modem-signature` (it should be 128) and of the raw body. Don't log the secret.
2. Recompute locally:
   ```bash
   printf '%s' "$BODY" | openssl dgst -sha512 -hmac "$MODEM_PAY_WEBHOOK_SECRET"
   ```
3. Behind Hookdeck, open the request in Hookdeck's dashboard. A request that failed the source's check is marked as rejected there, so you can tell whether the secret or your handler is wrong.
