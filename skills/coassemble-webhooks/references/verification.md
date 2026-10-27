# How to Verify Coassemble Webhook Signatures

## How Does Coassemble Sign Webhooks?

Each delivery carries two headers:

```
X-Coassemble-Signature: sha256=<64 lowercase hex characters>
X-Coassemble-Timestamp: 1736937000
```

- Algorithm: HMAC-SHA256, hex
- Key: the endpoint's signing secret, used as-is (its UTF-8 bytes, not hex- or base64-decoded)
- Signed message: the `X-Coassemble-Timestamp` value, a literal `.`, then the **raw request body bytes**
- `X-Coassemble-Timestamp` is Unix seconds
- Authentication is the signature alone; Coassemble sends no API key or basic auth

Coassemble's docs give a Node sample; there is no SDK helper, so the examples verify manually.

## Implementation

```javascript
const message = Buffer.concat([Buffer.from(timestampHeader, 'latin1'), Buffer.from('.'), rawBody]);
const expected = crypto.createHmac('sha256', secret).update(message).digest();
```

Steps, in order:

1. Reject a missing or empty signature or timestamp header.
2. Strip a leading `sha256=` (accept a bare digest too).
3. Require exactly 64 hex characters (either case) **before** decoding. `Buffer.from(sig, 'hex')` silently drops bad characters, so never call it on unvalidated input.
4. Build the message as bytes. Use the timestamp header string exactly as received (never trimmed or re-formatted) and the body bytes as received. Don't decode and re-encode the body.
5. Compare the decoded bytes in constant time (`crypto.timingSafeEqual` on equal-length Buffers, `hmac.compare_digest` on bytes).
6. On any failure return `401`.

## Replay Protection

Coassemble's docs show no timestamp window. The examples **don't check the timestamp age by default**: retries and replays (Coassemble's own, Hookdeck's, manual resends) carry the original `X-Coassemble-Timestamp`, so a fixed window would reject legitimate late redeliveries, and Hookdeck itself applies no tolerance. To opt in, set `COASSEMBLE_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds (for example `300`); unset or `0` means off. A value that isn't a whole number is treated as `0`, with a warning at startup. Use the `X-Coassemble-Delivery` header (identical across retries) for idempotency (see webhook-handler-patterns).

## Common Gotchas

- **Sign the raw body.** Coassemble's docs say to verify against the raw request body before JSON parsing. Re-serialized JSON can differ in whitespace or key order. Use `express.raw({ type: '*/*' })`, `await request.arrayBuffer()` or `await request.body()`.
- **Docs sample vs. examples:** Coassemble's Node sample interpolates a string body and compares the whole `sha256=...` header with `timingSafeEqual` on UTF-8 strings. The examples build the message from bytes, accept the prefix being absent, and compare decoded digests, which behaves the same for valid deliveries.
- **Test deliveries are signed too.** Check `testMode` after verification and skip production actions.
- **Case:** compare hex case-insensitively.
- **Header names are case-insensitive;** Node lowercases them.
- **Secret shown once:** the signing secret is returned only when the endpoint is created.

## Debugging Verification Failures

- Confirm `COASSEMBLE_WEBHOOK_SECRET` is this endpoint's signing secret, with no whitespace or quotes.
- Behind a proxy or body-parsing middleware that re-serialises JSON? The signature will fail.
- Send a test delivery from **Developer → Webhooks** and check the status your endpoint returned.
- If you set a tolerance and valid events start failing after downtime, that is the window rejecting retries; raise it or turn it off.
