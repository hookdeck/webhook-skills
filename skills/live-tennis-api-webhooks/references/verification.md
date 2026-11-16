# Live Tennis API Signature Verification

## How Does Live Tennis API Sign Webhooks?

Each request carries:

```
X-LTAPI-Signature-V1: t=1790000000,v1=<64 hex chars>
X-LTAPI-Timestamp: 1790000000
X-LTAPI-Event: score
X-LTAPI-Signature: sha256=<64 hex chars>   (deprecated, sent until 2027-02-01)
```

Each `v1` is the **hex** HMAC-SHA256, keyed with the webhook `secret` from the `POST /webhooks` response (used as-is, as a string), of the string `<t>.<raw request body>`: the `t` value, a literal dot, then the body bytes. Accept the request if **any** `v1` value matches. `X-LTAPI-Timestamp` repeats `t`.

Live Tennis API's receiver checks, in its own order:

1. Reject a `t` more than **5 minutes** from your clock.
2. Compare in constant time, over the raw bytes before any JSON parsing.
3. Dedupe on the body's `delivery_id` and keep each id until `t` + 5 minutes. With several workers, record it with an atomic insert-if-absent.

## The Deprecated `X-LTAPI-Signature`

`X-LTAPI-Signature: sha256=<hex>` is an HMAC-SHA256 of the raw body alone, with the same secret. It doesn't cover the timestamp, so a captured delivery still verifies when re-sent later under a fresh `X-LTAPI-Timestamp`. Live Tennis API deprecated it in 1.13.76 (2026-10-28) and keeps sending it until 2027-02-01: deliveries sent from 00:00 UTC that day don't carry it.

Both headers use the same secret, so switching needs no re-registration. Once your receiver checks `X-LTAPI-Signature-V1`, require it and **never fall back** to the old header: a fallback lets a re-stamped replay through.

## Implementation

Live Tennis API has no webhook verification SDK, so verification is manual.

### Node.js

```javascript
const crypto = require('crypto');

function verifyLiveTennisSignature(rawBody, header, secret, now = Math.floor(Date.now() / 1000)) {
  let t = null;
  const sigs = [];
  for (const part of String(header || '').split(',')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === 't') t = value;
    else if (key === 'v1') sigs.push(value);
  }
  if (!t || !/^\d+$/.test(t) || sigs.length === 0) return false;
  if (Math.abs(now - Number(t)) > 300) return false;

  const expected = crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest();
  return sigs.some((s) => /^[0-9a-f]{64}$/i.test(s) && crypto.timingSafeEqual(Buffer.from(s, 'hex'), expected));
}
```

Check each value is exactly 64 hex characters **before** `Buffer.from(x, 'hex')`: invalid hex is silently truncated, and `timingSafeEqual` throws on buffers of different lengths.

### Python

```python
import hashlib
import hmac
import re
import time

def verify_live_tennis_signature(raw_body: bytes, header: str, secret: str) -> bool:
    parts = [p.strip().partition("=") for p in header.split(",")]
    t = next((v for k, _, v in parts if k == "t"), None)
    sigs = [v.lower() for k, _, v in parts if k == "v1"]
    if not t or not re.fullmatch(r"[0-9]+", t) or not sigs:
        return False
    if abs(time.time() - int(t)) > 300:
        return False
    expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(s.encode(), expected.encode()) for s in sigs)
```

`hmac.compare_digest` on `str` raises `TypeError` for non-ASCII input, so a hostile header would give a 500. Encode both sides to bytes so it simply returns `False` and you answer 401.

## Common Gotchas

- **Use the raw body.** In Express use `express.raw({ type: '*/*' })` so any content type verifies; in Next.js use `await request.text()`; in FastAPI use `await request.body()`.
- **Sign `t`, a dot, then the body.** Hashing the body alone reproduces the deprecated header, not `v1`.
- **Check every `v1`.** The header can carry more than one; any match is a pass.
- **Keep clocks in sync.** A server clock more than 5 minutes off rejects every delivery.
- **Behind Hookdeck:** Hookdeck retries and replays forward the original headers, so a delivery it retries more than 5 minutes after Live Tennis API signed it fails the window. Widen the tolerance in a handler that only receives from your Hookdeck connection, and keep the `delivery_id` check.
- **Prefer the body `type` over `X-LTAPI-Event`.** Only the body is signed, so the examples dispatch on `type` and use the header as a fallback.
- **The secret is shown once.** If you lose it, delete the webhook and register a new one.

## Debugging Verification Failures

- **Always 401:** you are probably using a parsed or re-serialized body, or hashing the body without the `t.` prefix.
- **401 on some deliveries only:** check the server clock against the 5-minute window.
- **Secret mismatch:** the secret belongs to one webhook registration. A re-registered webhook has a new secret.
- **Works locally, fails behind a proxy:** make sure the proxy doesn't modify the body (decompress, re-encode). Hookdeck forwards the original body.
