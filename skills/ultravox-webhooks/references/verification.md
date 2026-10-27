# How to Verify Ultravox Webhook Signatures

## How It Works

Ultravox: "Concatenate the raw request body with the timestamp. Create an HMAC-SHA256 hash of
this concatenated string using your webhook secret as the key."

| Item | Value |
|------|-------|
| Signature header | `X-Ultravox-Webhook-Signature` |
| Timestamp header | `X-Ultravox-Webhook-Timestamp` (ISO 8601) |
| Algorithm | HMAC-SHA256 |
| Signed message | raw body bytes, then the timestamp header value, **no separator** |
| Key | the webhook secret as UTF-8 bytes, used as-is |
| Encoding | lowercase hex, bare digest (no prefix) |
| Secret env var | `ULTRAVOX_WEBHOOK_SECRET` |

> Give the Ultravox webhook exactly one secret and paste it here. A webhook without a secret is unsigned, and one with several secrets sends a list of signatures, so both fail verification.

The docs say the signature header "may contain multiple signatures separated by commas". That
happens for a webhook with several secrets. Hookdeck's Ultravox source (and these examples) compare
the **whole** header to a single expected digest, so a list fails. Keep one secret per webhook.

## Implementation

Build the message as bytes and verify before parsing anything:

```javascript
const HEX_DIGEST = /^[0-9a-fA-F]{64}$/;
if (!sig || !ts || !HEX_DIGEST.test(sig)) return 401;
const signed = Buffer.concat([rawBody, Buffer.from(ts, 'latin1')]);
const expected = crypto.createHmac('sha256', secret).update(signed).digest();
const received = Buffer.from(sig.toLowerCase(), 'hex'); // validated first
const ok = received.length === expected.length && crypto.timingSafeEqual(received, expected);
```

```python
if not signature or not timestamp or not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
    return 401
signed = b"".join([raw_body, timestamp.encode("latin-1")])
expected = hmac.new(secret.encode(), signed, hashlib.sha256).digest()
ok = hmac.compare_digest(bytes.fromhex(signature), expected)
```

Complete handlers: [Express](../examples/express/), [Next.js](../examples/nextjs/), [FastAPI](../examples/fastapi/).

## Timestamp Tolerance (opt-in)

The examples do **not** reject old timestamps by default. Hookdeck retries and replays resend the
original headers and timestamp, and Hookdeck applies no tolerance itself, so a fixed window would
reject legitimate retries. If you receive directly from Ultravox and want replay protection, set
`ULTRAVOX_WEBHOOK_TOLERANCE_SECONDS` (unset or `0` = off). Ultravox's own example rejects anything
older than 1 minute. Either way, dedupe retries and duplicates idempotently.

## Common Gotchas

- **Raw bytes.** Use `express.raw({ type: '*/*' })`, `await request.arrayBuffer()` (Next.js) or
  `await request.body()` (FastAPI). Never `JSON.parse`/`JSON.stringify` before verifying.
- **Order and separator.** Body first, then timestamp, nothing in between.
- **Header as received.** The timestamp is used exactly as sent (latin1 bytes); never trim, parse or
  reformat it.
- **Key is not decoded.** Don't hex- or base64-decode the secret.
- **Hex hygiene.** Require exactly 64 hex characters and compare in constant time. Never call
  `Buffer.from(sig, 'hex')` on an unvalidated value: it silently drops bad characters.
  Case is ignored, so lowercase (or decode) both sides first.
- **No secret / several secrets.** Unsigned or comma-separated signatures fail verification.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401, "Missing ..." | Header absent: webhook has no secret, or a proxy stripped it |
| 401, "Malformed signature" | Header holds a comma-separated list (several secrets) or a prefix |
| 401, "Invalid signature" | Wrong secret, body modified/re-serialized, or separator added between body and timestamp |
| 401, "Timestamp outside tolerance" | Tolerance enabled and the delivery is a retry/replay |
