# Asana Signature Verification

## How It Works

Asana authenticity has **two parts**: a one-time handshake that gives you a secret,
and a per-request HMAC signature that proves each delivery used that secret.

### The Handshake (capture the secret)

When the webhook is created, Asana POSTs to your `target` with an **`X-Hook-Secret`**
header and **no** `X-Hook-Signature`. Your endpoint must:

1. Read `X-Hook-Secret`.
2. Set the **same value** as an `X-Hook-Secret` response header.
3. Return `200`.
4. **Persist the secret** — it is the HMAC key for every future delivery. Asana repeats
   it in the `201 Created` response body to `POST /webhooks`, but
   `GET /webhooks/{webhook_gid}` never returns it.

### Per-Delivery Signature

Every subsequent request includes an **`X-Hook-Signature`** header:

- **Algorithm:** HMAC-SHA256
- **Encoding:** lowercase hex
- **Signed content:** the **raw request body** bytes, exactly as received
- **Key:** the secret captured during the handshake

Recompute the HMAC over the raw body and compare it to the header using a timing-safe
comparison.

## Implementation

Asana's official SDKs (`asana` for Node and Python) are wrappers around the REST API
and do **not** ship a webhook signature-verification helper, so verification is
implemented manually with the standard crypto library in every framework. (The SDK is
still useful for creating webhooks and fetching full resource details after an event.)

### Node.js (Express, Next.js)

```javascript
const crypto = require('crypto');

function verifyAsanaSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false; // malformed hex or length mismatch
  }
}
```

### Python (FastAPI)

```python
import hmac, hashlib

def verify_asana_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header, expected)
```

## Handler Sequence

```
POST /webhooks/asana
│
├── Has "X-Hook-Secret" header?  ──► HANDSHAKE
│     • echo X-Hook-Secret in the response headers
│     • persist the secret
│     • return 200
│
└── Has "X-Hook-Signature" header?  ──► DELIVERY
      • verify HMAC-SHA256(raw body, secret) == signature (timing-safe)
      • invalid ► return 401
      • valid   ► parse {"events": [...]}, dispatch, return 200 fast
```

## Common Gotchas

- **Use the raw body, not re-serialized JSON.** `JSON.parse` then `JSON.stringify`
  can reorder keys or change whitespace and will break the HMAC. Read the raw bytes
  first (Express `express.raw()`, Next.js `await request.text()`, FastAPI
  `await request.body()`), verify, *then* parse.
- **The signature is hex, not base64.** Compare against a hex digest.
- **Handshake has no signature.** Don't try to verify a signature on the handshake —
  detect it by the presence of `X-Hook-Secret` and the absence of `X-Hook-Signature`.
- **Echo the exact secret.** The response `X-Hook-Secret` must match byte-for-byte, or
  Asana rejects the handshake and no webhook is created.
- **One secret per webhook.** Each webhook gets its own secret at handshake time. A
  single global env var works for one webhook; store secrets keyed by webhook `gid`
  when you run several.
- **Heartbeats are signed too.** `{"events": []}` deliveries carry a valid
  `X-Hook-Signature` — verify and `200` them; just skip processing.
- **Header case.** HTTP headers are case-insensitive; most frameworks expose them
  lowercased (`x-hook-signature`, `x-hook-secret`).

## Debugging Verification Failures

| Symptom | Likely Cause |
|---------|--------------|
| Every signature fails | Verifying the parsed/re-stringified body instead of the raw body |
| Handshake never completes | Not echoing `X-Hook-Secret`, or not returning `200` |
| Works locally, fails in prod | Stored the wrong secret, or a proxy is buffering/rewriting the body |
| `timingSafeEqual` throws | Comparing buffers of different lengths — wrap in try/catch and return false |
| Webhook disappears after a day | 24h with no successful `200` — check your handler's uptime and latency |

## Reference

- [Asana Webhooks Guide — Security](https://developers.asana.com/docs/webhooks-guide#security)
