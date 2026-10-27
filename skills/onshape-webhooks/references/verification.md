# How to Verify Onshape Webhook Signatures

## How It Works

> Onshape signature keys are an Enterprise company setting. Paste the primary key; only the primary signature is verified.

Onshape signs each delivery when the company has signature keys set:

```
Signature = Base64( HMAC-SHA256( key, <X-onshape-webhook-timestamp value> + "." + <webhook payload> ) )
```

Headers: `X-onshape-webhook-timestamp`, `X-onshape-webhook-signature-primary` (present if a primary key is set) and `X-onshape-webhook-signature-secondary`. The primary header carries the bare standard base64 digest (44 characters with `=` padding), no prefix. Hookdeck's Onshape source verifies the primary header only, so this skill does too and does not fall back to the secondary one.

## Implementation

Onshape has no webhook verification SDK; its docs show a manual HMAC check. Build the signed message as bytes: the header string as latin1, a literal `.`, and the raw body bytes, with no decode/re-encode and no JSON parse before verifying. The key is the secret's UTF-8 bytes (not hex- or base64-decoded). Validate the signature's format (`^[A-Za-z0-9+/]{43}=$`) before comparing, then compare in constant time.

```javascript
const message = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), rawBody]);
const expected = crypto.createHmac('sha256', secret).update(message).digest('base64');
// lengths equal, then crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
```

```python
message = b"".join([timestamp.encode("latin-1"), b".", raw_body])
digest = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
base64.b64decode(signature_bytes, validate=True)  # after the format check
hmac.compare_digest(signature_bytes, base64.b64encode(digest))
```

Full handlers: [examples/express/](../examples/express/), [examples/nextjs/](../examples/nextjs/), [examples/fastapi/](../examples/fastapi/).

## Common Gotchas

- **Raw body:** use `express.raw({ type: '*/*' })`, `request.arrayBuffer()` or `await request.body()`. Re-serialized JSON breaks the signature.
- **Timestamp is part of the signed content:** a missing or modified `X-onshape-webhook-timestamp` header fails verification. Use the header exactly as received (not trimmed or re-formatted).
- **Timestamp tolerance is opt-in:** Hookdeck retries and replays resend the original headers and timestamp, so rejecting old timestamps by default would drop legitimate retries. Set `ONSHAPE_WEBHOOK_TOLERANCE_SECONDS` to enable a window; unset or `0` is off.
- **Case-sensitive base64:** do not lowercase or trim the header.
- **Primary key only:** if only a secondary key is set in Onshape, no primary header is sent and every delivery fails; set a primary key.
- **Keys are an Enterprise setting:** without keys no signature header is sent.
- **Trial notification:** the `webhook.register` delivery just needs 200.

## Debugging Verification Failures

1. Log the two headers and check both exist (`X-onshape-webhook-signature-primary` and `X-onshape-webhook-timestamp`).
2. Confirm the secret is the **primary** key, copied without whitespace.
3. Confirm the body reaching the verifier is the raw bytes (no JSON middleware ahead of it).
4. Recompute by hand: `printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$KEY" -binary | openssl base64 -A`.
5. Behind Hookdeck, check the source's verification setting and that the destination receives the original headers.
