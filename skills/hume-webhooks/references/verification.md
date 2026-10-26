# How to Verify Hume Webhook Signatures

## Why Signature Verification Matters

Your Hume webhook endpoint is a public HTTPS URL, and the payloads describe your users' voice sessions. Signing lets you prove a request came from Hume and was not altered in transit. Hume adds the signature to every request, so verification is a check you must add.

## How It Works

Hume uses **HMAC-SHA256, hex-encoded**, with two headers. It is not the Standard Webhooks scheme.

```http
X-Hume-AI-Webhook-Signature: <hex digest>
X-Hume-AI-Webhook-Timestamp: <unix epoch seconds>
```

```
signed_content = raw body bytes + "." + X-Hume-AI-Webhook-Timestamp value
digest         = HMAC_SHA256(signing key, signed_content), lowercase hex (64 chars)
header value   = digest   (bare, no prefix)
```

- **Body first, then a period, then the timestamp.** Many providers put the timestamp first; Hume does not.
- The key is the **webhook signing key's UTF-8 bytes, used as-is** (not hex- or base64-decoded). Generate it on the Developers page.
- Build the signed message as **bytes**: the raw body as received, a literal `.`, and the timestamp header exactly as received (latin1). A header is never trimmed, parsed or re-formatted.
- The signature header is one whole digest: no list splitting and no `sha256=` prefix.
- Hookdeck's Hume source verifies the same way (HMAC, `sha256`, hex, signed content `{body}.{header:x-hume-ai-webhook-timestamp}`) and compares hex case-insensitively, so this skill does too.

## Implementation

Hume's docs show manual verification code and no verification helper in an SDK. In Node.js:

```javascript
const crypto = require('crypto');

function verifyHumeSignature(rawBody, signatureHeader, timestampHeader, secret) {
  if (!secret || !signatureHeader || !timestampHeader) return false;
  if (!/^[0-9a-fA-F]{64}$/.test(signatureHeader)) return false; // validate BEFORE decoding

  const expected = crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([rawBody, Buffer.from('.'), Buffer.from(timestampHeader, 'latin1')]))
    .digest();
  const provided = Buffer.from(signatureHeader.toLowerCase(), 'hex');
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}
```

And in Python:

```python
import hashlib, hmac, re

def verify_hume_signature(raw_body: bytes, signature: str | None, timestamp: str | None, secret: str | None) -> bool:
    if not secret or not signature or not timestamp:
        return False
    if not re.fullmatch(r"[0-9a-fA-F]{64}", signature):  # validate BEFORE decoding
        return False
    signed = b"".join([raw_body, b".", timestamp.encode("latin-1")])
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(signature), expected)  # bytes, never str
```

Complete handlers with tests: [Express](../examples/express/), [Next.js](../examples/nextjs/), [FastAPI](../examples/fastapi/).

## How Should I Handle the Timestamp?

Hume's docs say to reject requests whose timestamp is outside a range (their example uses 180 seconds, comparing against the current time). The skill's examples **do not reject old timestamps by default**:

- Hookdeck retries and replays resend the **original** headers and timestamp, so a fixed window rejects legitimate retries.
- Hookdeck itself applies no tolerance.
- The timestamp is part of the signed content, so an attacker cannot refresh it without the signing key.

To opt in, set `HUME_WEBHOOK_TOLERANCE_SECONDS` (Unix seconds; unset or `0` = off). The examples then require a numeric `X-Hume-AI-Webhook-Timestamp` within that many seconds of the current time. If you also use Hookdeck retries or replays, choose a window larger than the longest delay you allow, or leave it off and deduplicate instead.

## Common Gotchas

- **Raw body.** Read the exact bytes: `express.raw({ type: '*/*' })` in Express (so any content type works), `await request.arrayBuffer()` in Next.js, `await request.body()` in FastAPI. Never `JSON.parse` then `JSON.stringify`, and never decode the body to a string and re-encode it.
- **Order.** Body, `.`, timestamp. Swapping them (timestamp first) fails every request.
- **Validate before decoding.** `Buffer.from(sig, 'hex')` silently drops bad characters. Check length and alphabet first, then compare equal-length buffers with `crypto.timingSafeEqual`.
- **Python comparison.** Use `hmac.compare_digest` on `bytes`, not `str`.
- **Header units.** The header timestamp is Unix **seconds**; timestamps inside payloads (`start_time`, `end_time`, `timestamp`) are **milliseconds**.
- **Key rotation.** Generating a new signing key invalidates the old one immediately.
- **Env var name.** Hume's docs call it `HUME_WEBHOOK_SIGNING_KEY`; the examples read `HUME_WEBHOOK_SECRET`.
- **Empty or missing headers:** respond **401**.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong or old signing key (regenerated?), or the timestamp placed before the body |
| Fails only for some requests | Body altered by middleware (JSON parser, gzip, proxy re-encoding) |
| Fails after adding tolerance | Retries and replays resend the original timestamp; widen or disable the window |
| Fails in tests only | Test signed a re-serialized body, or used `str` where `bytes` are needed |
| Header looks fine but fails | A `sha256=` prefix was added or stripped; Hume's value is the bare hex digest |
