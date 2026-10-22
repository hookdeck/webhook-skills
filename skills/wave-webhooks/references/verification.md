# How to Verify Wave Webhook Signatures

## How Does Wave Sign Webhooks?

Every request carries:

- `x-wave-signature: t=<unix seconds>,v1=<hex>`
- `x-wave-timestamp: <unix seconds>` (the same timestamp, as a string)

Verification, per Wave's Webhooks Setup Guide:

1. Split `x-wave-signature` on `,` and then each part on the first `=` to get `t` and `v1`.
2. Build the signed payload `"<t>.<raw request body>"`.
3. Compute HMAC-SHA256 with the webhook secret (UTF-8) as the key, as lowercase hex.
4. Compare with `v1` in constant time.
5. Optionally check that `t` is within 5 minutes of now.

The guide documents no SDK for this, so verification is manual. It gives a Python example only.

```javascript
const expected = crypto.createHmac('sha256', secret)
  .update(`${t}.`).update(rawBody).digest('hex');
```

Wave doesn't document how the secret is formatted or where to find it (see [setup.md](setup.md)); use it as a plain UTF-8 string with no decoding.

## Where Can I Drop or Widen the 5-Minute Window?

Wave's guide says to reject timestamps more than 5 minutes from now. **Hookdeck retries and replays resend the original timestamp**, so with a 5-minute window any retry that arrives after downtime, and any replay from the dashboard, fails verification.

The examples make the window opt-in with `WAVE_TIMESTAMP_TOLERANCE_SECONDS`:

| Value | Behaviour |
|-------|-----------|
| unset, empty, or `0` (default) | No freshness check; signature still verified |
| positive whole number, e.g. `300` | Reject if `abs(now - t) > value` |
| anything else | Treated as `0`, with a warning at startup |

In each example the check is a single block you can delete or change:

- Express: `src/index.js`, in `verifyWave` (`const tolerance = timestampToleranceSeconds()`)
- Next.js: `app/webhooks/wave/route.ts`, in `verifyWave`
- FastAPI: `main.py`, in `verify_wave` (`tolerance = timestamp_tolerance_seconds()`)

To keep replay protection without rejecting legitimate retries, use a wide window (for example `86400` for a day) or dedupe on `event_id` (see webhook-handler-patterns idempotency). The timestamp is covered by the signature, so an attacker can't pick a fresh one for a captured body.

## Common Gotchas

- **Raw body:** the signature covers the exact bytes. Don't parse and re-serialise JSON (whitespace or key order changes break it). In Express use `express.raw({ type: '*/*' })` so any content type is read raw; in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **Use `t` from the signature header**, not `x-wave-timestamp`, which isn't signed.
- **Constant-time compare**, and guard against length mismatch (`timingSafeEqual` throws on unequal lengths).
- **Return 4xx only for bad signatures.** Wave doesn't retry 4xx, and 10 consecutive failures suspend the subscription.
- **Pro plan:** no deliveries arrive at all for non-Pro businesses.

## Debugging Verification Failures

- Confirm `WAVE_WEBHOOK_SECRET` is the webhook secret, exactly, with no whitespace or quotes.
- Log the raw body length and compare it with the bytes in Wave's **Logs & deliveries** payload.
- Behind a proxy or body-parsing middleware that re-serialises JSON? The signature will never match.
- Verification fails only on retries or replays? You have the timestamp window enabled; widen or disable it.
- Nothing arrives? Check Pro status, OAuth scopes, and whether the subscription was auto-suspended.
