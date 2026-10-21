# Buildkite Webhook Verification

## How Does Buildkite Authenticate Webhooks?

Every request has either `X-Buildkite-Token` or `X-Buildkite-Signature`, according to the setting on the webhook.

### Token mode (default)

`X-Buildkite-Token` contains the webhook token in clear text. Verify it by comparing it to your stored token in constant time.

```javascript
const a = Buffer.from(req.headers['x-buildkite-token'] || '');
const b = Buffer.from(process.env.BUILDKITE_WEBHOOK_TOKEN);
const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
```

### Signature mode

`X-Buildkite-Signature: timestamp=1619071700,signature=<hex>`

- Algorithm: HMAC-SHA256, output as lowercase hex
- Key: the webhook token
- Signed message: `"<timestamp>.<raw request body>"`
- `timestamp` is a UTC Unix timestamp of when the request was **dispatched**, not when the event occurred. Use payload timestamps (`build.finished_at`) for event times.

```javascript
const expected = crypto.createHmac('sha256', token)
  .update(`${timestamp}.`).update(rawBody).digest('hex');
```

Parse the header by splitting on `,` and then splitting each part on the first `=`.

## Replay Protection

Buildkite recommends checking the timestamp after verifying the signature and accepting it only within a short window (e.g. 5 minutes). The examples enforce 300 seconds for signature mode (`TIMESTAMP_TOLERANCE_SECONDS`). Token mode has no timestamp, so use idempotency (see webhook-handler-patterns) to absorb replays.

## Common Gotchas

- **Raw body:** the signature covers the exact bytes. Do not parse JSON before verifying (`express.raw`, `request.text()`, `await request.body()`).
- **Don't fall back:** if `X-Buildkite-Signature` is present, do not accept a matching token instead.
- **Header names are case-insensitive**; Node lowercases them.
- **Retries and the window:** if your receiver is down and Buildkite retries later, a strict window can reject a legitimate delivery. Pick a window to suit your availability.

## Debugging Verification Failures

- Check which mode is configured: only one header is sent.
- Confirm `BUILDKITE_WEBHOOK_TOKEN` equals the **Token** field exactly (no whitespace, no quotes).
- Behind a proxy or body-parsing middleware that re-serialises JSON? Signature mode will fail.
- Use **Load recent requests** in Buildkite to see the response code you returned.
