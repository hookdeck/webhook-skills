# How to Verify Nango Webhook Signatures

## How Does Nango Sign Webhooks?

| Property | Value |
|----------|-------|
| Header | `X-Nango-Hmac-Sha256` |
| Algorithm | HMAC-SHA256 |
| Signed content | The raw request body, exactly as sent (no timestamp, no prefix) |
| Key | The environment's webhook signing key, used as a UTF-8 string (not decoded) |
| Encoding | Lowercase hex (64 characters), no `sha256=` prefix |
| Standard Webhooks? | No |

Nango also sends a legacy `X-Nango-Signature` header: `sha256(signingKey + JSON.stringify(body))`. It is kept for backwards compatibility, is vulnerable to length-extension attacks, and should not be used. The SDK method that checks it (`verifyWebhookSignature`) is deprecated.

There is no timestamp in the signature, so there is no replay window to enforce; rely on idempotent handling instead.

## Implementation

### SDK Verification (Node.js)

[`@nangohq/node`](https://www.npmjs.com/package/@nangohq/node) provides `verifyIncomingWebhookRequest(body: string, headers: Record<string, unknown>): boolean`. It finds `x-nango-hmac-sha256` case-insensitively, recomputes the HMAC, and compares in constant time.

```javascript
const { Nango } = require('@nangohq/node');

const nango = new Nango({
  apiKey: process.env.NANGO_API_KEY,                        // required by the constructor
  webhookSigningKey: process.env.NANGO_WEBHOOK_SIGNING_KEY, // used for verification
});

app.post('/webhooks/nango', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = req.body.toString('utf8');
  if (!nango.verifyIncomingWebhookRequest(rawBody, req.headers)) {
    return res.status(400).send('Invalid signature');
  }
  const webhook = JSON.parse(rawBody);
  // ...
});
```

Notes:

- `body` must be the **raw string**, not `req.body` after `express.json()`.
- `webhookSigningKey` falls back to the deprecated `secretKey` if omitted. It never falls back to `apiKey`, so a client built with only `apiKey` returns `false` for every webhook.
- The constructor throws if no `apiKey` (or `secretKey`) is given.

### Manual Verification (Python and other languages)

Nango has no Python SDK for verification, so compute the HMAC yourself:

```python
import hashlib
import hmac

def verify_nango_signature(raw_body: bytes, signature: str | None, signing_key: str) -> bool:
    if not signature:
        return False
    expected = hmac.new(signing_key.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.strip().lower())
```

Node without the SDK:

```javascript
const crypto = require('crypto');

function verifyNangoSignature(rawBody, signature, signingKey) {
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', signingKey).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature.toLowerCase()));
  } catch {
    return false; // different lengths
  }
}
```

## How Do I Handle Signing Key Rotation?

After a rotation, webhooks may be signed with the old **or** new key for up to 5 minutes. Accept either during that window, then remove the old key:

```javascript
const keys = [process.env.NANGO_WEBHOOK_SIGNING_KEY, process.env.NANGO_WEBHOOK_SIGNING_KEY_PREVIOUS].filter(Boolean);
const valid = keys.some((key) => verifyNangoSignature(rawBody, signature, key));
```

The SDK takes a single key, so with the SDK create one `Nango` client per key (or use the manual check) during rotation.

## Common Gotchas

- **Wrong key.** The most common failure. Use **Environment Settings > Webhooks > Signing key**, not the API key. Each environment has its own key.
- **Parsed body.** Re-serialising JSON changes whitespace and key order. Verify the raw bytes (Express: `express.raw()`, Next.js: `await request.text()`, FastAPI: `await request.body()`) before parsing.
- **Legacy header.** `X-Nango-Signature` is plain SHA-256 over `key + JSON`, not an HMAC. Code that checks it against an HMAC always fails.
- **Decoding the key.** The key is used as-is as UTF-8 bytes; don't hex- or base64-decode it.
- **Global JSON middleware.** In Express, register `express.raw()` on the webhook route before any `express.json()` that would consume the body.
- **Forwarded webhooks.** A valid Nango signature on a `forward` proves it came through Nango, not that the external provider sent it. Check `unverified: true` / `X-Nango-Webhook-Unverified: true`.

## Debugging Verification Failures

1. Confirm the header is present: log `req.headers['x-nango-hmac-sha256']`. Missing means the request didn't come from Nango (or a proxy stripped it).
2. Confirm the key: it should be from the same environment that sent the webhook (check `environment` in auth payloads, and the Nango logs).
3. Recompute by hand on the exact raw body you received:
   ```bash
   printf '%s' "$RAW_BODY" | openssl dgst -sha256 -hmac "$NANGO_WEBHOOK_SIGNING_KEY"
   ```
4. If it matches only sometimes, check whether a key rotation happened in the last few minutes.
5. Check Nango's logs for the delivery attempt and your endpoint's response.
