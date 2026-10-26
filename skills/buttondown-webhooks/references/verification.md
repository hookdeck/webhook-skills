# How to Verify Buttondown Webhook Signatures

## How Does Buttondown Sign Webhooks?

If the webhook has a signing key, every delivery has an `X-Buttondown-Signature` header:

```
X-Buttondown-Signature: sha256=<hex>
```

- Algorithm: HMAC-SHA256, lowercase hex digest (64 chars)
- Key: the signing key, as UTF-8, used as-is
- Signed message: the raw request body bytes only. No timestamp, id or other header is signed.

Set a signing key on the Buttondown webhook. Without one, deliveries are unsigned and fail verification.

## Implementation

Strip a leading `sha256=` (the bare digest is accepted too), require exactly 64 hex characters, then compare in constant time.

```javascript
const sig = header.trim().replace(/^sha256=/i, '');
if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected);
```

```python
sig = re.sub(r"^sha256=", "", header.strip(), flags=re.I)
if not re.fullmatch(r"[0-9a-fA-F]{64}", sig, re.ASCII):
    return False
expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest().encode()
return hmac.compare_digest(sig.lower().encode(), expected)
```

- **Node:** check the value is exactly 64 hex chars before `Buffer.from(x, 'hex')`; invalid hex silently truncates.
- **Python:** call `hmac.compare_digest` on bytes. With `str` arguments a non-ASCII header raises `TypeError` and returns a 500 instead of rejecting.
- Hex is case-insensitive, so lowercase before comparing.

## Is There a Replay Window?

No. The signature covers only the body, so there is no timestamp to check. Don't invent one from unsigned headers or body fields. Deliveries are at least once, so dedupe in your handler (see webhook-handler-patterns).

## Common Gotchas

- **Raw body:** the signature covers the exact bytes. Don't parse and re-serialise JSON first. Use `express.raw({ type: '*/*' })` in Express (verification then doesn't depend on `Content-Type`), `await request.arrayBuffer()` in Next.js, `await request.body()` in FastAPI.
- **Key as typed:** don't hex- or base64-decode the signing key.
- **No key, no signature:** an unsigned webhook sends no header, so it fails verification.
- **Header casing:** HTTP headers are case-insensitive; Node lowercases to `x-buttondown-signature`.
- **Status codes:** reply `401` for a missing or bad signature, `400` for a verified body that isn't valid JSON, `500` only if your own secret is missing.
- **Respond quickly:** return `2xx`, then do slow work asynchronously.

## How Do I Debug Verification Failures?

- Compare `BUTTONDOWN_WEBHOOK_SECRET` with the webhook's signing key: whole value, no added whitespace or quotes.
- Check the webhook actually has a signing key; otherwise there is no header.
- A body-parsing middleware ahead of your route (`express.json()`) re-serialises the body and breaks the signature.
- A proxy or middleware that rewrites the body (compression, whitespace changes) breaks it too.
