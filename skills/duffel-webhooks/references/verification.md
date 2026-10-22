# Duffel Webhook Signature Verification

## How Does Duffel Sign Webhooks?

Header: `X-Duffel-Signature: t=1616202842,v1=8aebaa7ecaf36950721e4321b6a56d7493d13e73814de672ac5ce4ddd7435054`

- Algorithm: HMAC-SHA256, output as **lowercase hex**
- Key: the webhook secret string's bytes, as-is. It looks base64 but is **not decoded**.
- Signed message: `"<t>.<raw request body>"` (`t` is Unix seconds)

```javascript
const expected = crypto.createHmac('sha256', secret)
  .update(`${t}.`).update(rawBody).digest('hex');
```

Parse the header by splitting on `,` and each part on the first `=`. Compare `v1` to the expected value in constant time. Guard against length mismatch (`timingSafeEqual` throws on different lengths).

## Replay Protection

The examples don't check the timestamp by default: retries and replays (including Hookdeck's) keep the original `t`, so a window would reject a late redelivery. To opt in, set `DUFFEL_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds (for example `300`). A value that isn't a whole number is treated as `0`, with a warning at startup. Otherwise rely on idempotency: dedupe on the payload's `idempotency_key`.

## Common Gotchas

- **Raw body:** sign the exact bytes (`express.raw({ type: '*/*' })`, `request.text()`, `await request.body()`). Re-serialised JSON fails.
- **Don't decode the secret.** Decoding `54vFWvaSbbzYpxXPeB4YEw==` gives the wrong key.
- **Separate secrets** for live and test webhooks.
- **Secret shown once:** if lost, create a new webhook.
- **Header order:** don't assume `t` comes first; parse by name.

## Debugging Verification Failures

- Confirm `DUFFEL_WEBHOOK_SECRET` matches the webhook that sent the event (test vs live).
- Check for whitespace or quotes around the secret in `.env`.
- Check that no body-parsing middleware runs before verification.
- A `Missing signature` result means the request did not come from Duffel (or a proxy stripped the header).
