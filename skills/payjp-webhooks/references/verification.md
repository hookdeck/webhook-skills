# How to Verify PAY.JP Webhook Requests

## How Does PAY.JP Authenticate Webhooks?

PAY.JP does not sign payloads. Every webhook carries an `X-Payjp-Webhook-Token` header holding an account-specific token ID, which you compare with the token shown in your PAY.JP account settings (アカウント設定).

```
X-Payjp-Webhook-Token: whook_a09d5c1c87be4e1590a9f16516
```

There is no HMAC, timestamp or prefix. Compare the **whole** header value with `PAYJP_WEBHOOK_SECRET`. This is also what Hookdeck's PAY.JP source does.

## What Does the Token Prove?

A static shared credential authenticates the **sender**, not the **body**: it proves the caller knows your token, not that the payload is unmodified. There is also **no replay protection**, because there is no signature and no timestamp, so a captured request can be replayed. Mitigate this by:

- receiving webhooks over HTTPS only
- rotating the token if it leaks
- deduping on the event `id` and keeping handlers idempotent
- re-fetching the object from the PAY.JP API before acting on high-value events

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function verifyPayjpRequest(headers, secret = process.env.PAYJP_WEBHOOK_SECRET) {
  if (!secret) return false;
  const received = headers['x-payjp-webhook-token'];
  return Boolean(received) && safeEqual(received, secret);
}
```

### Python

```python
import hashlib, hmac, os

def safe_equal(a: str, b: str) -> bool:
    # compare_digest needs bytes (str raises on non-ASCII), so encode both sides
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(), hashlib.sha256(b.encode("utf-8")).digest()
    )

def verify_payjp_request(headers, secret=None) -> bool:
    secret = secret or os.environ.get("PAYJP_WEBHOOK_SECRET")
    received = headers.get("x-payjp-webhook-token")
    return bool(secret and received and safe_equal(received, secret))
```

## Common Gotchas

- **Whole-value compare.** Don't strip, split or prefix-match the header; compare the entire value.
- **Constant-time compare.** Hash both sides (or check lengths) before `timingSafeEqual`, which throws on unequal lengths. In Python use `hmac.compare_digest` on bytes.
- **Fail closed.** If `PAYJP_WEBHOOK_SECRET` is unset, reject everything instead of comparing against `undefined`.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then `JSON.parse` after the token check.
- **Retries.** A `401` or `400` is a `4xx`, so PAY.JP retries (every 3 minutes, at most 3 times). Fix the token and use the dashboard to resend.
- **Duplicates.** The same event can arrive more than once; dedupe on `id`.
- **Header case.** HTTP header names are case-insensitive; frameworks usually lowercase them.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `PAYJP_WEBHOOK_SECRET` unset, or not the token from your account settings |
| 401 only behind a proxy | The proxy strips or renames `X-Payjp-Webhook-Token` |
| 401 with the right token | Stray whitespace or quotes in the `.env` value |
| 400 after authentication | Body isn't a JSON object |
| Same event handled twice | Not deduping on `id` |
