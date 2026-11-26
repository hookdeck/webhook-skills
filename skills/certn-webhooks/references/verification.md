# How to Verify Certn Webhooks

CertnCentric has two checks: endpoint verification, which Certn runs against your URL, and the `X-Signature` on every event, which you run. Source: [CertnCentric API docs, Security and Verification](https://centric-api-docs.certn.co/#webhooks).

## Endpoint Verification (Required)

When you add a webhook URL, Certn sends:

```
GET /webhooks/certn?challenge=abc123
```

Respond within 10 seconds with `200` and the challenge value as the whole body. Certn's examples also set:

```
Content-Type: text/plain
X-Content-Type-Options: nosniff
```

`nosniff` stops a browser treating the echoed value as HTML. Certn repeats this check periodically and disables the webhook, with an email, if it fails.

## Signature Verification (Recommended)

- Header: `X-Signature`
- Algorithm: HMAC-SHA256
- Signed content: the raw request body, with no timestamp or prefix
- Key: the signing key Certn provides when you create the webhook configuration
- Encoding: lowercase hex (Certn's example compares Python's `hexdigest()`)

There is no official SDK helper, so the examples verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyCertn(rawBody, signature, secret) {
  if (!secret || typeof signature !== 'string') return false;
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature.toLowerCase()), Buffer.from(expected));
}
```

Check the length and characters before `timingSafeEqual`, which throws on buffers of different lengths.

### Python

```python
import hashlib, hmac, re

def verify_certn(raw_body: bytes, signature, secret: str) -> bool:
    if not secret or not signature or not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature.lower().encode(), expected.encode())
```

## No Replay Window

The signature covers only the body. There's no timestamp to check, so use `event_id` to reject events you've already processed.

## Common Gotchas

1. **Parsed body.** The signature covers the exact bytes Certn sent. Use `express.raw({ type: '*/*' })`, `await request.text()` in a Next.js route or `await request.body()` in FastAPI, and parse JSON only after the check passes.
2. **Signature check on the `GET`.** Certn doesn't say the challenge is signed. Middleware that checks every request on the path rejects it, and Certn disables the webhook.
3. **Wrong key.** Use the signing key Certn provided when you created this webhook configuration. Configurations are per region, and a secret from the legacy Partner page won't match.
4. **Legacy code.** `Certn-Signature: t=...,v1=...` over `{t}.{body}` was the legacy API's scheme. CertnCentric sends `X-Signature` over the body alone.
5. **Slow responses.** Both the challenge and event deliveries expect an answer within 10 seconds.

## Debugging

1. Log the `X-Signature` header and the body length before parsing.
2. Recompute the HMAC over the logged raw bytes with the key from the Client Portal and compare.
3. If no events arrive at all, check that `GET ?challenge=` returns the value as a plain body. A failed challenge disables the webhook, and Certn emails the account.
