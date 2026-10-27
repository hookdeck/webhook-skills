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
- This matches Hookdeck's `CONFIGCAT` source: HMAC, SHA-256, header `x-configcat-webhook-signature-v1`, base64, template `{header:x-configcat-webhook-id}{header:x-configcat-webhook-timestamp}{body}`.

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

Validate the format first: the signature must match `[A-Za-z0-9+/]{43}=` (44 characters, padded, case-sensitive). Then compare in constant time: Node checks lengths and uses `crypto.timingSafeEqual` on equal-length Buffers (never `Buffer.from(sig, 'base64')` on an unvalidated value, which silently drops bad characters); Python uses `hmac.compare_digest` on bytes and `base64.b64decode(..., validate=True)`, then re-encodes and requires the original string (or compares the base64 text directly), because the decoder ignores stray low bits in the last character and Hookdeck compares base64 exactly.

Compare the **whole** header as one digest, with no list splitting or prefix parsing. A missing or empty header, a malformed value or a mismatch is `401`.

## Published Test Vector

ConfigCat's docs give a worked example, and every example's test suite asserts it:

| Field | Value |
|-------|-------|
| Signing key | `configcat_whsk_VN3juirnVh5pNvCKd81RYRYchxUX4j3NykbZG2fAy88=` |
| `X-ConfigCat-Webhook-ID` | `b616ca659d154a5fb907dd8475792eeb` |
| `X-ConfigCat-Webhook-Timestamp` | `1669629035` |
| Body | `examplebody` |
| `X-ConfigCat-Webhook-Signature-V1` | `Ks3cYsu9Lslfo+hVxNC3oQWnsF9e5d73TI5t94D9DRA=` |

This vector was also checked against Hookdeck's template.

## Common Gotchas

- **Two signing keys:** ConfigCat then sends `sigA,sigB`. Hookdeck and these examples compare the whole header to one signature, so verification fails. Keep a single key; during a rotation deliveries are rejected until the old key is removed.
- **Keep the prefix:** the `configcat_whsk_` prefix is part of the key.
- **GET webhooks have no body:** treat a missing body as empty bytes, and accept GET on the route (and on the Hookdeck source, which pre-selects POST).
- **Raw body for any content type:** Express needs `express.raw({ type: '*/*' })`, Next.js `await request.arrayBuffer()`, FastAPI `await request.body()`.
- **No separators:** `id + timestamp + body`, nothing between them.

## Should I Reject Old Timestamps?

Not by default. Hookdeck retries and replays resend the original headers and timestamp, and Hookdeck applies no tolerance itself, so a fixed window rejects legitimate retries. The examples offer an opt-in `CONFIGCAT_WEBHOOK_TOLERANCE_SECONDS` (unset or `0` = off); `X-ConfigCat-Webhook-Timestamp` is Unix seconds. Don't dedupe on `X-ConfigCat-Webhook-ID`: ConfigCat says it "is different for every request", so its own retries (up to 5) arrive with new IDs. Make the handler idempotent instead, for example by treating each call as a signal to refresh config state rather than applying a change twice.

## How Do I Debug Verification Failures?

1. Log the three header values and the body length (not the key).
2. Check the key: whole, with `configcat_whsk_`, no whitespace.
3. Check the header has one signature (no comma).
4. Make sure no middleware parsed or re-encoded the body.
5. Run the published vector through your code.
