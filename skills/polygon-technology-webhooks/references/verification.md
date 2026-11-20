# How to Verify Polygon Technology OMS Webhook Signatures

## How Does the Signature Work?

Every delivery carries one header:

```text
Webhook-Signature: t=1767225600,v1=5d41402abc4b2a76b9719d911017c592...
```

| Part | Meaning |
|---|---|
| `t` | Unix seconds when OMS signed this attempt. Regenerated on every attempt. |
| `v1` | Lowercase hex HMAC-SHA256 over `<t>.<raw request body>`, keyed with your signing key. |

| Property | Value |
|---|---|
| Algorithm | HMAC-SHA256 |
| Encoding | Hex (not base64) |
| Signed content | `{t}` + `.` + raw body bytes |
| Key | The cleartext `signingKey` from `POST /webhooks`, as UTF-8 bytes. No prefix to strip, no decoding. |
| Replay window | Reject when `\|now - t\| > 300` seconds, in either direction |
| Other headers | None. No `webhook-id`, no `webhook-timestamp`. |

Despite the header name, this is **not** Standard Webhooks: Standard Webhooks signs `id.timestamp.body` with a base64-decoded `whsec_` key, and its signature is base64. OMS signs `t.body` with the raw key and hex output. A Standard Webhooks library won't verify OMS deliveries.

Polygon publishes no SDK verifier; the docs ship Node and Python verifiers, which the examples follow.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyOmsSignature(rawBody, header, signingKey, now = Math.floor(Date.now() / 1000)) {
  if (!signingKey || !header) return false;
  const parts = new Map();
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    if (i > 0) parts.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  const t = parts.get('t');
  const v1 = parts.get('v1');
  if (!t || !/^\d+$/.test(t) || !v1 || !/^[0-9a-fA-F]{64}$/.test(v1)) return false;
  if (Math.abs(now - Number(t)) > 300) return false;

  const expected = crypto.createHmac('sha256', signingKey).update(`${t}.`).update(rawBody).digest();
  const received = Buffer.from(v1, 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

### Python

```python
import hashlib, hmac, re, time

def verify_oms_signature(raw_body: bytes, header: str | None, signing_key: str) -> bool:
    if not signing_key or not header:
        return False
    parts = dict(p.strip().split("=", 1) for p in header.split(",") if "=" in p)
    t, v1 = parts.get("t"), parts.get("v1")
    if not t or not re.fullmatch(r"[0-9]+", t) or not v1 or not re.fullmatch(r"[0-9a-fA-F]{64}", v1):
        return False
    if abs(int(time.time()) - int(t)) > 300:
        return False
    expected = hmac.new(signing_key.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(v1.lower(), expected)
```

### Getting the Raw Body

| Framework | Raw body |
|---|---|
| Express | `express.raw({ type: 'application/json' })` on the route; `req.body` is a `Buffer` |
| Next.js (App Router) | `await request.text()` before any parsing |
| FastAPI | `await request.body()` (no Pydantic body model on the route) |
| Flask | `request.get_data()` |

Parse JSON only after verification succeeds.

## Common Gotchas

- **Parsing before verifying.** "Re-serializing the parsed object changes the bytes and the signature will not match." Hash the raw body.
- **Forgetting the timestamp prefix.** The HMAC is over `<t>.<body>`, not the body alone.
- **Base64 instead of hex.** `v1` is hex.
- **Treating it as Standard Webhooks.** Don't strip a `whsec_` prefix, don't base64-decode the key, don't look for `webhook-id` or `webhook-timestamp`.
- **Positional parsing.** Split on `,`, then on the first `=`, and read `t` and `v1` by key. Reject if either is missing.
- **One-sided time check.** Reject future-dated `t` as well as stale `t` (`Math.abs`).
- **Caching timestamps.** OMS regenerates `t` and the signature on every attempt, so a legitimate retry always has a fresh `t`. Don't reject a retry because you've seen its event before: dedupe on `id`/`idempotencyKey` after verifying, and still return 2xx.
- **`timingSafeEqual` throws on length mismatch.** Check lengths first (or validate 64 hex characters), otherwise a short signature crashes the handler.
- **Key rotation has no overlap.** `rotate-key` invalidates the old key immediately. Deploy the new key at the same time.

## How Do I Debug Verification Failures?

1. **Check the header arrives.** Log `req.get('webhook-signature')`. Proxies sometimes strip unknown headers.
2. **Check your clock.** If `|now - t|` is over 300, fix NTP on the server; a skewed clock rejects every delivery.
3. **Recompute by hand** with the logged body and `t`:
   ```bash
   printf '%s.%s' "$T" "$BODY" | openssl dgst -sha256 -hmac "$OMS_WEBHOOK_SIGNING_KEY" -hex
   ```
4. **Compare with what OMS sent.** `GET /webhooks/{webhookId}/deliveries/{deliveryId}` shows each attempt's request body and your response status.
5. **Check the key.** If it was rotated, only the newest key works. If lost, rotate and redeploy.
6. **Send a known delivery.** `POST /webhooks/{webhookId}/test` sends a signed test regardless of subscriptions.

A failing delivery is retried 10 times over ~3 days and delivery history is kept for 30 days, so after fixing verification, requeue failed deliveries with `POST /webhooks/{webhookId}/deliveries/retry`.
