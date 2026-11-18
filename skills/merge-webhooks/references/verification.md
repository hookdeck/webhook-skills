# Merge Signature Verification

## The Scheme

| Part | Value |
|---|---|
| Header | `X-Merge-Webhook-Signature` |
| Algorithm | HMAC-SHA256 |
| Encoding | base64url **with** `=` padding (44 characters) |
| Key | Your organization's signature key, used as UTF-8 text |
| Signed content | The raw request body |
| Timestamp | None |

Merge's instructions: "calculate the HMAC-SHA256 of the byte-formatted payload and encode it to Base64url". Its samples all produce the padded form:

- Python: `base64.urlsafe_b64encode(hmac_digest)`, then `hmac.compare_digest`
- Ruby: `Base64.urlsafe_encode64(hmac)`, then `OpenSSL.fixed_length_secure_compare`
- Node: `.digest("base64")` with `+` → `-` and `/` → `_` (keeps the `=`), then `timingSafeEqual` after a length check

## Padding

Padding carries no data (RFC 4648 section 5), but it changes the string. Node's `digest('base64url')` and many libraries drop it, so a direct string compare against Merge's header always fails. Strip trailing `=` from both values first. Merge's own agent skill compares `expected.rstrip("=")` with `signature.rstrip("=")`.

## Node.js

```javascript
const crypto = require('crypto');

function verifyMergeSignature(rawBody, signature, key) {
  const secret = String(key || '').trim();
  const value = String(signature || '').trim();
  if (!secret || !/^[A-Za-z0-9_-]{43}=?$/.test(value)) return false;
  const given = Buffer.from(value.replace(/=$/, ''));
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('base64url'));
  return crypto.timingSafeEqual(given, expected);
}
```

## Python

```python
import base64, hashlib, hmac, re

def verify_merge_signature(raw_body: bytes, signature: str, key: str) -> bool:
    value = (signature or "").strip()
    if not key or not re.fullmatch(r"[A-Za-z0-9_-]{43}=?", value):
        return False
    digest = hmac.new(key.strip().encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.urlsafe_b64encode(digest).rstrip(b"=")
    return hmac.compare_digest(value.rstrip("=").encode("ascii"), expected)
```

## Check Vector

Merge publishes none. Running Merge's Python, Ruby and Node samples with key `k` and body `{}` gives the same padded value:

| | |
|---|---|
| Key | `k` |
| Body | `{}` |
| `X-Merge-Webhook-Signature` | `rdhTsQP7zJNqGU-esV4pxP8Ir25H1dG8pPICGOMeT_8=` |

## Debugging Mismatches

| Symptom | Cause |
|---|---|
| Every request fails by one character | Padding handled on one side only. Strip `=` on both |
| Fails when the digest has `+` or `/` | You compared with standard base64. Use base64url (`-`, `_`) |
| Every request fails, right key | The body was parsed and re-serialised (for example by `express.json()`). HMAC the raw bytes |
| Fails after a key change | Someone regenerated the organization's signature key. Copy the new one |
| One environment works, another doesn't | The key is per Merge organization: check you copied it from the right one |
