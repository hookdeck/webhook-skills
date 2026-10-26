# How to Authenticate Streak Webhooks

## How Does Streak Authenticate Webhooks?

Streak does **not** sign webhook payloads: there is no HMAC, signature header or timestamp. The
only credential is the optional `token` you pass to `POST /api/v2/webhooks`, which Streak sends
as plain text in the `X-Streak-Webhook-Token` header on every request.

> **Webhooks created without a token send nothing to verify.** Set a token when you create the
> webhook through the Streak API.

## What Does This Protect Against?

A static shared credential authenticates the **sender**, not the **body**. It gives no replay
protection (no signature, no timestamp): anyone who captures a request, or the token, can send
or resend arbitrary bodies. So:

- Serve the endpoint over HTTPS only.
- Rotate the token if it leaks: send a new `token` to `POST /webhooks/{webhookKey}` (its schema
  lists `token`, though its prose says only `event` and `targetUrl` are applied, so confirm with a
  delivery), or create new webhooks with a new token and delete the old ones.
- Make handlers idempotent; Streak retries on non-200 responses.

## How to Verify

Compare the **whole** header value (name is case-insensitive) with your stored token in constant
time. Missing header or mismatch: `401`.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb); // equal-length digests: never throws
}

function verifyStreakRequest(headers, token = process.env.STREAK_WEBHOOK_TOKEN) {
  if (!token) return false;
  const received = headers['x-streak-webhook-token'];
  return Boolean(received) && safeEqual(received, token);
}
```

Alternatively check the lengths first and call `crypto.timingSafeEqual` on equal-length
`Buffer`s; calling it on buffers of different length throws.

### Python

```python
import hmac

def verify_streak_request(headers, token):
    received = headers.get("x-streak-webhook-token")
    if not token or not received:
        return False
    # Encode both sides to bytes: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), token.encode("utf-8"))
```

## Common Gotchas

- **No token, nothing to verify.** Check existing webhooks; if one was created without a token,
  set one with `POST /webhooks/{webhookKey}` (confirm it arrives) or recreate the webhook with one.
- **Read the raw body.** Use `express.raw({ type: '*/*' })` (or `request.text()` / `request.body()`)
  so any content type works, and parse only after the credential check.
- **Compare the whole value.** No prefix such as `Bearer`; the header is the token verbatim.
- **Never accept when unconfigured.** An empty `STREAK_WEBHOOK_TOKEN` must reject everything.
- **Don't return 410 by accident.** `410 Gone` deletes the webhook. Use `401` for a bad token.
- **Failures are retried.** Any non-200 response is retried with backoff, including your `401`s.
- **The body doesn't name the event.** Use one URL or `?event=` value per webhook.

## Debugging 401s

1. Log whether the `X-Streak-Webhook-Token` header is present at all. If it never is, the webhook
   was created without a `token`.
2. Confirm `STREAK_WEBHOOK_TOKEN` is loaded and equals the `token` from creation exactly (no
   trailing newline or quotes).
3. Check that a proxy or gateway isn't stripping custom headers.
4. If you changed `STREAK_WEBHOOK_TOKEN`, make sure the webhook was created with the new value.
