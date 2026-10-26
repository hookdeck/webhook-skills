# How to Verify Plain Webhook Signatures

## How It Works

- Header: `Plain-Request-Signature`
- Algorithm: HMAC-SHA256, key = workspace HMAC secret (Settings → Request signing)
- Signed content: the raw request body
- Encoding: lowercase hex (64 chars)
- Not Standard Webhooks; there is no timestamp or message id in the signature

## Implementation

### Node.js (Express)

```javascript
app.post('/webhooks/plain', express.raw({ type: '*/*' }), (req, res) => {
  const sig = req.headers['plain-request-signature'];
  if (!sig || !/^[0-9a-f]{64}$/i.test(sig)) return res.status(401).send('Invalid signature');
  const expected = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
  const ok = crypto.timingSafeEqual(Buffer.from(sig.toLowerCase()), Buffer.from(expected));
  if (!ok) return res.status(401).send('Invalid signature');
  // JSON.parse(req.body) only after this point
});
```

### Python (FastAPI)

```python
expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
ok = hmac.compare_digest(expected.encode(), signature.lower().encode())
```

### Official SDK

`@team-plain/webhooks` (`verifyPlainWebhook(rawBody, signature, secret, tolerance?)`) is Node/TypeScript only and also checks a timestamp (default 300s). The examples here verify manually so they work in every framework and make the replay check opt-in.

## Common Gotchas

- Use the raw body. The docs' Node snippet hashes `JSON.stringify(request.body)`, which can differ from what Plain signed.
- Check the header is exactly 64 hex chars before `Buffer.from(x, 'hex')`; invalid hex silently truncates.
- Use `express.raw({ type: '*/*' })` so any content type verifies.
- The timestamp is in the body (`webhookMetadata.webhookDeliveryAttemptTimestamp`), not covered by a separate signed header. Retries and Hookdeck replays carry their own attempt timestamps, so a strict window is opt-in here (`PLAIN_TOLERANCE_SECONDS`).
- No HMAC secret in the workspace means no header at all.

## Debugging Verification Failures

- **Missing header:** request signing is not enabled in Plain.
- **Mismatch:** wrong secret (regenerated?), body parsed or re-serialized before hashing, or a proxy modified the body.
- **500 instead of 401 in Python:** compare bytes, not `str`, with `hmac.compare_digest`.
