# Loops Signature Verification

## How It Works

1. Read `Webhook-Id`, `Webhook-Timestamp` and `Webhook-Signature`.
2. Build `signed_content = "{Webhook-Id}.{Webhook-Timestamp}.{raw body}"`.
3. Strip a `whsec_` prefix from the signing secret if present, base64-**decode** the rest and use the bytes as the HMAC-SHA256 key.
4. Base64-encode the digest and compare it, in constant time, with each `v1,<signature>` entry in `Webhook-Signature`. Entries are separated by whitespace; ignore other versions.
5. Pass if any entry matches. For 24 hours after you roll the secret, the header carries one signature per secret.

This is the Standard Webhooks signing scheme. Loops' docs don't show a full secret; their example handles a `whsec_` prefix (`SECRET_PREFIX = 'whsec_'`) and also works without one, and so do the examples here.

## Loops' Example, Compared

Loops publishes a TypeScript `verifyWebhook` for Next.js. The examples here follow it, with these differences:

| Loops' example | These examples | Why |
|----------------|----------------|-----|
| Always rejects a timestamp more than 300 s from now (`TOLERANCE_SECONDS = 300`) | Window is opt-in via `LOOPS_WEBHOOK_TOLERANCE_SECONDS` | A delivery replayed later through a queue or relay keeps its original timestamp and would fail. Dedupe on `Webhook-Id` instead. |
| Compares base64 strings (`timingSafeEqual(value, expected)` after a length check) | Compares decoded digests | Equivalent; both are constant time and check lengths first. |
| `Number.isFinite(ts)` | Timestamp must be all digits | Rejects values like `1e9` or `-5`. |
| `401` for a bad signature or timestamp, `400` for missing headers, `500` for a missing secret | `400` for any verification failure, `500` for a missing secret | Either is fine; Loops retries any non-`2xx`. |
| `req.text()` | `request.arrayBuffer()` / `express.raw()` / `await request.body()` | All read the raw body. Never verify `JSON.stringify(await req.json())`. |

## Node.js

```javascript
const crypto = require('crypto');

function verifyLoopsWebhook(rawBody, headers, secret, toleranceSeconds = null) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  if (!id || !timestamp || !signatureHeader || !secret) return false;
  if (!/^\d+$/.test(timestamp)) return false;
  if (toleranceSeconds !== null &&
      Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSeconds) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key)
    .update(`${id}.${timestamp}.`).update(rawBody).digest();

  return signatureHeader.trim().split(/\s+/).some((entry) => {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) return false;
    const given = Buffer.from(signature, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}
```

## Python

```python
import base64, binascii, hashlib, hmac, time

def verify_loops_webhook(raw_body: bytes, headers, secret: str, tolerance_seconds=None) -> bool:
    webhook_id = headers.get("webhook-id")
    timestamp = headers.get("webhook-timestamp")
    signature_header = headers.get("webhook-signature")
    if not (webhook_id and timestamp and signature_header and secret) or not timestamp.isdigit():
        return False
    if tolerance_seconds is not None and abs(int(time.time()) - int(timestamp)) > tolerance_seconds:
        return False
    try:
        key = base64.b64decode(secret.removeprefix("whsec_"), validate=True)
    except (binascii.Error, ValueError):
        return False
    expected = hmac.new(key, f"{webhook_id}.{timestamp}.".encode() + raw_body, hashlib.sha256).digest()
    for entry in signature_header.split():
        version, _, signature = entry.partition(",")
        if version != "v1" or not signature:
            continue
        try:
            given = base64.b64decode(signature)
        except (binascii.Error, ValueError):
            continue
        if hmac.compare_digest(given, expected):
            return True
    return False
```

## Test Vector

Loops doesn't publish a signed sample. The examples check the Standard Webhooks reference vector, which uses the same algorithm (it is not a Loops secret):

```
secret            = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"
webhook-id        = "msg_p5jXN8AQM9LWM0D4loKWxJek"
webhook-timestamp = "1614265330"
body              = '{"test": 2432232314}'
webhook-signature = "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE="
```

For an end-to-end check against Loops itself, send the test request from Settings -> Webhooks.

## Can I Use the Standard Webhooks Library?

The `standardwebhooks` packages (npm, PyPI) implement the same scheme. They always enforce a 5-minute timestamp window, which rejects any delivery replayed later through a queue or relay. Loops doesn't mention them; the examples verify manually so the window stays optional.

## Timestamp Tolerance

Loops' example rejects timestamps more than 300 seconds old. Loops sends `Webhook-Timestamp` as the timestamp of the request, so live deliveries pass. A delivery you replay later through a relay keeps its original timestamp and fails a window. The examples read `LOOPS_WEBHOOK_TOLERANCE_SECONDS` (off by default) and always dedupe on `Webhook-Id`.

## Gotchas

| Symptom | Cause |
|---------|-------|
| Signature never matches | The body was parsed and re-serialised. Verify the raw bytes. |
| Signature never matches | The secret string was used as the HMAC key. Strip `whsec_` and base64-decode it first. |
| Signature never matches | The `v1,` prefix wasn't removed, or the whole header was compared instead of each entry. |
| Fails 24 hours after rolling the secret | The old secret expired. Deploy the new one from Settings -> Webhooks. |
| Test request passes, later replays fail | A timestamp window is on and the replay kept its original timestamp. Widen or drop the window. |
| Comparison throws in Node | `crypto.timingSafeEqual` needs equal-length buffers; check lengths first. |

## Debugging

1. Run your verifier against the test vector above. If that fails, the code is wrong; if it passes, the secret or raw body is wrong.
2. Send the test request from Settings -> Webhooks and read your endpoint's response in the **Messages** section of that page.
3. Log the length of the raw body and compare it with the `Content-Length` header.
