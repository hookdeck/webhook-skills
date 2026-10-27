# How to Verify LearnUpon Webhook Signatures

## How Does LearnUpon Sign Webhooks?

Every v2.0 delivery carries `X-Webhook-Signature`: the lowercase hex HMAC-SHA256 of the **raw request
body**, keyed with the secret from your webhook configuration. The docs' steps: get the raw body,
extract the header, hash the raw body with SHA-256 and the secret, convert to hex, compare.

```
X-Webhook-Signature: a403759157e609bf3852001ff9d83db59b454a82841c4369b0e65d066035af45
```

- The header is the bare digest: no `sha256=` prefix, no list, compare the whole value.
- Only the body is signed. `X-LearnUpon-TimeStamp` and `X-Webhook-ID` are **not** signed, so there is
  no timestamp tolerance to enforce. Dedupe on `X-Webhook-ID` instead.
- The key is the secret's UTF-8 bytes, used as-is.
- (The docs' header table says "without the signature attribute"; the body has no signature attribute
  in v2.0, so hash the body exactly as received.)

## Implementation

### Node.js (Express)

```javascript
const crypto = require('crypto');

function verifyLearnuponSignature(rawBody, signature, secret) {
  if (!secret || !Buffer.isBuffer(rawBody)) return false;
  if (typeof signature !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature.toLowerCase(), 'hex'));
}

app.post('/webhooks/learnupon', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyLearnuponSignature(req.body, req.get('X-Webhook-Signature'), process.env.LEARNUPON_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  const { data } = JSON.parse(req.body.toString('utf8'));
  // loop over data; dispatch on req.get('X-Webhook-Type')
  res.sendStatus(200);
});
```

### Python (FastAPI)

```python
import hashlib, hmac, re

HEX64 = re.compile(r"[0-9a-fA-F]{64}")

def verify_learnupon_signature(raw_body: bytes, signature, secret: str) -> bool:
    if not secret or not isinstance(signature, str) or not HEX64.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(expected, bytes.fromhex(signature))
```

## Published Test Vector

LearnUpon's docs give a worked example (their Java and Python samples reproduce it). Every example's
test suite includes it:

- Secret: `00000AB00C0D0E00F0A`
- Body (exact bytes, no whitespace):
  `{"data":[{"enrollmentId":19090500,"user":{"userId":291164,"email":"beatrice.dansk@yourdomain.com","username":null},"courseId":1807600,"dueDate":"2024-03-03T18:13:09.000Z","eventCreated":"2024-02-02T18:13:10.038Z","wasRecertified":false}]}`
- `X-Webhook-Signature`: `a403759157e609bf3852001ff9d83db59b454a82841c4369b0e65d066035af45`

If your verifier doesn't accept this, the problem is in how you read the body or the key.

## Common Gotchas

- **Raw bytes.** Verify the body as received. Re-serialising parsed JSON changes whitespace and key
  order and breaks the digest. Use `express.raw({ type: '*/*' })`, `await request.arrayBuffer()` in
  Next.js and `await request.body()` in FastAPI.
- **Validate before decoding.** Require exactly 64 hex characters before `Buffer.from(sig, 'hex')`,
  which silently drops bad characters. Hex is case-insensitive, so lowercase before decoding.
- **Constant-time compare on bytes.** `crypto.timingSafeEqual` throws on unequal lengths (the format
  check prevents that); in Python use `hmac.compare_digest` on `bytes`, never `str`.
- **Trailing whitespace in the secret.** If you pasted it into LearnUpon, a trailing space may be
  part of the key.
- **Batched bodies.** `data` holds up to 10 events; loop over it.
- **Fast acknowledgement.** Reply `2xx` within about 2 seconds or LearnUpon retries.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `LEARNUPON_WEBHOOK_SECRET` unset or different from the portal's secret |
| Test vector passes, real events fail | Body modified by middleware (parsed JSON, trimmed, re-encoded) |
| Works for some events only | A middleware parses certain content types before your raw handler |
| 401 with a trailing-space secret | Secret pasted with whitespace in the portal or in `.env` |
| 400 after verification | Body isn't `{"data": [...]}` JSON |
