# Exa Signature Verification

## How Does Exa Sign Webhooks?

Every delivery carries one header:

```
Exa-Signature: t=1234567890,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
```

- `t` is the Unix timestamp (seconds) when the webhook was sent.
- `v1` is a hex HMAC-SHA256. The header can contain more than one `v1`; accept the request if any matches.
- Signed content: `"<t>.<raw request body>"`.
- Key: the webhook `secret` from the create response, used as a UTF-8 string (not decoded).

Exa documents no SDK helper, so verification is manual.

## Implementation

See the verification core in [SKILL.md](../SKILL.md). Complete, tested handlers: [Express](../examples/express/), [Next.js](../examples/nextjs/), [FastAPI](../examples/fastapi/).

Steps:

1. Read the raw body (Express: `express.raw({ type: '*/*' })`, so any content type verifies; Next.js: `await request.text()`; FastAPI: `await request.body()`).
2. Parse `t` and every `v1` from `Exa-Signature`.
3. Compute `HMAC_SHA256(secret, t + "." + rawBody)` as hex.
4. Compare with each `v1` using a timing-safe function. Guard against length mismatches (`timingSafeEqual` throws on unequal lengths).
5. Return `400` if invalid.

## Common Gotchas

- **Raw body only.** Parsing and re-serialising JSON changes the bytes and breaks the signature.
- **Secret only on create.** `GET` on a webhook does not return it.
- **Timestamp freshness is opt-in.** Exa's docs suggest rejecting timestamps over 5 minutes old, but retries and Hookdeck replays keep the original `t`, so a window rejects valid redeliveries. The examples enable it only when `EXA_TIMESTAMP_TOLERANCE_SECONDS` is a positive number. Idempotency on the event `id` covers replay protection.
- **Multiple `v1` values.** Check all of them.
- **Redirects fail.** Register the final URL; a 3xx response is a failed delivery.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Always invalid | Body was parsed before verifying, or wrong secret (e.g. an API key instead of the webhook `secret`) |
| Invalid for some content types only | Body parser limited to `application/json`; use `express.raw({ type: '*/*' })` |
| Invalid after a proxy | Proxy altered the body; verify the exact bytes received |
| Fails only on old replays | `EXA_TIMESTAMP_TOLERANCE_SECONDS` is set; unset it or use `0` |
