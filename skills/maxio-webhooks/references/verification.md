# How to Verify Maxio Webhook Signatures

## How It Works

- Header: `X-Chargify-Webhook-Signature-Hmac-Sha-256`
- Algorithm: HMAC-SHA256, hex-encoded
- Signed content: the **raw request body** (the form-encoded string)
- Key: the Site Shared Key, as a raw string

Test vector from Maxio's docs: key `123`, body `payload[chargify]=testing&event=test` → `19826d51b9f866b26eda1f154de192593360f8d0bcb63df8a28540a5dcf733f1`.

## Implementation

### Node.js

```javascript
const expected = crypto.createHmac('sha256', sharedKey).update(rawBody).digest('hex');
crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided)); // check lengths first
```

### Python

```python
expected = hmac.new(shared_key.encode(), raw_body, hashlib.sha256).hexdigest()
hmac.compare_digest(expected, provided.lower())
```

Maxio has no Node/Python SDK verification helper that these examples rely on, so verification is manual in all three examples.

## Common Gotchas

- **Raw body first.** Use `express.raw({ type: '*/*' })`, `await request.text()` (Next.js) or `await request.body()` (FastAPI). Don't use `express.urlencoded()` before verifying.
- **Key is a raw string.** Don't decode it.
- **No timestamp.** Replay protection must come from idempotency, not time windows.
- **Case.** Compare hex case-insensitively (lowercase the header).
- **Parse after verifying.** Use `URLSearchParams` / `urllib.parse.parse_qsl`; keys like `payload[subscription][id]` stay as literal flat keys.

## Debugging Verification Failures

1. Compute the HMAC of the exact bytes you received; compare with the header.
2. Confirm you're using the Site Shared Key for the right site.
3. Check a proxy or middleware isn't altering the body.
4. Reproduce with the test vector above.
