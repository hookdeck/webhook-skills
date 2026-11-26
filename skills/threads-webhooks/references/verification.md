# How to Verify Threads Webhook Signatures

Threads uses Meta's webhook verification: a one-time GET handshake plus an
`X-Hub-Signature-256` signature on every POST. See also the
[Meta reference](https://github.com/hookdeck/webhook-skills/blob/main/skills/facebook-webhooks/references/verification.md).

## 1. GET Handshake

Meta sends `hub.mode=subscribe`, `hub.verify_token` and `hub.challenge`. Respond `200` with
the raw `hub.challenge` as plain text when the mode is `subscribe` and the token matches
`THREADS_VERIFY_TOKEN`; otherwise `403`. (Hookdeck's edge answers this itself.)

## 2. POST Signature

- Header: `X-Hub-Signature-256: sha256=<hex>`
- Algorithm: HMAC-SHA256, hex-encoded
- Signed content: the raw request body
- Key: the Threads App Secret (see below)

Require and strip the `sha256=` prefix, validate the digest, and compare in constant time.

### Which secret signs?

The **Threads App Secret** (Use cases > Customize > Settings in the Threads API use case).
The Threads page doesn't name the key, and Meta's getting-started guide only says "App
Secret", but a live Threads notification (tested 2026-11-18) matched the Threads App Secret
and not the Meta App Secret from App settings > Basic. Meta also sends a legacy
`X-Hub-Signature: sha1=<hex>` with the same key; verify the SHA-256 header.

### Node.js

Check the received value is exactly 64 hex characters before decoding (invalid hex silently
truncates in `Buffer.from(x, 'hex')`), or, as here, compare the lowercase hex strings as
equal-length Buffers:

```javascript
const crypto = require('crypto');

function verifyThreadsSignature(rawBody, signatureHeader, appSecret) {
  const match = /^sha256=([0-9a-f]{64})$/i.exec(signatureHeader || '');
  if (!match || !appSecret) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(match[1].toLowerCase()), Buffer.from(expected));
}
```

### Python

```python
import hmac, hashlib, re

def verify_threads_signature(raw_body: bytes, signature_header: str, app_secret: str) -> bool:
    match = re.fullmatch(r"sha256=([0-9a-fA-F]{64})", signature_header or "")
    if not match or not app_secret:
        return False
    expected = hmac.new(app_secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(match.group(1).lower().encode(), expected.encode())
```

## Common Gotchas

- **Use the raw body.** Verify before JSON parsing. In Express use `express.raw({ type: '*/*' })`.
- **Wrong secret.** Use the Threads App Secret, not the Meta App Secret, the verify token or an access token.
- **Prefix required.** Reject a header without `sha256=`.
- **No timestamp in the signature.** Dedupe on each change's `field`, `target_id` and `value.id` together. For `mentions`, `target_id` is the mentioned user, so notifications about one post for two of your users can share a `value.id`. And `time` records when a notification was sent, so leave it out of the key.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Handshake never succeeds | Returning JSON instead of raw `hub.challenge`, or verify token mismatch |
| Signature always invalid | Body parsed before verifying, or the Meta App Secret used instead of the Threads App Secret |
| Works locally, fails in prod | A proxy re-serialized the body, or the app isn't in Live Mode |
