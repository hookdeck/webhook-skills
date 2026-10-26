# How to Verify Holded Webhook Signatures

Source: [Holded webhooks: verifying webhooks](https://www.holded.com/en-us/developers/webhooks)

## How Does the Signature Work?

```
x-holded-webhook-signature: sha256=<64 hex chars>
```

The value is the HMAC-SHA256 hex digest of the **raw request body**, keyed with your webhook secret and prefixed with `sha256=`. Nothing else is signed: `x-holded-webhook-date` and the other headers are not covered.

The secret looks like `whsec_...`, but this is **not Standard Webhooks**. The HMAC key is the whole secret string, including `whsec_`, as UTF-8.

## Steps

1. Read the raw body bytes.
2. Require the `sha256=` prefix and strip it.
3. Check the remainder is exactly 64 hex characters.
4. Compute `HMAC-SHA256(secret_utf8, raw_body)` as hex.
5. Compare in constant time. Respond `401` on mismatch.

## Implementation

Node:

```javascript
const received = header.slice('sha256='.length);
if (!/^[0-9a-f]{64}$/i.test(received)) return false;   // before Buffer.from(x, 'hex')
const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
return crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected);
```

Python:

```python
received = header[len("sha256="):]
if not re.fullmatch(r"[0-9a-fA-F]{64}", received):
    return False
expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
return hmac.compare_digest(expected.encode(), received.lower().encode())
```

## Common Gotchas

- **Don't use `standardwebhooks` or `svix`.** The `whsec_` prefix is a lookalike, not a signal.
- **Don't strip or base64-decode `whsec_`.** Doing so produces a different key and every signature fails.
- **Validate hex before `Buffer.from(x, 'hex')`.** Invalid hex silently truncates, so a malformed header could otherwise compare against a shorter buffer.
- **Compare bytes in Python.** `hmac.compare_digest` raises `TypeError` for non-ASCII `str`, turning a bad header into a 500. Encode both sides.
- **Use the raw body.** Parsing and re-serialising JSON changes bytes. In Express use `express.raw({ type: '*/*' })`.
- **No replay protection from the date header.** `x-holded-webhook-date` is unsigned. Deduplicate on `x-holded-webhook-id` instead.
- **The event name is a header** (`x-holded-webhook-event`), not part of the signed body.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always invalid | Secret stripped of `whsec_` or decoded; body parsed before verifying; wrong secret for this webhook |
| Invalid only for some requests | Body modified by middleware (compression, JSON parser) |
| 500 on odd headers | Python `compare_digest` on `str`; Node `Buffer.from` on unchecked hex |
| Missing header | Request didn't come from Holded, or a proxy dropped it |
