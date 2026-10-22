# How to Verify Luma Webhook Signatures

## How It Works

Every request carries:

```
Webhook-Signature: t=1700000000,v1=0123456789abcdef...
Webhook-Id: <unique event id>
Webhook-Timestamp: 1700000000
```

- `t` — Unix timestamp (seconds) when the webhook was sent
- `v1` — hex HMAC-SHA256

Signed string: `"<t>.<raw request body>"`. Key: the whole webhook secret (`whsec_...`) as a UTF-8 string.

This is **not** Standard Webhooks, despite the header names and the `whsec_` prefix: the signature header is Stripe-style (`t=,v1=`, hex), and `Webhook-Id` is not in the signed content. Do not use the `standardwebhooks` or `svix` libraries.

Steps:

1. Read the raw body bytes.
2. Split `Webhook-Signature` on `,`, then each element on the first `=`, to get `t` and `v1`.
3. Optionally reject if `t` is too old (off by default, see below).
4. Compute `hex(HMAC_SHA256(secret, t + "." + rawBody))`.
5. Compare to `v1` with a constant-time function.

Luma ships no verification SDK, so this is manual in every language. Tested versions: [examples/express/](../examples/express/), [examples/nextjs/](../examples/nextjs/), [examples/fastapi/](../examples/fastapi/).

## Common Gotchas

- **Raw body.** Re-serialized JSON changes bytes and breaks the signature. Express: `express.raw({ type: '*/*' })`; Next.js: `await request.text()`; FastAPI: `await request.body()`.
- **Don't decode the secret.** Unlike Standard Webhooks, `whsec_` is part of the key.
- **Timestamp window is opt-in.** Luma's docs suggest rejecting timestamps more than a few minutes old. Luma's retries (1, 2, 4 minutes) and Hookdeck's retries and replays keep the original `t`, so a default window would reject legitimate redeliveries. Set `LUMA_TIMESTAMP_TOLERANCE_SECONDS` to a positive whole number to enable it; any other value is treated as `0` with a warning.
- **Duplicates.** Deduplicate on `Webhook-Id`.
- **Return 2xx fast** (within 5 seconds). A `410` pauses the webhook, so don't use it for transient errors.

## Debugging Verification Failures

- Check that `LUMA_WEBHOOK_SECRET` is the full `whsec_...` string for this webhook (each webhook has its own secret).
- Log the raw body length and compare with `Content-Length`; a mismatch means middleware touched the body.
- Confirm you sign `t` from the header, then `.`, then the body, not `Webhook-Id`.
