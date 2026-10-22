# Taiga Signature Verification

## How Does Taiga Sign Webhooks?

Every request carries `X-TAIGA-WEBHOOK-SIGNATURE`: the lowercase hex HMAC-SHA1 of the **raw request body**, keyed with the webhook's secret key encoded as UTF-8. Nothing else is signed: there is no timestamp, so Taiga gives no replay protection. taiga-back also sends `X-Hub-Signature: sha1=<same hex>`; either header works, the examples use `X-TAIGA-WEBHOOK-SIGNATURE`.

Taiga's own reference (Python):

```python
def verify_signature(key, data, signature):
    mac = hmac.new(key.encode("utf-8"), msg=data, digestmod=hashlib.sha1)
    return mac.hexdigest() == signature
```

## Implementation

Taiga has no webhook-verification SDK, so verification is manual.

### Node.js

```javascript
const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
crypto.timingSafeEqual(Buffer.from(signature.toLowerCase()), Buffer.from(expected)); // throws on length mismatch
```

### Python

```python
expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha1).hexdigest()
hmac.compare_digest(signature.lower().encode(), expected.encode())
```

## Common Gotchas

- **Use the raw body.** Re-serialized JSON changes bytes and breaks the digest. In Express use `express.raw({ type: '*/*' })`; in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **No prefix on `X-TAIGA-WEBHOOK-SIGNATURE`.** Don't strip `sha1=` from it; only `X-Hub-Signature` has that prefix.
- **SHA-1, not SHA-256.** An HMAC-SHA256 check will never match.
- **Key is the secret key string as typed**, not decoded from hex or base64.
- **No timestamp.** Make handlers idempotent since replays can't be detected from the signature.

## Debugging Verification Failures

1. Compare `TAIGA_WEBHOOK_SECRET` with the webhook's secret key in Taiga (watch for whitespace).
2. Log the body length and confirm it matches the delivery in Taiga's webhook log.
3. Confirm no middleware parses the body before your handler.
4. Return `400` for a bad signature so failures show up in the delivery log.
