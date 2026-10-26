# How to Verify Sublime Security Webhook Signatures

## How Does Sublime Sign Webhooks?

Every delivery carries `X-Sublime-Signature`:

```
t=1626139320,v0=3d35d777510a7ccf73ded723f141b0ada2986aebe63c4e45a9c7e4bb1abaca06
```

- Algorithm: HMAC-SHA256, lowercase hex
- Key: the webhook Action's signing secret (Actions page → select the Action → click to reveal), used as UTF-8 bytes
- Signed message: `<t>.<raw request body>` (the timestamp, a literal `.`, then the exact bytes)
- `t`: Unix timestamp in seconds, prefixed `t=`
- Signatures: each prefixed with a scheme, `v` followed by an integer. `v0` is the only valid scheme today. The header can hold several, so accept the request if any `v0` value matches
- This is the same shape as Stripe's `t=...,v1=...` header, with `v0` instead of `v1` and no space after the comma

Sublime has no SDK for this, so the examples verify manually, the same way in Node, Next.js, and FastAPI.

## Implementation

```javascript
const expected = crypto.createHmac('sha256', secret)
  .update(`${timestamp}.`).update(rawBody).digest();           // Buffer
const ok = signatures.some((sig) =>
  /^[0-9a-fA-F]{64}$/.test(sig) && crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected));
```

Parse the header by splitting on `,`, then splitting each item on the first `=`. Require `t` to be a plain positive integer.

## Replay Protection

The examples **don't check the timestamp by default**. Hookdeck retries and replays resend the original timestamp, so a window would reject legitimate late redeliveries (Sublime's own retries get a fresh timestamp and signature, but you can't tell which one you are receiving). To opt in, set `SUBLIME_SECURITY_TIMESTAMP_TOLERANCE_SECONDS` to a positive whole number of seconds (for example `300`). Any other value leaves the check off, with a warning at startup. Use the body `id` for idempotency (see webhook-handler-patterns).

## Common Gotchas

- **Raw body:** the signature covers the exact bytes. Do not parse JSON before verifying (`express.raw({ type: '*/*' })`, `request.text()`, `await request.body()`). `type: '*/*'` makes any content type reach the verifier.
- **Validate hex before decoding:** `Buffer.from(x, 'hex')` silently truncates invalid hex, which could turn a malformed value into a shorter one. Require exactly 64 hex characters first. Hex is case-insensitive.
- **Constant-time compare:** `crypto.timingSafeEqual` on the decoded bytes (Node), `hmac.compare_digest` on lowercased hex (Python).
- **Multiple `v0` values:** accept any one that matches; don't stop at the first.
- **Ignore other schemes:** only `v0` is defined today; skip other `v`-prefixed values.
- **Status code:** respond `401` for a missing or invalid signature.
- **Header names are case-insensitive;** Node lowercases them.

## Debugging Verification Failures

- Confirm `SUBLIME_SECURITY_WEBHOOK_SECRET` is the secret of *this* webhook Action, with no whitespace or quotes.
- Behind a proxy or body-parsing middleware that re-serialises JSON? The signature will fail.
- Log the received `t` and compare your computed HMAC for the same bytes; if only some deliveries fail, check for a tolerance setting rejecting retried deliveries.
