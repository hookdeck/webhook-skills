# 360Learning Signature Verification

## How It Works

360Learning delivers through Svix and uses the Standard Webhooks signing scheme:

1. Read `webhook-id`, `webhook-timestamp` and `webhook-signature`.
2. Build `signed_content = "{webhook-id}.{webhook-timestamp}.{raw body}"`.
3. Base64-**decode** the subscription's signing secret (strip a `whsec_` prefix first if present) and use the bytes as the HMAC-SHA256 key.
4. Base64-encode the digest and compare it, in constant time, with each `v1,<signature>` entry in `webhook-signature`. Entries are space-separated.
5. Pass if any entry matches. For 24 hours after a rotation there is one entry for the new secret and one for the legacy secret.

360Learning's step 4 just says the key is "your webhook signing secret", but its Node sample decodes it first (`Buffer.from(signingSecret, "base64")`), which is the Standard Webhooks rule. Its docs never show a real secret (the API example is `password123`) or a `whsec_` prefix, so the examples accept the value with or without the prefix.

## The Raw-Body Pitfall in 360Learning's Sample

360Learning's step 3 says to use the raw body exactly as received, then adds that if your framework already parsed it you can re-serialise with `JSON.stringify(payload)`. Its Node sample does exactly that:

```javascript
const signedContent = `${eventId}.${timestamp}.${JSON.stringify(payload)}`; // from 360Learning's sample: fragile
```

That works only while `JSON.stringify` reproduces the sent bytes. Pretty-printing, different key order, a number like `1.0`, or a `é` escape all change the output and the signature fails. Read the raw bytes instead:

| Framework | Raw body |
|-----------|----------|
| Express | `express.raw({ type: '*/*' })` on the webhook route; `req.body` is a `Buffer` |
| Next.js App Router | `Buffer.from(await request.arrayBuffer())` (or `await request.text()`) |
| FastAPI | `await request.body()` |

Each example's test suite signs a pretty-printed body with an escape and shows that the re-serialised version fails.

The same sample calls `crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computedSignature))` without checking lengths, which throws on a signature of a different length. Compare lengths first, or compare the decoded digests as the examples do.

## Node.js

```javascript
const crypto = require('crypto');

function verify360LearningWebhook(rawBody, headers, secrets, toleranceSeconds = null) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  const secretList = [].concat(secrets).filter(Boolean);   // one per subscription
  if (!id || !timestamp || !signatureHeader || secretList.length === 0) return false;
  if (!/^\d+$/.test(timestamp)) return false;
  if (toleranceSeconds !== null &&
      Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSeconds) return false;

  const given = signatureHeader.trim().split(/\s+/)
    .map((entry) => entry.split(','))
    .filter(([version, sig]) => version === 'v1' && sig)
    .map(([, sig]) => Buffer.from(sig, 'base64'));

  return secretList.some((secret) => {
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const expected = crypto.createHmac('sha256', key)
      .update(`${id}.${timestamp}.`).update(rawBody).digest();
    return given.some((sig) => sig.length === expected.length && crypto.timingSafeEqual(sig, expected));
  });
}
```

## Python

```python
import base64, binascii, hashlib, hmac, time

def verify_360learning_webhook(raw_body: bytes, headers, secrets, tolerance_seconds=None) -> bool:
    webhook_id = headers.get("webhook-id")
    timestamp = headers.get("webhook-timestamp")
    signature_header = headers.get("webhook-signature")
    secret_list = [secrets] if isinstance(secrets, str) else [s for s in secrets or [] if s]
    if not (webhook_id and timestamp and signature_header and secret_list) or not timestamp.isdigit():
        return False
    if tolerance_seconds is not None and abs(int(time.time()) - int(timestamp)) > tolerance_seconds:
        return False
    given = []
    for entry in signature_header.split():
        version, _, signature = entry.partition(",")
        if version == "v1" and signature:
            try:
                given.append(base64.b64decode(signature))
            except (binascii.Error, ValueError):
                pass
    for secret in secret_list:
        try:
            key = base64.b64decode(secret.removeprefix("whsec_"), validate=True)
        except (binascii.Error, ValueError):
            continue
        expected = hmac.new(key, f"{webhook_id}.{timestamp}.".encode() + raw_body, hashlib.sha256).digest()
        if any(hmac.compare_digest(sig, expected) for sig in given):
            return True
    return False
```

## Test Vector

360Learning doesn't publish a complete vector (its example signature comes without the secret). The examples check the Standard Webhooks reference vector, which uses the same algorithm:

```
secret            = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw"
webhook-id        = "msg_p5jXN8AQM9LWM0D4loKWxJek"
webhook-timestamp = "1614265330"
body              = '{"test": 2432232314}'
webhook-signature = "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE="
```

## Can I Use the Svix Libraries?

360Learning points to [Svix's official SDKs](https://docs.svix.com/receiving/verifying-payloads/how) as an optional shortcut. `new Webhook(secret).verify(rawBody, headers)` (npm `svix`, PyPI `svix`) computes the same signature. It takes one secret and always enforces a 5-minute timestamp window, which rejects any delivery replayed later through a queue or relay. The examples verify manually so the window stays optional and several subscription secrets can be checked.

## Timestamp Tolerance

360Learning's best practices recommend rejecting a `webhook-timestamp` outside a window such as 5 minutes. `webhook-timestamp` is when each attempt was emitted, so live deliveries and 360Learning's own retries pass. A delivery replayed later through a relay keeps its original timestamp and fails a window. The examples read `THREE_SIXTY_LEARNING_WEBHOOK_TOLERANCE_SECONDS` (off by default) and always dedupe on `webhook-id`.

## Gotchas

| Symptom | Cause |
|---------|-------|
| Signature never matches | The body was parsed and re-serialised (as in 360Learning's sample). Verify the raw bytes. |
| Signature never matches | The secret string was used as the HMAC key. Base64-decode it first. |
| Only some event types verify | Each subscription has its own secret. Configure the secret of every subscription that posts to this route. |
| Signature never matches | The `v1,` prefix wasn't removed, or the whole header was compared instead of each entry. |
| Fails 24 hours after a rotation | The legacy secret was retired. Deploy the secret returned by `POST .../secrets/rotate`. |
| `whsec_` secret fails to decode | Strip `whsec_` before base64-decoding. |
| Comparison throws in Node | `crypto.timingSafeEqual` needs equal-length buffers; check lengths first. |

## Debugging

1. Run your verifier against the test vector above. If that fails, the code is wrong; if it passes, the secret or raw body is wrong.
2. Check you're using the secret of the subscription for this event type (Settings > Webhooks > **See secret**).
3. Log the length of the raw body and compare it with the `Content-Length` header.
