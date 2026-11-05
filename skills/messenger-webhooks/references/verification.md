# How to Verify Facebook Messenger Webhook Signatures

Messenger uses Meta's webhook verification: a GET handshake plus an `X-Hub-Signature-256`
signature on every POST. See also the
[Meta reference](https://github.com/hookdeck/webhook-skills/blob/main/skills/facebook-webhooks/references/verification.md).

## 1. GET Handshake

Meta sends `hub.mode=subscribe`, `hub.verify_token` and `hub.challenge` whenever you configure
the webhook. Respond `200` with the raw `hub.challenge` when the mode is `subscribe` and the
token matches `MESSENGER_VERIFY_TOKEN`; otherwise `403`. (Hookdeck's edge answers this itself.)

## 2. POST Signature

- Header: `X-Hub-Signature-256: sha256=<hex>`
- Algorithm: HMAC-SHA256, hex-encoded
- Signed content: the payload bytes as sent (escaped-unicode JSON)
- Key: the App Secret (App settings > Basic)
- No timestamp is signed, so there is no tolerance window to check

### Escaped unicode: verify the raw bytes

Meta's docs: "we generate the signature using an *escaped unicode* version of the payload,
with lowercase hex digits. If you just calculate against the decoded bytes, you will end up
with a different signature. For example, the string `äöå` should be escaped to
`äöå`."

The note describes the signed form, not the wire format, but the practical rule is the same:
HMAC the body bytes exactly as they arrive and never a decoded or re-serialized copy.
`JSON.stringify(JSON.parse(body))` (or Python's `json.dumps(..., ensure_ascii=False)`) turns
`ä` into `ä`, the bytes change, and the signature no longer matches. Meta's own sample
computes the HMAC over the raw `buf` passed to its body-parser verify function.

### Node.js

Validate the format with a regex before any `Buffer.from(x, 'hex')` (invalid hex silently
truncates), then compare equal-length buffers with `crypto.timingSafeEqual`. (Meta's sample
uses `!=`, which isn't constant-time.)

```javascript
const crypto = require('crypto');

function verifyMessengerSignature(rawBody, signatureHeader, appSecret) {
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

def verify_messenger_signature(raw_body: bytes, signature_header: str, app_secret: str) -> bool:
    match = re.fullmatch(r"sha256=([0-9a-fA-F]{64})", signature_header or "")
    if not match or not app_secret:
        return False
    expected = hmac.new(app_secret.encode(), raw_body, hashlib.sha256).hexdigest()
    # bytes on both sides: a non-ASCII header gives 401, not a TypeError/500
    return hmac.compare_digest(match.group(1).lower().encode(), expected.encode())
```

## Common Gotchas

- **Raw body only.** In Express use `express.raw({ type: '*/*' })` (not `express.json()`); in
  Next.js `request.arrayBuffer()`; in FastAPI `await request.body()`.
- **Missing header.** Meta's sample only warns when the header is missing. Reject it instead.
- **Prefix required.** Reject a header without `sha256=`; ignore the legacy SHA-1 `X-Hub-Signature`.
- **Wrong secret.** Use the App Secret, not the verify token or a Page access token.
- **Slow handlers.** Respond within 5 seconds; an hour of failures unsubscribes the app.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Handshake never succeeds | Returning JSON instead of the raw `hub.challenge`, or verify token mismatch |
| Fails only for messages with emoji/accents | HMAC computed over decoded or re-serialized JSON instead of the raw bytes |
| Signature always invalid | Body parsed by a JSON middleware first, or the wrong app's secret |
| Only your own test messages arrive | App has Standard Access; customers need Advanced Access |
