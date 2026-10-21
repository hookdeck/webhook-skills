# How to Verify Pusher Channels Webhook Signatures

## How It Works

Every webhook carries:

- `X-Pusher-Key` — the app key of the token that signed the request (the oldest active token).
- `X-Pusher-Signature` — HMAC SHA256 **hex digest** of the raw POST body, keyed with that token's secret.

There is no timestamp in the signed content, no prefix and no base64. The signed content is the body exactly as received. `time_ms` inside the body is only informational.

## Implementation

### SDK Verification (Node.js)

```javascript
const Pusher = require('pusher');
const pusher = new Pusher({ appId, key, secret, cluster });

// headers must be lower-case keys; rawBody must be the unparsed string
const webhook = pusher.webhook({ headers: req.headers, rawBody });
if (!webhook.isValid()) return res.status(400).send('Invalid signature');
for (const event of webhook.getEvents()) { /* ... */ }
```

`isValid()` returns true only if the body is JSON, `X-Pusher-Key` equals the client's key and the signature matches. Pass extra tokens to accept rotated keys: `webhook.isValid([{ key, secret }])`.

### SDK Verification (Python)

```python
pusher_client = pusher.Pusher(app_id=..., key=..., secret=..., cluster=...)
data = pusher_client.validate_webhook(key=key_header, signature=sig_header, body=raw_body)
if data is None:
    ...  # reject
```

It returns the parsed body, or `None` when the key differs, the signature is wrong, the JSON is bad, **or `time_ms` is more than 5 minutes from now**.

### Manual Verification (Python fallback)

```python
import hashlib, hmac

def verify(raw_body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature or "", expected)
```

Look the secret up by `X-Pusher-Key` first, and reject unknown keys.

## Common Gotchas

- **Raw body.** Parsing and re-serializing JSON changes bytes. Use `express.raw({ type: '*/*' })`, `request.text()` in Next.js, `await request.body()` in FastAPI.
- **Content type.** The Node SDK only treats `application/json` (exact match, no `; charset=...`) as valid and returns `isValid() === false` otherwise. Do not rewrite it in a proxy.
- **Lower-case headers.** The Node SDK reads `x-pusher-key` and `x-pusher-signature`. Node's `req.headers` and `Object.fromEntries(request.headers)` already lower-case them.
- **Python time window.** `validate_webhook` rejects bodies whose `time_ms` is more than 300 seconds off. Pusher retries for 5 minutes, and clock skew counts, so late retries can fail. Use the manual check if you need to accept them.
- **Multiple tokens.** Match the secret to `X-Pusher-Key`; a single hard-coded secret fails after rotation.
- **Batches.** The signature covers the whole body, so verify once, then iterate `events`.

## Debugging Verification Failures

- Log `X-Pusher-Key` and compare to your configured `PUSHER_APP_KEY`; a mismatch means a different app or a rotated token.
- Compute the HMAC of the exact bytes you received and compare to the header; if the bytes differ, something parsed or re-encoded the body.
- Make sure you used the app **secret**, not the app key or a Beams secret.
