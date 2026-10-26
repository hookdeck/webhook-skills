# How to Verify ZITADEL Webhook Signatures

> Only Actions v2 targets with the JSON payload type are supported. JWT and JWE payload types aren't.

## How Does ZITADEL Sign Webhooks?

Every request to a `PAYLOAD_TYPE_JSON` target carries:

```
ZITADEL-Signature: t=<unix seconds>,v1=<hex>
```

- Comma-separated `key=value` pairs, no spaces.
- `v1` is the lowercase hex HMAC-SHA256 of `<t>` + `.` + the raw request body bytes.
- The HMAC key is the target's `signingKey`, used as its UTF-8 bytes (not hex- or base64-decoded).
- There is one `v1=` entry per signing key, so a header can carry several (for example during key rotation). Accept the request if **any** entry matches, and ignore other keys such as `v0`.

ZITADEL's Go library does this in `zitadel-go` `pkg/actions/signing.go`: the MAC is fed the decimal timestamp, a `.`, then the payload.

## Implementation

ZITADEL documents a Go validator (`actions.ValidateRequestPayload`) and a Node.js sample on its knowledge base. For Node.js, Next.js and Python the examples verify manually:

1. Read the body as **bytes**, before any JSON parsing.
2. Parse the header. Take `t` as a string and collect every `v1`. No `t`, or no `v1`: fail.
3. Build the message as bytes: `t` + `"."` + raw body.
4. HMAC-SHA256 with the secret's UTF-8 bytes.
5. For each `v1`: require exactly 64 hex characters (case-insensitive), decode, compare in constant time.

See [examples/express/](../examples/express/), [examples/nextjs/](../examples/nextjs/) and [examples/fastapi/](../examples/fastapi/).

## Does the Timestamp Need a Tolerance Window?

Not by default. ZITADEL doesn't document a replay window, and Hookdeck retries and replays resend the original headers and timestamp; Hookdeck's own ZITADEL source applies no tolerance. A fixed window would reject legitimate redeliveries.

The examples offer an opt-in: set `ZITADEL_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds (`t` is Unix seconds) and signatures older or newer than that fail. Unset, `0` or an invalid value leaves it off. Prefer idempotency (for example on `aggregateID` plus `sequence` for events) to protect against replays.

## Common Gotchas

- **Raw body.** Sign the bytes ZITADEL sent. With Express use `express.raw({ type: '*/*' })`, not `express.json()`; in Next.js use `await request.arrayBuffer()`; in FastAPI use `await request.body()`. Never `JSON.parse` then `JSON.stringify` before verifying, and don't decode to a string and re-encode.
- **Don't re-format `t`.** It is part of the signed message exactly as it appears in the header.
- **Multiple `v1` entries.** Don't just read the first.
- **Hex decoding.** `Buffer.from(sig, 'hex')` silently drops bad characters, so check length (64) and alphabet first. Compare with `crypto.timingSafeEqual` on equal-length buffers, or `hmac.compare_digest` on `bytes` in Python.
- **Wrong payload type.** JWT and JWE targets send a token, not JSON, and no `ZITADEL-Signature` header. They're not covered here.
- **Status codes.** Respond `401` for a missing, malformed or mismatching signature. ZITADEL fails an execution on any status outside 200-299.
- **Untrusted fields.** After verifying, check each field's type before use (`event_payload` may be a base64 string or an object).

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always `401` | Wrong secret (copied the target ID instead of `signingKey`, or the key was regenerated), or JWT/JWE payload type |
| `401` only for some bodies | Body re-serialised before verifying, or parsed with a body parser |
| `401` after a retry or replay | Tolerance enabled; the original timestamp is old |
| `500` | `ZITADEL_WEBHOOK_SECRET` not set |
