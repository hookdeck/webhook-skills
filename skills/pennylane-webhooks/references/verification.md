# How to Verify Pennylane Webhook Signatures

## How Does Pennylane Sign Webhooks?

Every request has one header:

```
X-Pennylane-Signature: t=1657875952,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
```

- `t`: Unix timestamp in **seconds**
- `v1`: lowercase hex HMAC-SHA256. Pennylane's docs show one `v1` and don't describe secret rotation; the examples accept the header if any `v1` matches, defensively
- Key: the subscription `secret`, used as-is (no decoding)
- Signed message: `"<t>.<raw request body>"`

Verify by splitting the header on `,`, trimming each part (a space after the comma is allowed), then splitting each part on the first `=`. Take `t` and every `v1`, recompute the HMAC, and accept if **any** `v1` matches. Reject a header with no `t` or no `v1`.

```javascript
const expected = crypto.createHmac('sha256', secret)
  .update(`${t}.`).update(rawBody).digest('hex');
```

## How Do I Compare the Signature Safely?

- **Node.js:** check the received value is exactly 64 hex characters (`/^[0-9a-f]{64}$/i`) first, then compare the lowercase strings as equal-length UTF-8 buffers with `crypto.timingSafeEqual`. Don't decode with `Buffer.from(x, 'hex')`: invalid hex is silently truncated, so a short or garbled value could compare equal to something unintended.
- **Python:** `hmac.compare_digest` on **bytes** (`.encode()` both sides). On `str` it raises `TypeError` for non-ASCII input, which would turn a junk header into a 500 instead of a rejection.

## Where Does the Timestamp Window Go?

Pennylane documents replay protection as optional: compare `t` to the current time and discard requests older than a tolerance you choose (5 minutes is a common default). The examples don't do this by default. **Hookdeck retries and replays resend the original request, including the original `t`**, so a 5-minute window rejects a legitimate late redelivery (for example after your receiver was down, or when you replay an event from the dashboard). Pennylane also retries failed deliveries, but doesn't document the schedule or whether a retry is re-signed with a fresh `t`.

The check is opt-in: set `PENNYLANE_TIMESTAMP_TOLERANCE_SECONDS` to a positive whole number of seconds. In each example it lives in one place:

| Example | Where |
|---------|-------|
| Express | `timestampToleranceSeconds()` and the `tolerance > 0` branch in `verifyPennylane` (`src/index.js`) |
| Next.js | the same two in `app/webhooks/pennylane/route.ts` |
| FastAPI | `timestamp_tolerance_seconds()` and the `tolerance > 0` branch in `verify_pennylane` (`main.py`) |

- **Drop it:** leave the variable unset or `0` (default). Delete the `tolerance > 0` branch if you want the code gone.
- **Widen it:** set a larger value, for example `86400`. Pennylane's retry schedule isn't documented and replays from Hookdeck can be older still, so a window never fully fits redeliveries.
- Anything that isn't a whole number is treated as `0` with a warning at startup.

The signature covers `t`, so an attacker can't refresh an old request's timestamp. Without a window, rely on the delivery `id` for idempotency; see webhook-handler-patterns.

## Common Gotchas

- **Raw body:** the signature covers the exact bytes. Do not parse and re-serialise JSON first (`express.raw({ type: '*/*' })`, `request.text()`, `await request.body()`). In Express, `type: '*/*'` makes verification independent of the `Content-Type`.
- **Secret as-is:** don't base64-decode the `secret` or strip a prefix.
- **Secret shown once:** Pennylane returns it only when the subscription is created.
- **Status codes:** reply 400 for a bad signature. Pennylane disables the subscription immediately on 401, 403, 404 and 410, and a disabled subscription stays off until you update it with `enabled: true`. A 400 is retried as a temporary failure, so fix the secret and the next retry passes.
- **Several `v1` values:** not documented by Pennylane; the examples accept the header if any one matches, which is harmless.
- **Respond quickly:** acknowledge with 2xx within a few seconds, then process asynchronously.

## How Do I Debug Verification Failures?

- Compare `PENNYLANE_WEBHOOK_SECRET` with the `secret` from the create response (no whitespace or quotes). If you lost it, create a new subscription.
- A body-parsing middleware ahead of your route (`express.json()`) re-serialises the body and breaks the signature.
- Behind a proxy that rewrites the body? Compute the HMAC over what Pennylane sent.
- If you set `PENNYLANE_TIMESTAMP_TOLERANCE_SECONDS`, an old `t` (a Hookdeck retry or replay) fails by design.
- Check `disabled_reason` and `last_failure_status` on the subscription (List / Get) to see whether Pennylane has stopped delivering.
