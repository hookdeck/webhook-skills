# How to Verify Ardoq Webhook Signatures

## Why Signature Verification Matters

Your Ardoq webhook endpoint is a public HTTPS URL, and the payloads carry organization-wide architecture data. Signing lets you prove a request came from Ardoq and was not altered in transit. Ardoq adds the signature whether or not you verify it, so verification is a check you must add.

## How It Works

Ardoq uses **HMAC-SHA256, hex-encoded**, with two headers. It is not the Standard Webhooks scheme.

```http
X-Ardoq-Signature-256: sha256=<hex digest>
X-Ardoq-Timestamp: <unix epoch seconds>
```

```
signed_content = X-Ardoq-Timestamp value + "." + raw body bytes
digest         = HMAC_SHA256(secret, signed_content), lowercase hex (64 chars)
header value   = "sha256=" + digest
```

- The key is the signing secret's **UTF-8 bytes, used as-is** (not hex- or base64-decoded). It is shown once when the webhook is created.
- Build the signed message as **bytes**: the timestamp header exactly as received (latin1), a literal `.`, and the raw body bytes as received. A header is never trimmed, parsed or re-formatted.
- Hookdeck's Ardoq source verifies the same way (HMAC, `sha256`, hex, signed content `{header:x-ardoq-timestamp}.{body}`). It accepts the digest with or without the `sha256=` prefix, and compares hex case-insensitively, so this skill does too.

## Implementation

Ardoq has no webhook verification SDK. Manual verification, in Node.js:

```javascript
const crypto = require('crypto');

function verifyArdoqSignature(rawBody, signatureHeader, timestampHeader, secret) {
  if (!secret || !signatureHeader || !timestampHeader) return false;

  const digest = signatureHeader.replace(/^sha256=/, '');
  if (!/^[0-9a-fA-F]{64}$/.test(digest)) return false; // validate BEFORE decoding

  const expected = crypto
    .createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(timestampHeader, 'latin1'), Buffer.from('.'), rawBody]))
    .digest();
  const provided = Buffer.from(digest.toLowerCase(), 'hex');
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}
```

And in Python:

```python
import hashlib, hmac, re

def verify_ardoq_signature(raw_body: bytes, signature: str | None, timestamp: str | None, secret: str | None) -> bool:
    if not secret or not signature or not timestamp:
        return False
    digest = signature.removeprefix("sha256=")
    if not re.fullmatch(r"[0-9a-fA-F]{64}", digest):  # validate BEFORE decoding
        return False
    signed = b"".join([timestamp.encode("latin-1"), b".", raw_body])
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(digest), expected)  # bytes, never str
```

Complete handlers with tests: [Express](../examples/express/), [Next.js](../examples/nextjs/), [FastAPI](../examples/fastapi/).

## How Should I Handle the Timestamp?

Ardoq's help article says to reject deliveries outside a tolerance window and uses 5 minutes in its examples. The skill's examples **do not reject old timestamps by default**:

- Hookdeck retries and replays resend the **original** headers and timestamp, so a fixed window rejects legitimate retries.
- Hookdeck itself applies no tolerance.
- The timestamp is part of the signed content, so an attacker cannot refresh it without the secret.

To opt in, set `ARDOQ_WEBHOOK_TOLERANCE_SECONDS` (Unix seconds; unset or `0` = off). The examples then require a numeric `X-Ardoq-Timestamp` within that many seconds of the current time. If you also use Hookdeck retries or replays, choose a window larger than the longest delay you allow, or leave it off and deduplicate instead.

## Common Gotchas

- **Raw body.** Read the exact bytes: `express.raw({ type: '*/*' })` in Express (so any content type works), `await request.arrayBuffer()` in Next.js, `await request.body()` in FastAPI. Never `JSON.parse` then `JSON.stringify`, and never decode the body to a string and re-encode it.
- **Signing must be on.** An unsigned webhook sends neither header, and cannot be verified.
- **`sha256=` prefix.** Strip it before validating the 64-hex digest; accept the bare digest too.
- **Validate before decoding.** `Buffer.from(sig, 'hex')` silently drops bad characters. Check length and alphabet first, then compare equal-length buffers with `crypto.timingSafeEqual`.
- **Python comparison.** Use `hmac.compare_digest` on `bytes`, not `str`.
- **Secret shown once.** If it is lost, rotate it ("Rotate signing secret"); the old one stops working immediately.
- **Empty or missing headers:** respond **401**.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Wrong or old secret (rotated?), or the webhook is not signed |
| Fails only for some requests | Body altered by middleware (JSON parser, gzip, proxy re-encoding) |
| Fails after adding tolerance | Retries and replays resend the original timestamp; widen or disable the window |
| Fails in tests only | Test signed a re-serialized body, or used `str` where `bytes` are needed |
| No signature headers at all | The webhook is unsigned; add a signing secret (one-way) or create a new signed webhook |
