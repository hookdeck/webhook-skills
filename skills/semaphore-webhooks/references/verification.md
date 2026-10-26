# How to Verify Semaphore CI Webhook Signatures

## How Does Semaphore Sign Webhooks?

When a notification names a secret, Semaphore adds `X-Semaphore-Signature-256` to the request. The
value is the **lowercase hex HMAC-SHA256 of the raw request body**, keyed with the `WEBHOOK_SECRET`
value of the organization secret. In Semaphore's open-source signer this is
`:crypto.mac(:hmac, :sha256, secret, body) |> Base.encode16(case: :lower)`.

- Header value: the whole value is the digest, with no `sha256=` prefix and no list.
- Signed content: the body bytes only. No timestamp, id or other header is signed.
- Key: the secret's UTF-8 bytes, used as-is.
- The docs state the algorithm; the hex encoding comes from the signer's source.

## How Do I Implement It?

### Node.js (Express / Next.js)

```javascript
const crypto = require('crypto');

function verifySemaphoreSignature(rawBody, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature.toLowerCase()));
}
```

### Python (FastAPI)

```python
import hashlib, hmac, re

def verify_semaphore_signature(raw_body: bytes, signature, secret) -> bool:
    if not secret or not signature or not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode(), signature.lower().encode())
```

Use `re.fullmatch` (or `\Z`): a `$` anchor also matches before a trailing newline.

## Common Gotchas

- **Use the raw body.** Parsing and re-serializing JSON changes the bytes. Express:
  `express.raw({ type: '*/*' })`. Next.js: `await request.arrayBuffer()`. FastAPI: `await request.body()`.
- **No signature without a secret.** If the notification doesn't name a secret, the header is absent
  and verification fails (401). Set `--webhook-secret`.
- **The key is the `WEBHOOK_SECRET` value**, not the name of the Semaphore secret.
- **Validate before comparing.** Require exactly 64 hex characters. Don't call
  `Buffer.from(sig, 'hex')` on an unvalidated value, because it silently drops bad characters.
- **No replay protection.** Nothing time-based is signed, so there is no tolerance window to apply.
  Dedupe on `X-Semaphore-Webhook-Id`.
- **Any method.** The docs don't name the HTTP method. Verify the signature for every method, and
  verify a body-less request over zero bytes.
- **Any response ends delivery.** Semaphore doesn't retry a 401 or a 500, only a timeout.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| No `X-Semaphore-Signature-256` header | The notification has no secret set |
| Signature always mismatches | Body parsed before verifying, wrong secret value, or a proxy changed the body |
| Fails only after Hookdeck | The Hookdeck source's webhook secret differs from the notification's `WEBHOOK_SECRET` |
| 401 on GET or DELETE | Verify over zero bytes: HMAC of the empty body, not skipping the check |
