# How to Verify Affonso Webhook Signatures

## How Does Affonso Sign Webhooks?

Every delivery carries two headers:

```
X-Affonso-Timestamp: 1704067200
X-Affonso-Signature: 4f2c8a1b9d3e7f0a6c5b8d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a
```

- Algorithm: HMAC-SHA256, lowercase hex, **no prefix**
- Key: the endpoint's signing secret (64-character hex string), used as a UTF-8 string key. **Do not hex-decode it**
- Signed message: the `X-Affonso-Timestamp` value, a literal `.`, then the raw request body bytes
- `X-Affonso-Timestamp`: Unix timestamp in seconds
- Authentication is the signature alone; Affonso sends no API key or basic auth. There is no Affonso SDK for verification, so the examples verify manually

## Implementation

Build the signed message as bytes and compare in constant time:

```javascript
const signed = Buffer.concat([Buffer.from(timestampHeader, 'latin1'), Buffer.from('.'), rawBody]);
const expected = crypto.createHmac('sha256', secret).update(signed).digest();
const ok = /^[0-9a-fA-F]{64}$/.test(signatureHeader) &&
  crypto.timingSafeEqual(Buffer.from(signatureHeader, 'hex'), expected);
```

```python
signed = timestamp_header.encode("latin-1") + b"." + raw_body
expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()
ok = re.fullmatch(r"[0-9a-fA-F]{64}", signature_header) and hmac.compare_digest(bytes.fromhex(signature_header), expected)
```

Steps in the examples:

1. Reject (401) if the secret, timestamp header, or signature header is missing or empty.
2. Require the signature to be exactly 64 hex characters **before** decoding it. `Buffer.from(sig, 'hex')` silently drops bad characters on unvalidated input.
3. Compare the whole header as one digest. There is no list, no `sha256=` prefix, no `t=`/`v1=` parsing. Hex is case-insensitive, so decode both sides to bytes.
4. Use `crypto.timingSafeEqual` on equal-length Buffers, or `hmac.compare_digest` on bytes.

## Replay Protection

Affonso's docs sample rejects events more than 300 seconds old. The examples **don't check this by default**. Affonso retries a failed delivery up to 11 times over 48 hours, and Hookdeck retries and replays resend the original headers, so a fixed window would reject legitimate redeliveries. Hookdeck applies no tolerance either.

To opt in, set `AFFONSO_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds (for example `300`). Unset or `0` means off. A value that isn't a whole number is treated as `0`, with a warning at startup. With the window on, a non-numeric `X-Affonso-Timestamp` is rejected. Use the event `id` for idempotency (see webhook-handler-patterns).

## Common Gotchas

- **Raw body:** the signature covers the exact bytes. Do not parse JSON before verifying (`express.raw({ type: '*/*' })`, `await request.arrayBuffer()`, `await request.body()`). Reading the body as a string and re-encoding it can change bytes.
- **Secret encoding:** the secret looks like hex, but it is the key as written. Hex-decoding it gives a different key and every signature fails.
- **Header value as sent:** don't trim, parse, or reformat `X-Affonso-Timestamp` before signing; use the string you received.
- **Prefix:** the signature has no `sha256=` prefix.
- **Status code:** return `401` for a bad signature, as Affonso's docs do.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Secret hex-decoded, wrong secret (endpoint secret rotated or copied from another endpoint), or body parsed before verifying |
| Only some requests fail | A proxy or middleware changes the body, or the tolerance window is on and the delivery is a retry |
| `Missing header` | A proxy strips custom headers, or the test is not from Affonso |
| Length errors | Signature header has a prefix or whitespace; the examples reject it instead of throwing |
