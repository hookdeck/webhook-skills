# How to Verify Chatim Webhook Signatures

## How Does Chatim Sign Webhooks?

Each delivery carries two headers:

```
X-Chatim-Signature: sha256=<64 lowercase hex characters>
X-Chatim-Timestamp: 1736937000
```

- Algorithm: HMAC-SHA256, hex
- Key: the webhook secret from the dashboard, used as-is (its UTF-8 bytes, not hex- or base64-decoded)
- Signed message: the `X-Chatim-Timestamp` value, a literal `.`, then the **raw request body bytes**
- `X-Chatim-Timestamp` is Unix seconds
- Authentication is the signature alone; Chatim sends no API key or basic auth

Chatim's docs give Node and Python samples; there is no SDK helper, so the examples verify manually.

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

Chatim's samples reject timestamps older than 5 minutes (300 seconds). The examples **don't check it by default**: retries and replays (Chatim's own, Hookdeck's, manual resends) carry the original `X-Chatim-Timestamp`, so a fixed window would reject legitimate late redeliveries, and Hookdeck itself applies no tolerance. To opt in, set `CHATIM_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds (for example `300`); unset or `0` means off. A value that isn't a whole number is treated as `0`, with a warning at startup. Use `eventId` or `X-Chatim-Delivery-Id` for idempotency (see webhook-handler-patterns).

## Common Gotchas

- **Sign the raw body.** Chatim's Node sample signs `JSON.stringify(req.body)`, but its troubleshooting section says to sign `timestamp + "." + raw_body`, not parsed JSON. Re-serialized JSON can differ in whitespace or key order. Use `express.raw({ type: '*/*' })`, `await request.arrayBuffer()` or `await request.body()`.
- **Return 4xx only for a bad signature.** Chatim never retries a `4xx`, so a transient problem on your side should be a `5xx`.
- **Prefix is optional.** Chatim sends `sha256=<hex>`; Hookdeck also accepts the bare digest, so the examples do too.
- **Case:** compare hex case-insensitively.
- **Header names are case-insensitive;** Node lowercases them.
- **Secret shown once:** if you didn't save it, regenerate it.

## Debugging Verification Failures

- Confirm `CHATIM_WEBHOOK_SECRET` is this webhook's secret (not a regenerated, now-invalid one), with no whitespace or quotes.
- Behind a proxy or body-parsing middleware that re-serialises JSON? The signature will fail.
- Use **Test** in the dashboard and the delivery history to see the status your endpoint returned.
- If you set a tolerance and valid events start failing after downtime, that is the window rejecting retries; raise it or turn it off.
