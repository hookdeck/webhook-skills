# How to Verify Quicknode Webhook Signatures

## How It Works

Every Streams and Webhooks delivery carries three headers:

| Header | Role |
|--------|------|
| `X-QN-Nonce` | Unique string that prevents replay attacks |
| `X-QN-Timestamp` | When the message was signed |
| `X-QN-Signature` | The HMAC to verify |

Quicknode computes a **lowercase hex HMAC-SHA256**, keyed with the stream's or webhook's security token, over:

```
X-QN-Nonce value + X-QN-Timestamp value + raw request body
```

There is **no separator** between the parts (the docs build it as `nonce + timestamp + payload`). `X-QN-Signature` holds the bare digest with no prefix, and you compare the whole header value as one digest (no list splitting).

## Implementation

Build the signed message as bytes:

- Header values: the exact header string encoded latin1 (`Buffer.from(value, 'latin1')`, `value.encode('latin-1')`). Never trim or reformat them.
- Body: the raw bytes as received. Never decode and re-encode, and never `JSON.parse`/`JSON.stringify` before verifying.
- Key: the secret's UTF-8 bytes, as-is.

### Node.js

```javascript
const crypto = require('crypto');
const HEX_64 = /^[0-9a-fA-F]{64}$/;

function verify(rawBody, headers, secret) {
  const sig = headers['x-qn-signature'];
  const nonce = headers['x-qn-nonce'];
  const ts = headers['x-qn-timestamp'];
  if (!sig || !nonce || !ts || !HEX_64.test(sig)) return false;

  const content = Buffer.concat([Buffer.from(nonce, 'latin1'), Buffer.from(ts, 'latin1'), rawBody]);
  const expected = crypto.createHmac('sha256', secret).update(content).digest();
  const received = Buffer.from(sig.toLowerCase(), 'hex'); // format validated first
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

Validate the format before `Buffer.from(sig, 'hex')`: it silently drops bad characters instead of failing.

### Python

```python
import hashlib, hmac, re

def verify(raw_body: bytes, headers, secret: str) -> bool:
    sig = headers.get("x-qn-signature")
    nonce = headers.get("x-qn-nonce")
    ts = headers.get("x-qn-timestamp")
    if not (sig and nonce and ts and re.fullmatch(r"[0-9a-fA-F]{64}", sig)):
        return False
    content = b"".join([nonce.encode("latin-1"), ts.encode("latin-1"), raw_body])
    expected = hmac.new(secret.encode("utf-8"), content, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(sig), expected)  # bytes, never str
```

Quicknode's own guide shows Node.js, Python and Go samples and does not document an SDK helper, so the examples verify manually. See the complete handlers in [examples/express](../examples/express/), [examples/nextjs](../examples/nextjs/) and [examples/fastapi](../examples/fastapi/).

## Common Gotchas

### Keep gzip off

Quicknode signs the **uncompressed** JSON, while a gzip delivery carries compressed bytes on the wire. A verifier that reads the raw request body, Hookdeck's included, fails on compressed deliveries. Keep payload compression (gzip) off on the stream or webhook: Quicknode signs the uncompressed body.

(Quicknode's guide notes that Express body parsers, including `express.raw()`, inflate gzip bodies automatically, so a handler that reads from them sees the decoded bytes. That does not help once Hookdeck or another proxy verifies the wire bytes, so turning compression off is the reliable fix.)

### No separators

`nonce + timestamp + body` has no dots or other delimiters. A signature built as `nonce.timestamp.body` will never match.

### Use the raw body

Any parse-and-reserialise step changes whitespace or key order and breaks the HMAC. Use `express.raw({ type: '*/*' })` in Express, `await request.arrayBuffer()` in Next.js and `await request.body()` in FastAPI, and parse JSON only after the check.

### Timestamp tolerance is opt-in

Do not reject old timestamps by default. Hookdeck retries and replays resend the original headers and timestamp, and Hookdeck itself applies no tolerance, so a fixed window would reject legitimate retries. If you want one, set `QUICKNODE_WEBHOOK_TOLERANCE_SECONDS` (unset or `0` = off). The `X-QN-Timestamp` unit is not documented, so the examples parse it only when you opt in, accepting epoch seconds, epoch milliseconds or an ISO 8601 string. Check what your deliveries actually carry before relying on it.

### Replays

`X-QN-Nonce` is unique per message. Record the nonce after you have processed a delivery successfully and acknowledge repeats without reprocessing them. Do not record it before processing, or a retry of a failed delivery would be dropped.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request returns `401` | Wrong security token (a different stream or webhook), or the token was decoded instead of used as UTF-8 |
| Only some deliveries fail | Gzip compression is on for the stream or webhook |
| Always fails after a framework upgrade | Body is parsed or re-serialised before verification |
| Fails in Next.js | Used `request.json()` or `request.text()` with a transform instead of the raw bytes |
| Fails with non-ASCII header values | Header values were not encoded latin1 or were trimmed |
| Old retries rejected | A timestamp tolerance is enabled behind Hookdeck; turn it off |
