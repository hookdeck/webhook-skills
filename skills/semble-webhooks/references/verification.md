# How to Verify Semble Webhook Signatures

## How Does Semble Sign Webhooks?

Every request has two headers:

```
X-Webhook-Signature: t=1700000500,v1=4b9f...
X-Webhook-Timestamp: 1700000500
```

- `t`: Unix timestamp in seconds
- `v1`: lowercase hex HMAC-SHA256 (64 characters)
- Key: the subscription's `secret` from `createWebhook`, as a UTF-8 string
- Signed message: `"<t>.<raw request body>"`
- `X-Webhook-Timestamp` holds the same value as `t`. Use the `t` from `X-Webhook-Signature`; that is the value Hookdeck verifies.

Verify by splitting the header on `,`, trimming each part (a space may follow the comma), and splitting each on the first `=`. Take `t` and **every** `v1` and accept if any one matches. Semble's docs show a single `v1` and don't say it sends several during rotation, so this is only defensive. Reject a header with no `t` or no `v1`.

```javascript
const expected = crypto.createHmac('sha256', secret)
  .update(`${t}.`).update(rawBody).digest('hex');
```

## How Do I Compare Signatures Safely?

- **Node:** check that the received value is exactly 64 hex characters (`/^[0-9a-f]{64}$/i`) before comparing; `Buffer.from(x, 'hex')` silently truncates invalid hex. Then compare the lowercase hex strings as equal-length UTF-8 buffers with `crypto.timingSafeEqual` after a length check (it throws on a length mismatch).
- **Python:** use `hmac.compare_digest` on bytes (`.encode()` both sides). On `str` arguments it raises `TypeError` for non-ASCII input, which would turn a bad header into a 500.

## Where Does the Timestamp Window Go?

Semble's guide says you may reject requests whose `t` is more than 5 minutes old. The examples don't do this by default. **Hookdeck retries and replays resend the original request, including the original `t`**, so a 5-minute window rejects a legitimate late redelivery (for example after your receiver was down, or when you replay an event from the dashboard). Semble's own retries and its Webhook Logs requeue can also be late.

The check is opt-in: set `SEMBLE_TIMESTAMP_TOLERANCE_SECONDS` to a positive whole number of seconds. In each example it lives in one place:

| Example | Where |
|---------|-------|
| Express | `timestampToleranceSeconds()` and the `tolerance > 0` branch in `verifySemble` (`src/index.js`) |
| Next.js | the same two in `app/webhooks/semble/route.ts` |
| FastAPI | `timestamp_tolerance_seconds()` and the `tolerance > 0` branch in `verify_semble` (`main.py`) |

- **Drop it:** leave the variable unset or `0` (default). Delete the `tolerance > 0` branch if you want the code gone.
- **Widen it:** set a larger value, for example `86400` for one day. Replays from Hookdeck can be older still, so a window never fully fits replays.
- Anything that isn't a whole number is treated as `0` with a warning at startup.

The signature covers `t`, so an attacker can't refresh an old request's timestamp. Without a window, make processing idempotent instead: Semble documents `eventId` as unique per delivery attempt, so key on `eventType` plus the record IDs in `identifiers` (see webhook-handler-patterns).

## Common Gotchas

- **Raw body:** the signature covers the exact bytes. Do not parse and re-serialise JSON first (`express.raw({ type: '*/*' })`, `request.text()`, `await request.body()`). In Express, `type: '*/*'` makes verification independent of the `Content-Type`.
- **Secret as-is:** don't base64-decode the `secret` or strip a prefix.
- **Several `v1` values:** not documented by Semble; the examples accept any match rather than reading only the first, which costs nothing.
- **Status codes:** Semble's guide says to reject failures with 401 or 403; the examples return 400 for a bad signature. Semble's docs don't say which statuses are retried, so after fixing the secret requeue the message from the Webhook Logs page.
- **Subscription pause:** repeated delivery failures pause the subscription (`deliveryPaused: true`). Fix the endpoint, then set it back with `updateWebhook`.

## How Do I Debug Verification Failures?

- Compare `SEMBLE_WEBHOOK_SECRET` with the `secret` from the `createWebhook` response (no whitespace or quotes). If the secret is lost, create a new subscription.
- A body-parsing middleware ahead of your route (`express.json()`) re-serialises the body and breaks the signature.
- Behind a proxy that rewrites the body? Compute the HMAC over what Semble sent.
- If you set `SEMBLE_TIMESTAMP_TOLERANCE_SECONDS`, an old `t` (a retry or replay) fails by design.
- Requeue a message from the Webhook Logs page to get a fresh, correctly signed delivery.
