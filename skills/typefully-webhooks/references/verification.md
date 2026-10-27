# How to Verify Typefully Webhook Signatures

## How Does Typefully Sign Webhooks?

Every delivery carries:

```
X-Typefully-Timestamp: 1737381605
X-Typefully-Signature: sha256=3b5c...e91f
```

- Algorithm: HMAC-SHA256, lowercase hex, sent as `sha256=<hex>`
- Key: the webhook secret from Typefully's API settings, used as-is (its UTF-8 bytes, not hex- or base64-decoded)
- Signed message: the `X-Typefully-Timestamp` header value, a literal `.`, then the raw request body
- Authentication is the signature alone; there is no API key or basic auth on deliveries

Typefully's own sample (Python):

```python
signature_payload = f"{timestamp}.{payload_body.decode('utf-8')}"
expected = hmac.new(webhook_secret.encode(), signature_payload.encode(), hashlib.sha256).hexdigest()
return hmac.compare_digest(f"sha256={expected}", signature)
```

## Implementation

The examples build the message as bytes, so the body is never decoded and re-encoded:

```javascript
const expected = crypto.createHmac('sha256', secret)
  .update(Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), rawBody]))
  .digest();
```

```python
message = b"".join([timestamp.encode("latin-1"), b".", raw_body])
expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
```

Before decoding the signature, check its format: strip a leading `sha256=` (a bare digest is also accepted), then require exactly 64 hex characters. Hex is case-insensitive, so lowercase it (or decode to bytes) before comparing. Compare bytes in constant time: `crypto.timingSafeEqual` on equal-length Buffers, `hmac.compare_digest` on `bytes`. Never call `Buffer.from(sig, 'hex')` on an unvalidated value, because it silently drops bad characters.

## Replay Protection

Typefully says to verify the timestamp is recent but gives no window. The examples **don't check it by default**: Hookdeck's retries and replays carry the original `X-Typefully-Timestamp`, and Typefully doesn't document whether its own retries (up to an hour later) send a new timestamp or the original one, so a fixed window could reject legitimate redeliveries. To opt in, set `TYPEFULLY_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds (for example `300`); the timestamp is Unix seconds. A value that isn't a whole number is treated as `0`, with a warning. Use `data.id` plus the event for idempotency (see webhook-handler-patterns).

## Common Gotchas

- **Raw body:** the signature covers the exact bytes. Typefully sends compact JSON with sorted keys, but don't rely on that: don't parse or re-serialize before verifying (`express.raw({ type: '*/*' })`, `await request.arrayBuffer()`, `await request.body()`).
- **Header values:** use the timestamp header exactly as received, never trimmed or reformatted. Hookdeck's TYPEFULLY source builds the same message with the header value as latin1 bytes.
- **Prefix:** the signature header is `sha256=<hex>`; strip the prefix before hex-decoding.
- **Status codes:** return `401` for a missing, empty, malformed or mismatched signature or timestamp, and `500` if the secret isn't configured.
- **Disabled webhooks:** 100 consecutive failures disable the webhook. A bug in verification can cause that.

## Debugging Verification Failures

1. Log the three headers and the body length; confirm the body is a Buffer, not a parsed object.
2. Confirm you're using the secret for this webhook, with no added whitespace or quotes.
3. Recompute with the Python sample above on the same captured bytes.
4. If it only fails behind a proxy or framework, check that nothing re-encodes the body.
