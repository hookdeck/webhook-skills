# How to Verify Socotra Webhook Signatures

## How Does the Socotra Signature Work?

Socotra sends `socotra-signature: t=<timestamp>,v1=<signature>[,tag=<tag>]` when
the endpoint has `hmacEnabled`.

- `t` is the UTC timestamp of the transmission in **milliseconds**.
- `v1` is the lowercase hex HMAC-SHA256, keyed with the endpoint `secret`, of
  `<t>.<raw body>`. With a tag it is `<t>.<raw body>.<tag>`.
- The secret is used as UTF-8 bytes, as-is.

Socotra's docs show a JavaScript sample (tagged) but print no expected value, so
there is no published test vector. The example tests sign their own requests.

## Implementation

Build the signed message as **bytes**: the `t` string exactly as sent, a literal
`.`, then the raw body bytes. Never decode and re-encode the body, and never
`JSON.parse`/`JSON.stringify` it first.

```javascript
const expected = crypto.createHmac('sha256', secret)
  .update(Buffer.concat([Buffer.from(`${t}.`), rawBody])).digest();
```

```python
expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).digest()
```

Then:

1. Parse the header into `t` and every `v1`. Ignore other keys (`v0`, `tag`).
2. Fail if `t` or all `v1` entries are missing.
3. Require each `v1` to be exactly 64 hex characters **before** decoding. Node's
   `Buffer.from(x, 'hex')` silently drops bad characters.
4. Compare in constant time (`crypto.timingSafeEqual` on equal-length Buffers,
   `hmac.compare_digest` on bytes). Hex is case-insensitive, so lowercase it first.
5. Accept if **any** `v1` matches (several can appear during key rotation).

Complete code: [Express](../examples/express/), [Next.js](../examples/nextjs/), [FastAPI](../examples/fastapi/).

## Common Gotchas

- **Tags break verification.** A tagged endpoint signs `<t>.<body>.<tag>`. Hookdeck
  cannot verify that, so leave the tag unset.
- **Raw body.** Express: `express.raw({ type: '*/*' })`; Next.js:
  `await request.arrayBuffer()`; FastAPI: `await request.body()`.
- **`t` is a string.** Do not parse it to a number and re-format it (leading zeros
  and similar would change the signed bytes).
- **Bodyless requests.** A GET with no body is verified over zero bytes; once
  verified it gets `200`, not an invalid-JSON error.
- **Timestamp window.** Not enforced by default. Hookdeck retries and replays
  resend the original headers and timestamp, and Hookdeck itself applies no
  tolerance, so a fixed window would reject legitimate retries. For direct
  deliveries you can opt in with `SOCOTRA_WEBHOOK_TOLERANCE_SECONDS` (seconds;
  unset or `0` = off). Remember `t` is in milliseconds.
- **Status codes.** `401` for a missing, empty, malformed or mismatched signature;
  `400` for an authentic body that is not JSON.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---|---|
| No `socotra-signature` header | `hmacEnabled` is off on the endpoint |
| Header has `tag=...` and verification fails | The endpoint has a tag. Remove it |
| Always mismatched | Wrong secret, or the body was parsed/re-serialised before verifying |
| Fails only after a proxy | Something changed the body bytes |
| Only old deliveries fail | `SOCOTRA_WEBHOOK_TOLERANCE_SECONDS` is set and a retry or replay is older than the window |
