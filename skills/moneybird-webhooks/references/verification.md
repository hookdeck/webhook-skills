# How to Verify Moneybird Webhook Signatures

## How Does Moneybird Sign Webhooks?

Every request has one header:

```
Moneybird-Signature: t=1748534400,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
```

- `t`: delivery timestamp, Unix seconds
- `v1`: lowercase hex HMAC-SHA256. During a secret rotation there is one `v1=` per active secret: `t=...,v1=5257a869...,v1=6ffbb59b...`
- Key: the webhook's `secret`, used as-is (no decoding)
- Signed message: `"{t}.{raw request body}"`
- Moneybird asks you to ignore schemes you don't recognise (a future `v2=`), so a downgrade can't skip verification.

Steps: split the header on `,` and trim each part (a space after the comma is fine), split each part on the first `=`, take `t` and every `v1`, recompute the HMAC, and compare each `v1` in constant time. Accept if **any** matches. Reject a header with no `t` or no `v1`.

```javascript
const expected = crypto.createHmac('sha256', secret)
  .update(`${t}.`).update(rawBody).digest('hex');
```

## Comparing in Constant Time

- **Node.js:** `timingSafeEqual` throws on a length mismatch, and `Buffer.from(x, 'hex')` silently truncates invalid hex. Check the received value matches `/^[0-9a-f]{64}$/i` first, then compare the lowercase strings as equal-length UTF-8 buffers.
- **Python:** `hmac.compare_digest` raises `TypeError` for a non-ASCII `str`. Encode both sides to bytes (and check the 64-hex shape first), so a bad header is a 400, not a 500.

## Where Does the Timestamp Window Go?

Moneybird recommends rejecting requests whose `t` is more than 5 minutes from your clock. The examples don't do this by default. **Hookdeck retries and replays resend the original request, including the original `t`**, so a 5-minute window rejects a legitimate late redelivery (for example after your receiver was down, or when you replay an event from the dashboard). Moneybird's own retries (10 attempts, with growing intervals) hit the same problem.

The check is opt-in: set `MONEYBIRD_TIMESTAMP_TOLERANCE_SECONDS` to a positive whole number of seconds. In each example it lives in one place:

| Example | Where |
|---------|-------|
| Express | `timestampToleranceSeconds()` and the `tolerance > 0` branch in `verifyMoneybird` (`src/index.js`) |
| Next.js | the same two in `app/webhooks/moneybird/route.ts` |
| FastAPI | `timestamp_tolerance_seconds()` and the `tolerance > 0` branch in `verify_moneybird` (`main.py`) |

- **Drop it:** leave the variable unset or `0` (default). Delete the `tolerance > 0` branch if you want the code gone.
- **Widen it:** set a larger value, for example `86400` for a day. Replays from Hookdeck can be older still, so a window never fully fits replays.
- Anything that isn't a whole number is treated as `0` with a warning at startup.

The signature covers `t`, so an attacker can't refresh an old request's timestamp. Without a window, dedupe on the `Idempotency-Key` header (unique per push, repeated on retries); see webhook-handler-patterns.

## Common Gotchas

- **Raw body:** the signature covers the exact bytes. Do not parse and re-serialise JSON first (`express.raw({ type: '*/*' })`, `request.text()`, `await request.body()`). In Express, `type: '*/*'` makes verification independent of the `Content-Type`.
- **Secret as-is:** don't base64-decode it or strip a prefix.
- **Secret shown once:** the API returns it only when the webhook is created; reveal it later on the webhook detail page (MFA required).
- **Several `v1` values:** during a rotation, don't stop at the first one.
- **Status codes:** reply `200` once verified. Any other status makes Moneybird retry, including a 400 for a bad signature, so fix the secret rather than waiting.

## How Do I Debug Verification Failures?

- Compare `MONEYBIRD_WEBHOOK_SECRET` with the `secret` from the create response (no whitespace or quotes). Don't confuse it with the `token` field.
- A body-parsing middleware ahead of your route (`express.json()`) re-serialises the body and breaks the signature.
- Behind a proxy that rewrites the body? Compute the HMAC over what Moneybird sent.
- If you set `MONEYBIRD_TIMESTAMP_TOLERANCE_SECONDS`, an old `t` (a retry or replay) fails by design.
- Read the last HTTP status and body Moneybird stored for the webhook (`GET /{administration_id}/webhooks.json`).
