# How to Verify Optimizely Webhook Signatures

## How Does Optimizely Sign Webhooks?

Optimizely sends the `X-Hub-Signature` header as `sha1=<hex>`, where `<hex>` is the lowercase hex HMAC-SHA1 of the raw request body, keyed with the webhook's secret token. Only the body is signed: there is no timestamp, id or other header in the signed content, so there is no replay window to check (don't invent one from unsigned fields).

## Implementation

Optimizely has no webhook verification SDK, so verify manually. Both examples below require the same steps:

1. Read the **raw body bytes**. Never `JSON.parse`/re-serialise before verifying, and don't decode to a string and re-encode.
2. Use the secret's UTF-8 bytes as the key as-is (not hex- or base64-decoded).
3. Strip a leading `sha1=` (Hookdeck's parser also accepts the bare digest).
4. Validate the digest: exactly 40 hex characters (case-insensitive).
5. Compare decoded bytes in constant time.

### Node.js

```javascript
const crypto = require('crypto');

function verifyOptimizelySignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const sig = header.startsWith('sha1=') ? header.slice(5) : header;
  if (!/^[0-9a-fA-F]{40}$/.test(sig)) return false;
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected);
}
```

`Buffer.from(sig, 'hex')` is only called after the format check, because it silently drops invalid characters.

### Python

```python
def verify_optimizely_signature(raw_body: bytes, header, secret: str) -> bool:
    if not header or not secret:
        return False
    sig = header.removeprefix("sha1=")
    if not re.fullmatch(r"[0-9a-fA-F]{40}", sig):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha1).digest()
    return hmac.compare_digest(bytes.fromhex(sig), expected)
```

## Published Test Vector

Optimizely's docs publish a worked example, which every example's tests include:

- Secret: `yIRFMTpsBcAKKRjJPCIykNo6EkNxJn_nq01-_r3S8i4`
- Body (exact bytes, with the spaces after colons and commas):
  `{"timestamp": 1558138293, "project_id": 11387641093, "data": {"cdn_url": "https://cdn.optimizely.com/datafiles/QMVJcUKEJZFg8pQ2jhAybK.json", "environment": "Production", "origin_url": "https://optimizely.s3.amazonaws.com/datafiles/QMVJcUKEJZFg8pQ2jhAybK.json", "revision": 13}, "event": "project.datafile_updated"}`
- Header: `X-Hub-Signature: sha1=b2493723c6ea6973fbda41573222c8ecb1c82666`

## Common Gotchas

- **Raw body:** Optimizely's own Node sample reads the body with `bodyParser.text({ type: '*/*' })`. In Express 5 use `express.raw({ type: '*/*' })` so any content type works.
- **Whitespace matters:** the signed body contains spaces after `:` and `,`; re-serialising JSON changes the bytes and breaks the signature.
- **Secret shown once:** a lost secret means recreating the webhook.
- **SHA-1, not SHA-256:** this is the legacy `X-Hub-Signature` scheme with a `sha1=` prefix.

## Debugging Verification Failures

- Log the received header and body length, not the secret.
- Confirm the middleware is not parsing the body before verification.
- Confirm `OPTIMIZELY_WEBHOOK_SECRET` is the secret of this webhook, with no whitespace.
- Recompute with `printf '%s' "$BODY" | openssl dgst -sha1 -hmac "$SECRET"`.
