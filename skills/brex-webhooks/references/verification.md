# Brex Signature Verification

## How It Works

Brex uses the Standard Webhooks signing scheme:

1. Read `Webhook-Id`, `Webhook-Timestamp` and `Webhook-Signature`.
2. Build `signed_content = "{Webhook-Id}.{Webhook-Timestamp}.{raw body}"`.
3. Base64-**decode** the secret from `GET /v1/webhooks/secrets` (strip a `whsec_` prefix first if present) and use the bytes as the HMAC-SHA256 key.
4. Base64-encode the digest and compare it, in constant time, with each `v1,<signature>` entry in `Webhook-Signature`. Entries are space-separated; ignore other versions (Brex's example header includes a `v2,` entry).
5. Pass if any entry matches. During a key rotation there is one entry per key.

## Brex's Sample Vector

Brex publishes this verified sample (timestamp check excluded). Every example test suite checks it.

```
payload           = '{"event_type": "TRANSFER_PROCESSED", "transfer_id": "dptx_ckyypz30n000101kgzgnrtqlf", "company_id": "cuacc_ckqckhadg000601r95ox48c2s"}'
secret            = "4j7OxQ4wlv1GmkZ9qLjoFjEFXjpzvHkr"
webhook_id        = "msg_24Ky2257Hzd0tgc5bWs8TwK9Kod"
webhook_timestamp = "1643393361"
webhook_signature = "v1,6mFFi/Bg0gw1Yz2KJwZSVq6Bh+XzllS7JVltAlZ8yCU= v1,9dEEi/Bg0gw1Yz2KJwZSVq6Bh+XzllS7JVltAlZ8yDY="
```

The first entry matches; the second stands in for a rotated-out key.

## Node.js

```javascript
const crypto = require('crypto');

function verifyBrexWebhook(rawBody, headers, secret, toleranceSeconds = null) {
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

  return signatureHeader.split(' ').some((entry) => {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) return false;
    const given = Buffer.from(signature, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}
```

## Python

```python
import base64, hashlib, hmac, time

def verify_brex_webhook(raw_body: bytes, headers, secret: str, tolerance_seconds=None) -> bool:
    webhook_id = headers.get("webhook-id")
    timestamp = headers.get("webhook-timestamp")
    signature_header = headers.get("webhook-signature")
    if not (webhook_id and timestamp and signature_header and secret) or not timestamp.isdigit():
        return False
    if tolerance_seconds is not None and abs(int(time.time()) - int(timestamp)) > tolerance_seconds:
        return False
    key = base64.b64decode(secret.removeprefix("whsec_"))
    expected = hmac.new(key, f"{webhook_id}.{timestamp}.".encode() + raw_body, hashlib.sha256).digest()
    for entry in signature_header.split(" "):
        version, _, signature = entry.partition(",")
        if version == "v1" and signature and hmac.compare_digest(base64.b64decode(signature), expected):
            return True
    return False
```

## Can I Use the Standard Webhooks Libraries?

The `standardwebhooks` libraries (npm, PyPI) compute the same signature and accept a bare base64 secret or a `whsec_` one. They always enforce a 5-minute timestamp window, which rejects any delivery replayed later through a queue or relay. The examples verify manually so the window stays optional.

## Timestamp Tolerance

Brex's guide recommends comparing `Webhook-Timestamp` with your clock to block replays; its Node sample uses 60 seconds. Brex stamps each attempt, so live deliveries pass. A delivery you replay later through a relay keeps its original timestamp and fails a window. The examples read `BREX_WEBHOOK_TOLERANCE_SECONDS` (off by default) and always dedupe on `Webhook-Id`.

## Gotchas

| Symptom | Cause |
|---------|-------|
| Signature never matches | The secret string was used as the HMAC key. Base64-decode it first. |
| Signature never matches | The body was parsed and re-serialised. Verify the raw bytes (`express.raw`, `request.arrayBuffer()`, `await request.body()`). |
| Signature never matches | The `v1,` prefix wasn't removed, or the whole header was compared instead of each entry. |
| Fails after a rotation | Only the old key is configured and it was revoked. Fetch `GET /v1/webhooks/secrets` again and use the `ACTIVE` secret. |
| `whsec_` secret fails to decode | Strip `whsec_` before base64-decoding. |
| Comparison throws in Node | `crypto.timingSafeEqual` needs equal-length buffers; check lengths first. |

## Debugging

1. Run your verifier against Brex's sample vector above. If that fails, the code is wrong; if it passes, the secret or raw body is wrong.
2. Log the lengths of the decoded key (Brex's sample key decodes to 24 bytes) and the raw body.
3. Confirm you're using the secret for the same environment (production vs `api-staging.brex.com`).
