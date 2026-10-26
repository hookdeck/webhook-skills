# How to Verify BigMailer Webhook Signatures

## How Does BigMailer Sign Webhooks?

Every event carries `X-BigMailer-Signature`:

```
X-BigMailer-Signature: t=1492774578,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8be
```

- Algorithm: HMAC-SHA256
- Key: the endpoint's signing secret (shown with "show" in the Webhooks settings), as UTF-8 bytes, used as-is
- Signed message: the `t` value exactly as it appears in the header, a literal `.`, then the raw request body bytes
- `v1`: the only valid signature scheme. Ignore other keys.
- Encoding: BigMailer's docs never name the digest encoding. The example value is 64 hex characters, so the examples treat it as lowercase hex and compare case-insensitively.
- There is no official SDK helper in the docs, so the examples verify manually, and all three share one algorithm.

## Implementation

```javascript
const expected = Buffer.from(
  crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex')
);
const ok = signatures.some((sig) =>
  /^[0-9a-fA-F]{64}$/.test(sig) && crypto.timingSafeEqual(Buffer.from(sig.toLowerCase()), expected));
```

Parse the header by splitting on `,`, trimming each item, and splitting on the first `=`. Collect every `v1` value and accept the event if any matches (several can appear during key rotation). A header with no `t` value fails.

## Replay Protection

The examples **don't check the timestamp by default**. Retries and replays (BigMailer's, Hookdeck's, manual resends) resend the original headers, and Hookdeck's own verification applies no tolerance, so a fixed window would reject legitimate late redeliveries. To opt in, set `BIGMAILER_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds (for example `300`); `t` is Unix seconds, and with a tolerance set it must be a whole number. Unset or `0` leaves it off, and a value that isn't a whole number is treated as `0` with a warning at startup.

## Common Gotchas

- **Raw body:** the signature covers the exact bytes. Don't parse or re-serialize JSON before verifying (`express.raw({ type: '*/*' })`, `await request.arrayBuffer()`, `await request.body()`). Build the signed message as bytes; never decode the body to a string and re-encode it.
- **Keep `t` a string:** sign with the header's `t` text as sent. Don't parse it to a number and format it back.
- **Validate before decoding:** require exactly 64 hex characters before comparing. In Node, `Buffer.from(sig, 'hex')` silently drops bad characters, so don't use it on an unvalidated value.
- **Constant-time compare:** check lengths, then `crypto.timingSafeEqual` on equal-length Buffers; in Python use `hmac.compare_digest` on bytes.
- **Multiple `v1` entries:** accept if any matches.
- **Status codes:** missing, empty, malformed, or mismatched signature → `401`. A signed body that isn't a JSON object → `400`.
- **Untrusted fields:** after verification, still check the type of the body and each nested field before reading into it (`typeof`/`Array.isArray` in JavaScript, `isinstance` in Python).
- **Header names are case-insensitive;** Node lowercases them.

## Debugging Verification Failures

- Confirm `BIGMAILER_WEBHOOK_SECRET` is the secret of *this* endpoint, with no whitespace or quotes.
- Body-parsing middleware or a proxy that re-serializes JSON will break the signature.
- If you set a tolerance and valid events start failing after downtime, that is the window rejecting retries; raise it or turn it off.
- Behind Hookdeck, the BigMailer source verifies the signature with the endpoint's signing secret, and the original headers are forwarded to your handler.
