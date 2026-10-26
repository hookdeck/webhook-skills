# How to Verify Pulumi Webhook Signatures

## How Does Pulumi Sign Webhooks?

Only if the webhook has a shared secret, every request has this header:

```
Pulumi-Webhook-Signature: <64 lowercase hex characters>
```

- Algorithm: HMAC-SHA256, hex encoded, no prefix (the whole header value is one digest)
- Key: the shared secret's UTF-8 bytes, used as-is
- Signed message: the raw request body bytes, exactly as received. No timestamp, id or header is signed

## How Do I Compare Safely?

- Validate the header first: exactly 64 hex characters. Treat uppercase as equal to lowercase (lower-case it, or decode both sides to bytes).
- **Node:** after the pattern check, compare equal-length buffers with `crypto.timingSafeEqual`. Never call `Buffer.from(sig, 'hex')` on an unvalidated value: it silently drops bad characters.
- **Python:** `hmac.compare_digest` on bytes (`.encode()` both sides). Passing `str` raises `TypeError` for non-ASCII input, which would be a 500 instead of a rejection.
- Build the message from the raw bytes: `express.raw({ type: '*/*' })`, `await request.arrayBuffer()` in Next.js, `await request.body()` in FastAPI. Never `JSON.parse` and re-serialize first.

A missing or empty header, a malformed value or a mismatch is a `401`.

## Why Is There No Timestamp Check?

Nothing time-based is signed, so there is no replay window to enforce, and the examples don't invent one from unsigned headers or body fields. Make handlers idempotent instead (see webhook-handler-patterns). Redelivering a failed delivery from the console sends it unchanged.

## What Does Pulumi's Documentation Get Wrong?

- The header table and the Go and TypeScript snippets say hex. The Python snippet computes `hexdigest()` and then compares against `base64.b64encode(hash.digest())`, which contradicts them. Use hex.
- The JavaScript snippet is broken as printed (`hmac.update(payloadBody)` with `hmac` and `payloadBody` undefined).

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| No `Pulumi-Webhook-Signature` header | The webhook has no shared secret. Set a shared secret on the Pulumi webhook; without one, deliveries are unsigned and fail verification |
| Signature never matches | A body parser ran first, so the bytes changed; or the secret in your environment differs from the one on the webhook (including whitespace) |
| Signature never matches, secret is right | You decoded the secret (hex or base64) or compared against a base64 digest copied from the docs' Python snippet |
| Matches locally, fails behind a proxy | Something re-encoded the body (for example compression or a JSON middleware) before your handler |
