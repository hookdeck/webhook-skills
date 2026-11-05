# How to Verify Instagram Webhook Signatures

Instagram uses Meta's webhook verification: a GET handshake plus an `X-Hub-Signature-256`
signature on every POST. See also the
[Meta reference](https://github.com/hookdeck/webhook-skills/blob/main/skills/facebook-webhooks/references/verification.md).

## 1. GET Handshake

Meta sends `hub.mode=subscribe`, `hub.verify_token` and `hub.challenge` whenever you configure
the webhook in the App Dashboard. Respond `200` with the raw `hub.challenge` when the mode is
`subscribe` and the token matches `INSTAGRAM_VERIFY_TOKEN`; otherwise `403`. (Hookdeck's edge
answers this itself.)

## 2. POST Signature

- Header: `X-Hub-Signature-256: sha256=<hex>`
- Algorithm: HMAC-SHA256, hex-encoded
- Signed content: the raw request body, byte for byte
- Key: the app secret (see below)
- No timestamp is signed, so there is no tolerance window to check

### Which secret signs?

Meta's guide: "Generate a SHA256 signature using the payload and your app's App Secret."
Instagram Login apps also have an Instagram app secret; the docs don't say whether it's used
for webhooks. Try the App Secret first, then the Instagram app secret if verification fails on
an Instagram Login app.

### Node.js

Validate the format with a regex before any `Buffer.from(x, 'hex')` (invalid hex silently
truncates), then compare equal-length buffers with `crypto.timingSafeEqual`:

```javascript
const crypto = require('crypto');

function verifyInstagramSignature(rawBody, signatureHeader, appSecret) {
  const match = /^sha256=([0-9a-f]{64})$/i.exec(signatureHeader || '');
  if (!match || !appSecret) return false;
  const received = Buffer.from(match[1], 'hex');
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest();
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

### Python

```python
import hmac, hashlib, re

def verify_instagram_signature(raw_body: bytes, signature_header: str, app_secret: str) -> bool:
    match = re.fullmatch(r"sha256=([0-9a-fA-F]{64})", signature_header or "")
    if not match or not app_secret:
        return False
    expected = hmac.new(app_secret.encode(), raw_body, hashlib.sha256).hexdigest()
    # bytes on both sides: a non-ASCII header gives 401, not a TypeError/500
    return hmac.compare_digest(match.group(1).lower().encode(), expected.encode())
```

## Common Gotchas

- **Use the raw body.** Meta signs the bytes it sends. Non-ASCII text can arrive as escaped
  unicode (`\u00e4`), and `JSON.stringify(JSON.parse(body))` turns that into `ä`, which
  changes the bytes and breaks the signature. In Express use `express.raw({ type: '*/*' })`;
  in Next.js read `request.arrayBuffer()`; in FastAPI `await request.body()`.
- **Wrong secret.** App Secret vs Instagram app secret; never the verify token or an access token.
- **Prefix required.** Reject a header without `sha256=` (and don't accept the legacy SHA-1
  `X-Hub-Signature`).
- **Duplicates.** Retries over 36 hours mean the same event can arrive more than once. Dedupe
  on comment ID or message `mid`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Handshake never succeeds | Returning JSON instead of the raw `hub.challenge`, or a verify token mismatch |
| Signature always invalid | Body parsed before verifying, or the other secret (App Secret vs Instagram app secret) signs |
| Only Dashboard tests arrive | App not Live, field lacks Advanced Access, or the account isn't subscribed via `/subscribed_apps` |
