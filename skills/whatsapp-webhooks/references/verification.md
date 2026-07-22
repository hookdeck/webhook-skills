# How to Verify WhatsApp Webhook Signatures

WhatsApp (Meta) endpoints must do **two** authentication things: complete the GET
verification handshake once, then verify the `X-Hub-Signature-256` signature on every
POST.

## 1. The GET Verification Handshake

When you register (or re-verify) the callback URL, Meta sends a `GET`:

```
GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<YOUR_TOKEN>&hub.challenge=1158201444
```

| Query param | Meaning |
|-------------|---------|
| `hub.mode` | Always `subscribe` |
| `hub.verify_token` | The verify token you configured in the dashboard |
| `hub.challenge` | A random string Meta expects echoed back |

Respond **only** when `hub.mode === "subscribe"` **and** `hub.verify_token` matches
your stored `WHATSAPP_VERIFY_TOKEN`. Then return HTTP `200` with the **raw
`hub.challenge` value** as the body — plain text, no JSON wrapper, no quotes.
Otherwise return `403`.

```javascript
// Express
app.get('/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge); // echo challenge as plain text
  }
  return res.sendStatus(403);
});
```

## 2. The POST Signature (`X-Hub-Signature-256`)

### How It Works

Meta computes `HMAC-SHA256(raw_request_body, app_secret)` and sends the lowercase hex
digest in the header, prefixed with `sha256=`:

```
X-Hub-Signature-256: sha256=d072b5b5b53a1a04f4a4c3c62b9a679d8e6e1a52c1c9f2a3e8b4f0d61a7c9e35
```

To verify, recompute the HMAC over the **raw body bytes** with your app secret and
compare timing-safe to the value after `sha256=`.

- **Algorithm**: HMAC-SHA256
- **Encoding**: lowercase hex
- **Header**: `X-Hub-Signature-256` (format `sha256=<hex>`)
- **Key**: your Meta **app secret** (`WHATSAPP_APP_SECRET`) — *not* the verify token
- **Signed content**: the exact raw request body

### SDK Support

Meta's official `whatsapp` Node.js SDK is designed for **sending** messages and
calling the Cloud API — it does **not** provide webhook HMAC signature verification.
So verify manually with the standard algorithm below. (This is the same scheme as
GitHub's `X-Hub-Signature-256`, since both are Meta/GitHub Hub signatures.)

### Manual Verification — Node.js

```javascript
const crypto = require('crypto');

function verifyWhatsAppSignature(rawBody, signatureHeader, appSecret) {
  const [algo, sig] = (signatureHeader || '').split('=');
  if (algo !== 'sha256' || !sig) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false; // buffer length mismatch = invalid
  }
}
```

### Manual Verification — Python

```python
import hmac, hashlib

def verify_whatsapp_signature(raw_body: bytes, signature_header: str, app_secret: str) -> bool:
    algo, _, sig = (signature_header or "").partition("=")
    if algo != "sha256" or not sig:
        return False
    expected = hmac.new(app_secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)
```

## Common Gotchas

- **Use the raw body, not parsed JSON.** Meta escapes non-ASCII characters (e.g. `é`
  becomes `\u00e9`). If you `JSON.parse` then re-`stringify`, the bytes differ and the
  signature will never match. Read the raw body first (Express `express.raw`, Next.js
  `await request.text()`, FastAPI `await request.body()`), verify, *then* parse.
- **Wrong secret.** The signature key is the **app secret**, not the verify token and
  not an access token.
- **Handshake body format.** Return the raw `hub.challenge` string — many frameworks
  default to JSON responses, which fails verification (the challenge must be the plain
  body).
- **Dedupe retries.** Retries (up to 7 days) go to every subscribed app; dedupe by the
  `wamid...` message/event id.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Handshake never succeeds | Returning JSON instead of the raw `hub.challenge`, or verify token mismatch |
| Signature always invalid | Body parsed before verifying (unicode re-escaping), or using the verify token instead of the app secret |
| Works locally, fails in prod | App not in Live mode, or a proxy re-serialized the body |
| Intermittent duplicates | Normal — dedupe by message/event id |
