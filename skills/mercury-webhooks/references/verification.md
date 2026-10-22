# How to Verify Mercury Webhook Signatures

## How Does Mercury Sign Webhooks?

Every request has one header:

```
Mercury-Signature: t=1735689600,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
```

- `t`: Unix timestamp in seconds when the webhook was sent
- `v1`: lowercase hex HMAC-SHA256
- Key: the endpoint's `secretKey`, used as-is (no decoding)
- Signed message: `"<t>.<raw request body>"`

Verify by splitting the header on `,` then each part on the first `=`, recomputing the HMAC, and comparing in constant time (check lengths first: `timingSafeEqual` throws on a length mismatch).

```javascript
const expected = crypto.createHmac('sha256', secret)
  .update(`${t}.`).update(rawBody).digest('hex');
```

## Where Does the Timestamp Window Go?

Mercury recommends rejecting requests whose `t` is more than 5 minutes from your clock. The examples don't do this by default. **Hookdeck retries and replays resend the original request, including the original `t`**, so a 5-minute window rejects a legitimate late redelivery (for example after your receiver was down, or when you replay an event from the dashboard). Mercury's own retries stretch over about a day, so the same applies there.

The check is opt-in: set `MERCURY_TIMESTAMP_TOLERANCE_SECONDS` to a positive whole number of seconds. In each example it lives in one place:

| Example | Where |
|---------|-------|
| Express | `timestampToleranceSeconds()` and the `tolerance > 0` branch in `verifyMercury` (`src/index.js`) |
| Next.js | the same two in `app/webhooks/mercury/route.ts` |
| FastAPI | `timestamp_tolerance_seconds()` and the `tolerance > 0` branch in `verify_mercury` (`main.py`) |

- **Drop it:** leave the variable unset or `0` (default). Delete the `tolerance > 0` branch if you want the code gone.
- **Widen it:** set a larger value, for example `86400` to cover Mercury's roughly one-day retry span. Replays from Hookdeck can be older still, so a window never fully fits replays.
- Anything that isn't a whole number is treated as `0` with a warning at startup.

The signature covers `t`, so an attacker can't refresh an old request's timestamp. Without a window, rely on the event `id` for idempotency (Mercury's docs suggest the same); see webhook-handler-patterns.

## Common Gotchas

- **Raw body:** the signature covers the exact bytes. Do not parse and re-serialise JSON first (`express.raw({ type: '*/*' })`, `request.text()`, `await request.body()`). In Express, `type: '*/*'` makes verification independent of the `Content-Type`.
- **Secret as-is:** don't base64-decode `secretKey` or strip a prefix.
- **Secret shown once:** Mercury returns it only when the endpoint is created.
- **Status codes:** reply 400 for a bad signature. Mercury doesn't retry 4xx other than 429, so a misconfigured secret won't be retried; fix it and send a new test with the verify call.
- **Respond quickly:** 5 second timeout. Acknowledge, then process asynchronously.

## How Do I Debug Verification Failures?

- Compare `MERCURY_WEBHOOK_SECRET` with the `secretKey` from the create response (no whitespace or quotes).
- A body-parsing middleware ahead of your route (`express.json()`) re-serialises the body and breaks the signature.
- Behind a proxy that rewrites the body? Compute the HMAC over what Mercury sent.
- If you set `MERCURY_TIMESTAMP_TOLERANCE_SECONDS`, an old `t` (a retry or replay) fails by design.
- Use the verify call (`POST /webhooks/{id}/verify`) to trigger a fresh, correctly signed test event.
