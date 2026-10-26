# Cloudsmith Signature Verification

## How Does Cloudsmith Sign Webhooks?

When the webhook has an HMAC signature key, every request carries `X-Cloudsmith-Signature`: the bare lowercase hex HMAC-SHA1 (40 characters) of the **raw request body bytes**, keyed with the signature key's UTF-8 bytes. Nothing else is signed: no timestamp, ID or header, so there is no replay window to check. The whole header value is one digest; there is no prefix and no list of signatures.

Set an HMAC signature key on the Cloudsmith webhook. Without one, deliveries are unsigned and fail verification.

## Implementation

Cloudsmith has no webhook-verification SDK, so verification is manual.

### Node.js

```javascript
if (!/^[0-9a-fA-F]{40}$/.test(signature)) return false;           // validate before decoding
const expected = crypto.createHmac('sha1', secret).update(rawBody).digest();
const received = Buffer.from(signature, 'hex');
return received.length === expected.length && crypto.timingSafeEqual(received, expected);
```

### Python

```python
if not re.fullmatch(r"[0-9a-fA-F]{40}", signature):               # validate before decoding
    return False
expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha1).digest()
return hmac.compare_digest(bytes.fromhex(signature), expected)
```

## Common Gotchas

- **Use the raw bytes.** Re-serialized JSON changes the bytes and breaks the digest. In Express use `express.raw({ type: '*/*' })`; in Next.js use `await request.arrayBuffer()`; in FastAPI use `await request.body()`. Don't decode to a string and re-encode.
- **No prefix.** Don't strip `sha1=`; the value is bare hex. Hex is case-insensitive, so lowercase or decode both sides before comparing.
- **SHA-1, not SHA-256.** An HMAC-SHA256 check will never match.
- **Key is the signature key string as typed**, not decoded from hex or base64.
- **Validate before decoding.** `Buffer.from(sig, 'hex')` silently drops bad characters, so check length and alphabet first.
- **No timestamp.** Make handlers idempotent (for example on `meta.trigger_id`) since replays can't be detected from the signature.
- **Payload format.** The signature covers whatever bytes the webhook's payload format produces (JSON object, JSON array, form-encoded or template).

## Debugging Verification Failures

1. Check the webhook has an HMAC signature key; unsigned deliveries have no `X-Cloudsmith-Signature` header.
2. Compare `CLOUDSMITH_WEBHOOK_SECRET` with the key you set (watch for whitespace). The key can't be read back, so replace it in Cloudsmith if unsure.
3. Confirm no middleware parses the body before your handler.
4. Return `401` for a bad signature so failures show up in the delivery log.
