# Modem Pay Signature Verification

## How It Works

Each delivery carries one header:

```
x-modem-signature: 1f0c…e9a4   (128 hex characters)
```

The value is `hex(HMAC-SHA512(key = webhook secret, message = request body))`:

- **Key:** the webhook signing secret from Developers > Webhooks, as UTF-8 bytes, exactly as shown. It isn't your API secret key.
- **Message:** the request body bytes exactly as received. No timestamp, ID or delimiter is added.
- **Encoding:** hex, with no `sha512=` or other prefix. Modem Pay produces lowercase; the examples compare hex case-insensitively.

There's no timestamp, so there's no replay window to configure. Deduplicate retries on `(event, payload.id, payload.updatedAt)` instead.

## Implementation

### SDK Verification

Modem Pay's SDKs expose `webhooks.composeEventDetails(payload, signature, secret)` (Node `modem-pay`, PHP `composeEventDetails`), which checks the signature and returns `{ event, payload }`, and throws on a mismatch. Modem Pay's examples pass the raw body (`req.body.toString("utf8")` after `express.raw`, `req.rawBody` on Firebase, `await request.text()` in Next.js). In the Node SDK (2.x), a string or Buffer is hashed as-is and any other object goes through `JSON.stringify` first, so never pass a parsed object.

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

1. **Re-serialised JSON.** Parsing the JSON and turning it back into a string changes spacing or key order. Modem Pay calls this the most common reason signature checks fail, especially on Firebase, Vercel and other serverless platforms. Hash the raw bytes.
2. **SHA-256 instead of SHA-512.** A SHA-256 hex digest is 64 characters; Modem Pay's is 128.
3. **Wrong secret.** Test and live webhooks have different secrets, saving the webhook URL creates a new one, `modempay listen` swaps in its own test secret while it runs, and the API secret key is a different value.
4. **Body parser order.** With `app.use(express.json())` registered first, the raw bytes are gone by the time your route runs.

## Callback URL Deliveries

Events for a payment intent created with a `callback_url` go to that URL instead of your webhook, and they're signed differently. The `x-modem-signature` value is still the hex HMAC-SHA512 of the raw body, but the key is `sha256(secret_key)` as lowercase hex, where `secret_key` is your secret API key. `x-modem-signature-key` holds the last 4 characters of the API key that signed it. Callbacks are signed with the newest active secret key, so after you roll a key, recompute the signing key.

```javascript
const signingKey = crypto.createHash('sha256').update(process.env.MODEMPAY_SECRET_KEY).digest('hex');
verifyModemPay(rawBody, req.headers['x-modem-signature'], signingKey);
```

## Debugging Verification Failures

1. Log the length of `x-modem-signature` (it should be 128) and of the raw body, and compare the body length with `Content-Length`. Don't log the secret.
2. Recompute locally:
   ```bash
   printf '%s' "$BODY" | openssl dgst -sha512 -hmac "$MODEM_PAY_WEBHOOK_SECRET"
   ```
3. Behind Hookdeck, open the request in Hookdeck's dashboard. A request that failed the source's check is recorded as failed verification there, so you can tell whether the secret or your handler is wrong.
