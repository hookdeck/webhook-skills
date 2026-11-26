# MakePlans Signature Verification

## The Scheme

| Part | Value |
|---|---|
| Header | `X-MakePlans-Signature` |
| Algorithm | HMAC-SHA256, hex (64 characters), prefixed with `sha256=` |
| Key | The Account secret, as UTF-8 text |
| Signed content | The request body |
| Timestamp | None |

MakePlans' guide: "We include a `X-MakePlans-Signature` header in the webhook request. Use this to verify the request body to ensure the request is from Makeplans and signed with your account secret. The header includes details about the signature and the signature itself. We use HMAC SHA-256 to compute this signature." Example: `X-MakePlans-Signature: sha256=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd`. The header was added in June 2020.

## What's Confirmed and What's Inferred

| Point | Basis |
|---|---|
| Header name, HMAC-SHA256, `sha256=` prefix | Stated in the guide |
| The key is the Account secret, not the API key | The admin UI labels it "Account secret" on the Webhooks page, with the help text "App secret for verifying webhooks" |
| Hex encoding | Inferred: the example is 64 lowercase hex characters. No code sample is published |
| Raw body, key used as text | Inferred: the guide says to "verify the request body" |

If your first real delivery doesn't verify with the examples, compute a base64 digest of the same body and compare. That's the most likely alternative.

## Node.js

```javascript
const crypto = require('crypto');

function verifyMakePlansSignature(rawBody, signature, accountSecret) {
  const match = /^sha256=([0-9a-fA-F]{64})$/.exec(String(signature || '').trim());
  if (!accountSecret || !match) return false;
  const expected = crypto.createHmac('sha256', accountSecret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(match[1], 'hex'), expected);
}
```

## Python

```python
import hashlib, hmac, re

def verify_makeplans_signature(raw_body: bytes, signature: str, account_secret: str) -> bool:
    match = re.fullmatch(r"sha256=([0-9a-fA-F]{64})", (signature or "").strip())
    if not account_secret or not match:
        return False
    expected = hmac.new(account_secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(match.group(1)), expected)
```

## Debugging Mismatches

| Symptom | Cause |
|---|---|
| Every request fails | You used the API key. Use the Account secret from **Setup > Webhooks** |
| Every request fails, right secret | The body was parsed and re-serialised. HMAC the raw bytes |
| Signature never matches the regex | The `sha256=` prefix is missing or was stripped twice |
| The same event arrives many times | Your endpoint returned 4xx or 5xx (including `401`), and MakePlans retried. Fix the cause, or return `410` to deactivate the webhook |
