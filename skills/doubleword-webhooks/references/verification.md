# How to Verify Doubleword Webhook Signatures

## How Does Doubleword Sign Webhooks?

Doubleword uses [Standard Webhooks](https://www.standardwebhooks.com/):

| Item | Value |
|------|-------|
| Headers | `webhook-id`, `webhook-timestamp` (Unix seconds), `webhook-signature` |
| Algorithm | HMAC-SHA256, base64 output |
| Signed content | `{webhook-id}.{webhook-timestamp}.{raw request body}` |
| Signature header | One or more space-separated entries, each `v1,<base64>` |
| Key | The signing key from your profile is `whsec_` + base64. Strip the prefix and base64-decode to get the raw key |
| Env var | `DOUBLEWORD_WEBHOOK_SECRET` holds the full `whsec_` value |

Hookdeck's Doubleword source behaves the same way: it tries every `v1` entry, ignores other
versions such as `v1a`, uses a non-`whsec_` secret as raw UTF-8 bytes, and also reads the other
header prefix (`webhook-*` or `svix-*`).

## Library Verification (recommended)

Use `standardwebhooks` (npm and PyPI). Read the `webhook-*` headers, fall back to `svix-*` when
`webhook-id` is absent, and pass the values under the `webhook-*` names the library expects.

```javascript
const { Webhook } = require('standardwebhooks');

const prefix = req.get('webhook-id') ? 'webhook' : 'svix';
const headers = {
  'webhook-id': req.get(`${prefix}-id`),
  'webhook-timestamp': req.get(`${prefix}-timestamp`),
  'webhook-signature': req.get(`${prefix}-signature`),
};
new Webhook(process.env.DOUBLEWORD_WEBHOOK_SECRET).verify(rawBody, headers, { jsonParse: false });
```

```python
from standardwebhooks.webhooks import Webhook

prefix = "webhook" if request.headers.get("webhook-id") else "svix"
headers = {
    "webhook-id": request.headers.get(f"{prefix}-id", ""),
    "webhook-timestamp": request.headers.get(f"{prefix}-timestamp", ""),
    "webhook-signature": request.headers.get(f"{prefix}-signature", ""),
}
Webhook(secret).verify(raw_body, headers, json_parse=False)
```

For a secret that does not start with `whsec_`, pass raw bytes (JS: `new Webhook(new TextEncoder().encode(s), { format: 'raw' })`,
Python: `Webhook(s.encode())`), since the library otherwise base64-decodes it.

### The 5-minute window and Hookdeck retries

The library always enforces a fixed 5-minute timestamp window and cannot be configured. Hookdeck
retries and replays resend the original timestamp, so the library rejects a retry or replay that
arrives more than 5 minutes after the original send. Behind Hookdeck, use the manual verifier below
with the window dropped or widened.

## Manual Verification (configurable window)

Compare every `v1` entry in constant time after a length check, and require the timestamp to be a
plain positive integer. Leave the tolerance argument unset (null/None) to drop the window, or pass a larger number of seconds to widen it.

```javascript
const crypto = require('crypto');

function verifyDoubleword(rawBody, { id, timestamp, signature }, secret, toleranceSeconds = null) {
  if (!id || !timestamp || !signature || !/^[1-9][0-9]*$/.test(timestamp)) return false;
  if (toleranceSeconds !== null &&
      Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;

  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')
    : Buffer.from(secret, 'utf8');
  const expected = crypto.createHmac('sha256', key)
    .update(`${id}.${timestamp}.`).update(rawBody).digest();   // rawBody: Buffer of the exact bytes

  return signature.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}
```

```python
import base64, hashlib, hmac, re, time

def verify_doubleword(raw_body: bytes, msg_id: str, timestamp: str, signature: str,
                      secret: str, tolerance_seconds=None) -> bool:
    if not (msg_id and timestamp and signature) or not re.fullmatch(r"[1-9][0-9]*", timestamp):
        return False
    if tolerance_seconds is not None and abs(time.time() - int(timestamp)) > tolerance_seconds:
        return False

    key = base64.b64decode(secret[6:]) if secret.startswith("whsec_") else secret.encode()
    expected = hmac.new(key, f"{msg_id}.{timestamp}.".encode() + raw_body, hashlib.sha256).digest()

    for entry in signature.split(" "):
        version, _, sig = entry.partition(",")
        if version != "v1" or not sig:
            continue
        try:
            given = base64.b64decode(sig, validate=True)
        except ValueError:
            continue
        if len(given) == len(expected) and hmac.compare_digest(given, expected):
            return True
    return False
```

## Common Gotchas

- **Raw body:** verify the exact bytes. Parsing and re-serializing JSON changes them. In Express use `express.raw({ type: '*/*' })`, in Next.js `request.text()`, in FastAPI `await request.body()`.
- **Key decoding:** the key is the base64-decoded part after `whsec_`. Using the string itself as the HMAC key fails every time.
- **Several signatures:** the header may hold several space-separated `v1,<base64>` entries; accept if any matches.
- **Other versions:** ignore entries that are not `v1` (for example `v1a`).
- **Timestamp window:** the library's fixed 5-minute window rejects late Hookdeck retries and replays (see above).
- **Header names:** the library reads `webhook-*` only; remap `svix-*` deliveries.
- **Fail closed:** return `500` (or refuse to start) when `DOUBLEWORD_WEBHOOK_SECRET` is unset; never skip verification.

## How to Debug Verification Failures

1. Print the raw body length and compare it with what the sender signed (a body-parser middleware is the usual culprit).
2. Confirm `DOUBLEWORD_WEBHOOK_SECRET` is the full value copied from the profile, with the `whsec_` prefix and no whitespace.
3. Check `webhook-timestamp` against the server clock; the library rejects anything outside 5 minutes.
4. Make sure the signed string is `{id}.{timestamp}.{body}` with the dots, using the `webhook-id` of this delivery.
5. Respond 400 or 401 for missing headers or a bad signature so failed deliveries are visible.
