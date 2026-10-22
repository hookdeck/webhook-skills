# Printify Signature Verification

## How Does Printify Sign Webhooks?

When a webhook has a `secret`, each request carries:

```
X-Pfy-Signature: sha256=4260d30ec4ee2a17181ae5072c846d8dfcb5ceb195e24de055fd9a21d8c6648f
```

The digest is the **hex** HMAC-SHA256 of the **raw request body**, keyed with the secret as a **UTF-8 string**. There is no timestamp or event ID in the signed content. Strip the `sha256=` prefix, then compare in constant time.

## Implementation

Printify has no webhook SDK, so verification is manual.

### Node.js (Express)

```javascript
app.post('/webhooks/printify', express.raw({ type: '*/*' }), (req, res) => {
  const header = req.headers['x-pfy-signature'];
  const expected = crypto.createHmac('sha256', process.env.PRINTIFY_WEBHOOK_SECRET)
    .update(req.body).digest('hex');
  const received = String(header || '').replace(/^sha256=/, '');
  const ok = received.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
  if (!ok) return res.status(400).json({ error: 'Invalid signature' });
  // JSON.parse(req.body) only after this point
});
```

### Python (FastAPI)

```python
raw = await request.body()
expected = hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()
received = header.removeprefix("sha256=") if header.startswith("sha256=") else ""
ok = hmac.compare_digest(received.encode(), expected.encode())
```

## Common Gotchas

- **Use the raw body.** Re-serialising parsed JSON changes whitespace and key order. In Express use `express.raw({ type: '*/*' })` so any content type is captured as bytes.
- **Key is the secret string as-is.** Don't base64- or hex-decode it.
- **Strip `sha256=`.** The header includes the prefix; the HMAC output doesn't.
- **No secret, no signature.** If the webhook was created without `secret`, the header is absent. Recreate it with a secret.
- **A failing endpoint gets blocked.** After 3 retries of `4xx`/`5xx`, Printify blocks the webhook for an hour.
- **No replay protection.** Nothing in the signature is time-bound; dedupe on the event `id`.

## How Do I Debug Verification Failures?

1. Log the raw body length and confirm the body is a `Buffer`/`bytes`, not a parsed object.
2. Confirm the secret equals the one passed at creation (`GET .../webhooks.json` shows the webhook but you can't read the secret back; recreate if unsure).
3. Check a proxy isn't altering the body.
4. Send a simulated event and compare against `openssl dgst -sha256 -hmac "$SECRET" body.json`.
