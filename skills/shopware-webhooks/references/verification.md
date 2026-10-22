# Shopware Signature Verification

## How It Works

- Header: `shopware-shop-signature`
- Algorithm: HMAC-SHA256, lowercase hex digest (no `sha256=` prefix)
- Signed content: the raw request body
- Key: the per-shop app secret assigned during registration
- Not Standard Webhooks; there are no `webhook-id`/`webhook-timestamp` headers (the timestamp is inside the JSON body)

## Implementation

### Manual Verification

Shopware's own SDKs (App PHP SDK, Symfony bundle) verify for PHP apps. For Node and Python, compute it yourself.

Node (Express reads the raw body with `express.raw({ type: '*/*' })`):

```javascript
const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
```

Python:

```python
expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
hmac.compare_digest(signature.encode(), expected.encode())
```

### Choosing the Secret

Parse the body just to read `source.shopId`, look up that shop's secret, then verify the **raw bytes**. Reject unknown shops. Do not act on any field until verification passes.

## Common Gotchas

- **Wrong secret:** the key is the per-shop app secret, not a shared dashboard secret. One secret per shop.
- **Raw body:** do not re-serialise JSON. Use `express.raw({ type: '*/*' })`, `request.text()` in Next.js, `await request.body()` in FastAPI.
- **Rotation:** re-registration changes the secret. Keep the new secret only after the handshake confirms; `shopware-shop-signature-previous` appears only on the confirmation request.
- **Registration vs webhook:** registration (`GET`, signed over the query string with `shopware-app-signature`) and confirmation (`POST`) are different from webhooks.
- **Replay:** the body `timestamp` is signed; Shopware says to reject stale requests. Use `source.eventId` for idempotency.
- **Extra fields:** Shopware may add fields to signed data; always sign the whole body.

## Debugging Verification Failures

1. Print the received signature and your computed digest; length should be 64 hex chars.
2. Confirm the secret matches the shop (`source.shopId`) and was not rotated.
3. Confirm the body is not modified by middleware (JSON parsers, proxies).
4. Check that the header name is `shopware-shop-signature` (case-insensitive).
