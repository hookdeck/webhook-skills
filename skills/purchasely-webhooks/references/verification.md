# How to Verify Purchasely Webhook Signatures

## How It Works

Purchasely sends two headers with each delivery:

| Header | Value |
|--------|-------|
| `X-PURCHASELY-REQUEST-SIGNATURE` | Lowercase hex HMAC-SHA256 digest, no prefix |
| `X-PURCHASELY-TIMESTAMP` | Request timestamp (Unix seconds) |

The signed message is the `X-PURCHASELY-TIMESTAMP` header value followed directly by the raw request
body, with **no separator**. The key is the webhook shared secret used as UTF-8 bytes. There is no
Purchasely SDK for this, so verification is a few lines of HMAC code. The old
`X-PURCHASELY-SIGNATURE` header is deprecated; do not use it.

```javascript
// Purchasely docs: const dataToSign = xPurchaselyTimestamp + body;
const computed = crypto.createHmac('sha256', secret).update(dataToSign).digest('hex');
```

## Implementation

The examples build the message as bytes, so the body is never decoded and re-encoded:

```javascript
const message = Buffer.concat([Buffer.from(timestampHeader, 'latin1'), rawBodyBuffer]);
const expected = crypto.createHmac('sha256', secret).update(message).digest();
```

```python
message = b"".join([timestamp.encode("latin-1"), raw_body])
expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
```

Then:

1. Reject a missing or empty signature or timestamp header (`401`).
2. Require exactly 64 hex characters in the signature before decoding it. Hex is case-insensitive:
   lowercase it, decode to 32 bytes, and compare the whole header value as one digest (no prefix or list parsing).
3. Compare in constant time: `crypto.timingSafeEqual` on equal-length Buffers in Node,
   `hmac.compare_digest` on bytes in Python. Never call `Buffer.from(sig, 'hex')` on an unvalidated value.
4. Parse the JSON body only after the check passes.

Full implementations: [Express](../examples/express/), [Next.js](../examples/nextjs/), [FastAPI](../examples/fastapi/).

## Published Test Vector

The Purchasely docs give a worked example. Every example's test suite asserts it:

| Item | Value |
|------|-------|
| Secret | `foobar` |
| `X-PURCHASELY-TIMESTAMP` | `1698322022` |
| Body | `{"a_random_key":"a_random_value_ad"}` |
| Signed message | `1698322022{"a_random_key":"a_random_value_ad"}` |
| `X-PURCHASELY-REQUEST-SIGNATURE` | `f3c2a452e9ea72f41107321aeaf7999f1054148866a710c9b23f9f501785e2a4` |

Check your own implementation against it before pointing real traffic at it.

## Timestamp Tolerance

Purchasely suggests you may compare the timestamp to the current time and decide on a tolerance. This
skill leaves that **off by default**: Hookdeck retries and replays resend the original headers and
timestamp, and Hookdeck itself applies no tolerance, so a fixed window would reject legitimate
retries (Purchasely itself retries for about 20 days). To opt in, set
`PURCHASELY_WEBHOOK_TOLERANCE_SECONDS` (unset or `0` = off); requests whose timestamp is further than
that many seconds from now, or not all digits, are rejected. Idempotency on `event_id` is the usual
replay defence.

## Common Gotchas

- **Raw body**: any change to the bytes (JSON parse and re-stringify, charset conversion) breaks the
  signature. Express: `express.raw({ type: '*/*' })`. Next.js: `request.arrayBuffer()`. FastAPI: `await request.body()`.
- **Order**: timestamp first, then the body, no separator or dot.
- **Bare hex**: the header has no `sha256=` prefix.
- **Header encoding**: use the timestamp header string exactly as received (latin1 bytes); never trim or reformat it.
- **Status code**: Purchasely acknowledges only an exact `200`. A `401` from a failed check is retried and
  pauses that user's later events, so a wrong secret has a visible cost.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always `401` | Wrong secret, or the secret was decoded / trimmed |
| Passes the test vector, fails live | Body altered before verifying (parsed, re-serialised, gzip or charset middleware) |
| Fails only on non-ASCII bodies | Body decoded to a string and re-encoded |
| Fails after a proxy | The proxy rewrote the body or dropped `X-PURCHASELY-TIMESTAMP` |
| Used `X-PURCHASELY-SIGNATURE` | That header is deprecated; use `X-PURCHASELY-REQUEST-SIGNATURE` |
