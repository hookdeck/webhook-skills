# How to Verify Cyera Webhook Signatures

## How It Works

From Cyera's docs: "Concatenate the timestamp and body to a single string (e.g.
`$TIMESTAMP:$PAYLOAD`)." Then "Calculate the HMAC-SHA256 signature for the string, using the
Webhook Secret. Convert the signature to the printable ASCII characters (base64). Compare the
signature with the webhook signature from the request header `X-Webhook-Signature`."

| Item | Value |
|------|-------|
| Signature header | `X-Webhook-Signature` |
| Timestamp header | `X-Webhook-Timestamp` (Unix seconds) |
| Algorithm | HMAC-SHA256 |
| Signed message | `{X-Webhook-Timestamp}` + `:` + raw body bytes |
| Encoding | Standard base64, padded (44 chars, `[A-Za-z0-9+/]{43}=`), no prefix |
| Key | The Webhook Secret's UTF-8 bytes, used as-is (examples look like `dgwebhook...`) |

This matches Hookdeck's `CYERA` source: HMAC, `sha256`, header `x-webhook-signature`, base64,
signed content template `{header:x-webhook-timestamp}:{body}`.

## Build the Message as Bytes

- Literal separator `:` as UTF-8
- Timestamp header value: the exact header string, encoded latin1 (`Buffer.from(value, 'latin1')`,
  `value.encode('latin-1')`). Never trim, parse or re-format it.
- Body: the raw bytes as received, joined with `Buffer.concat` / `b''.join`

Never decode the body to a string and re-encode it, and never `JSON.parse` / `JSON.stringify`
before verifying.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyCyera(rawBody, headers, secret) {
  const sig = headers['x-webhook-signature'];
  const ts = headers['x-webhook-timestamp'];
  if (!sig || !ts || !/^[A-Za-z0-9+/]{43}=$/.test(sig)) return false;
  const expected = crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(Buffer.concat([Buffer.from(ts, 'latin1'), Buffer.from(':'), rawBody]))
    .digest();
  const received = Buffer.from(sig, 'base64'); // safe: format validated above
  if (received.toString('base64') !== sig) return false; // non-canonical encoding
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

### Python

```python
import base64, hashlib, hmac, re

def verify_cyera(raw: bytes, sig: str, ts: str, secret: str) -> bool:
    if not sig or not ts or not re.fullmatch(r"[A-Za-z0-9+/]{43}=", sig):
        return False
    received = base64.b64decode(sig, validate=True)
    if base64.b64encode(received).decode("ascii") != sig:  # non-canonical encoding
        return False
    expected = hmac.new(secret.encode("utf-8"), ts.encode("latin-1") + b":" + raw, hashlib.sha256).digest()
    return hmac.compare_digest(received, expected)  # bytes, never str
```

Cyera's webhook docs describe the algorithm but no SDK helper, so the examples verify manually.
Complete handlers with tests: [Express](../examples/express/), [Next.js](../examples/nextjs/),
[FastAPI](../examples/fastapi/).

## Timestamp Tolerance (Opt-In)

Cyera's docs include the timestamp in the signed content but describe no freshness window.
The examples do **not** reject old timestamps by default: Hookdeck retries and replays resend the
original headers and timestamp, and Hookdeck itself applies no tolerance, so a fixed window would
reject legitimate retries. To opt in, set `CYERA_WEBHOOK_TOLERANCE_SECONDS` (for example `300`);
unset or `0` turns it off. When enabled, the timestamp must be digits (Unix seconds).

## Common Gotchas

- **Raw body**: use `express.raw({ type: '*/*' })` (any content type), `await request.arrayBuffer()` (Next.js), `await request.body()` (FastAPI). Parsed-and-reserialized JSON changes bytes and breaks the signature.
- **Separator is a colon**, not a dot: `{timestamp}:{body}`.
- **No prefix**: the header is the bare base64 digest; don't look for `sha256=` or split on commas.
- **Base64, not hex**, and case-sensitive. Require the 44-character padded form.
- **Validate before decoding**: `Buffer.from(sig, 'base64')` silently drops bad characters, so check length and alphabet first.
- **Secret is not decoded**: use the UTF-8 bytes of the whole `dgwebhook...` string.
- **Header values are latin1**: don't trim or reformat the timestamp header.

## Status Codes

| Situation | Status |
|-----------|--------|
| Missing/empty signature or timestamp, malformed signature, mismatch | `401` |
| Valid signature but body is not JSON | `400` |
| Secret not configured | `500` |

## Debugging Verification Failures

1. Log the raw body length and the two headers; compare with what Cyera sent.
2. Confirm the secret is the Webhook Secret from the Cyera Privacy webhook integration, with no whitespace.
3. Confirm nothing (a proxy, body parser, or logging middleware) rewrote the body.
4. Recompute with `{timestamp}:{body}` and base64 output; a hex or dotted variant will not match.
5. Make sure you read the timestamp from `X-Webhook-Timestamp`, not the current time.
