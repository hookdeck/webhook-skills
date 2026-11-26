# How to Verify ConfigCat Webhook Signatures

## How Does ConfigCat Signing Work?

Each request carries:

| Header | Value |
|--------|-------|
| `X-ConfigCat-Webhook-ID` | Unique ID per request |
| `X-ConfigCat-Webhook-Timestamp` | Unix seconds |
| `X-ConfigCat-Webhook-Signature-V1` | Base64 HMAC-SHA256 signature(s), comma-separated |

The signature is the **standard base64 (padded) HMAC-SHA256** of this content, with **no separators** between the parts:

```
{X-ConfigCat-Webhook-ID}{X-ConfigCat-Webhook-Timestamp}{raw body}
```

- Key: the whole signing key (`configcat_whsk_...`) as UTF-8 bytes, used as-is (not hex- or base64-decoded).
- Header values are used exactly as received (never trimmed or reformatted). Build the message as **bytes**: header values as latin1, the body bytes exactly as received, joined with `Buffer.concat` / `b"".join`. Never decode and re-encode the body, and never parse JSON before verifying.
- The body can be empty (GET): then only ID + timestamp are signed.
## Implementation

Each example verifies the same way: `examples/express/`, `examples/nextjs/` (`lib/verify.ts`) and `examples/fastapi/` (`main.py`).

```javascript
const message = Buffer.concat([Buffer.from(id, 'latin1'), Buffer.from(timestamp, 'latin1'), rawBody]);
const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest('base64');
```

```python
message = wid.encode("latin-1") + ts.encode("latin-1") + raw_body
expected = base64.b64encode(hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest())
```

Split the header on commas: it holds one signature per signing key, two during a key rotation. Validate each entry's format: it must match `[A-Za-z0-9+/]{43}=` (44 characters, padded, case-sensitive). Then compare in constant time: Node checks lengths and uses `crypto.timingSafeEqual` on equal-length Buffers (never `Buffer.from(sig, 'base64')` on an unvalidated value, which silently drops bad characters); Python uses `hmac.compare_digest` on bytes and `base64.b64decode(..., validate=True)`, then re-encodes and requires the original string (or compares the base64 text directly), because the decoder ignores stray low bits in the last character.

Accept the request if any entry matches. A missing or empty header, a header with no well-formed entry, or no match is `401`.

## Published Test Vector

ConfigCat's docs give a worked example, and every example's test suite asserts it:

| Field | Value |
|-------|-------|
| Signing key | `configcat_whsk_VN3juirnVh5pNvCKd81RYRYchxUX4j3NykbZG2fAy88=` |
| `X-ConfigCat-Webhook-ID` | `b616ca659d154a5fb907dd8475792eeb` |
| `X-ConfigCat-Webhook-Timestamp` | `1669629035` |
| Body | `examplebody` |
| `X-ConfigCat-Webhook-Signature-V1` | `Ks3cYsu9Lslfo+hVxNC3oQWnsF9e5d73TI5t94D9DRA=` |

## Common Gotchas

- **Two signing keys:** ConfigCat then sends `sigA,sigB`, one signature per key. The examples split the list and accept a match on any entry, so deliveries keep verifying through a rotation.
- **Keep the prefix:** the `configcat_whsk_` prefix is part of the key.
- **No body:** a webhook without a body template sends no body, so treat a missing body as empty bytes. If the webhook uses GET, accept GET on the route (and on the Hookdeck source).
- **Raw body for any content type:** Express needs `express.raw({ type: '*/*' })`, Next.js `await request.arrayBuffer()`, FastAPI `await request.body()`.
- **No separators:** `id + timestamp + body`, nothing between them.

## Should I Reject Old Timestamps?

Not by default. ConfigCat recommends a timestamp check but sets no window, and a tight window can reject a legitimate request that arrives late. The examples offer an opt-in `CONFIGCAT_WEBHOOK_TOLERANCE_SECONDS` (unset or `0` = off); `X-ConfigCat-Webhook-Timestamp` is Unix seconds. Don't dedupe on `X-ConfigCat-Webhook-ID`: ConfigCat says it "is different for every request", so its own retries (up to 5) arrive with new IDs. Make the handler idempotent instead, for example by treating each call as a signal to refresh config state rather than applying a change twice.

## How Do I Debug Verification Failures?

1. Log the three header values and the body length (not the key).
2. Check the key: whole, with `configcat_whsk_`, no whitespace.
3. Check you split the header on commas and compare against each entry.
4. Make sure no middleware parsed or re-encoded the body.
5. Run the published vector through your code.
