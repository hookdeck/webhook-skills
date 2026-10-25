# How to Verify Zigpoll Webhook Signatures

## How Does Zigpoll Sign Webhooks?

Every request has this header:

```
X-Zigpoll-Signature: t=1754400000000,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
```

- `t`: send time in **milliseconds**
- `v1`: hex HMAC-SHA256. Zigpoll's docs show one `v1` and describe no overlap period on rotation (support rotates the secret and it applies immediately); the examples accept the header if any `v1` matches, defensively
- Key: the account-wide Signing Secret, used as-is
- Signed message: `"<t>.<raw request body>"`

Split the header on `,`, trim each part (a space after the comma is allowed), then split on the first `=`. Reject a header with no `t` or no `v1`.

## How Do I Compare Safely?

- **Node:** check each `v1` matches `/^[0-9a-f]{64}$/i` before decoding (`Buffer.from(x, 'hex')` silently truncates invalid hex), or, as the examples do, compare the lowercase hex strings as equal-length UTF-8 buffers with `crypto.timingSafeEqual` after the pattern check.
- **Python:** `hmac.compare_digest` on bytes (`.encode()` both sides). Passing `str` raises `TypeError` for non-ASCII, which would be a 500 instead of a rejection.

## Where Does the Timestamp Window Go?

The examples don't reject old timestamps by default. **Hookdeck retries and replays resend the original request, including the original `t`, so a 5-minute window rejects late retries.** Zigpoll re-signs each of its own attempts with a fresh `t`, so a window works when Zigpoll delivers straight to you, but not behind Hookdeck.

The check is opt-in: set `ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS` to a positive whole number of seconds. In each example it lives in one place:

| Example | Where |
|---------|-------|
| Express | `timestampToleranceSeconds()` and the `tolerance > 0` branch in `verifyZigpoll` (`src/index.js`) |
| Next.js | the same two in `app/webhooks/zigpoll/route.ts` |
| FastAPI | `timestamp_tolerance_seconds()` and the `tolerance > 0` branch in `verify_zigpoll` (`main.py`) |

- **Drop it:** leave the variable unset or `0` (default). Delete the `tolerance > 0` branch if you want the code gone.
- **Widen it:** set a larger value, for example `86400` for a day. Replays from Hookdeck can be older still.
- `t` is milliseconds: the code divides by 1000 before comparing with a seconds tolerance. Do the same if you write your own check.
- Anything that isn't a whole number is treated as `0` with a warning at startup.

The signature covers `t`, so an attacker can't refresh an old request's timestamp. Without a window, dedupe on `X-Zigpoll-Delivery-Id`.

## Common Gotchas

- **Raw body:** the signature covers the exact bytes. Don't parse and re-serialise JSON first (`express.raw({ type: '*/*' })`, `request.text()`, `await request.body()`).
- **Milliseconds:** `t` is not seconds.
- **Signing Secret, not the Secret Key:** the legacy `X-Zigpoll-Secret` header is a different value and isn't used.
- **Status codes:** the examples reply 401 for a bad signature. Zigpoll treats other 4xx as permanent and doesn't retry them.
- **Respond quickly:** 10 second timeout. Acknowledge, then process asynchronously.

## How Do I Debug Verification Failures?

- Compare `ZIGPOLL_WEBHOOK_SECRET` with the Signing Secret in Integrations → Webhooks (no whitespace or quotes).
- A body-parsing middleware ahead of your route (`express.json()`) re-serialises the body and breaks the signature.
- Behind a proxy that rewrites the body? Compute the HMAC over what Zigpoll sent.
- If you set `ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS`, an old `t` (a Hookdeck retry or replay) fails by design.
