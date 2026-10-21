# OpenClaw Token Verification

## How It Works

OpenClaw doesn't sign webhook bodies. Automation (cron) webhooks carry a shared token in the `Authorization` header. From [Manage automations](https://docs.openclaw.ai/automation/cron-jobs/managing-jobs):

> `webhookToken` is sent as `Authorization: Bearer <token>` on automation webhook POSTs.
> Webhook URLs must not include embedded username/password credentials; use
> `webhookToken` when the receiver supports bearer authentication.

Your receiver compares the **whole** header value with `Bearer <webhookToken>` using a constant-time comparison. Hookdeck's OpenClaw source does the same: its API key field takes the full value, `Bearer <webhookToken>`.

One `cron.webhookToken` covers every automation webhook on the Gateway, including failure-alert webhooks. OpenClaw sends no `Authorization` header at all when the token isn't set, so set it and reject requests without the header.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyOpenClawWebhook(authorizationHeader, webhookToken) {
  if (!authorizationHeader || !webhookToken) return false;
  const received = Buffer.from(authorizationHeader, 'utf8');
  const expected = Buffer.from(`Bearer ${webhookToken}`, 'utf8');
  // timingSafeEqual throws on different lengths, so check length first
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// Usage in Express: raw body, verify, then parse
app.post('/webhooks/openclaw', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyOpenClawWebhook(req.get('authorization'), process.env.OPENCLAW_WEBHOOK_TOKEN)) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  const event = JSON.parse(req.body.toString('utf8'));
  // Process event...
  res.status(200).json({ received: true });
});
```

### Python

```python
import hmac

def verify_openclaw_webhook(authorization_header: str | None, webhook_token: str) -> bool:
    """Compare the whole Authorization value with "Bearer <webhookToken>"."""
    if not authorization_header or not webhook_token:
        return False
    return hmac.compare_digest(authorization_header.encode(), f"Bearer {webhook_token}".encode())
```

## Why Timing-Safe Comparison?

A plain `===` or `==` returns as soon as a character differs, so response times can leak how much of a guessed token is right. `crypto.timingSafeEqual` and `hmac.compare_digest` take the same time regardless.

```javascript
// WRONG: vulnerable to timing attacks
if (req.headers.authorization === `Bearer ${token}`) { ... }

// CORRECT: constant time
crypto.timingSafeEqual(received, expected) // after a length check
```

## Common Gotchas

### 1. Compare the Whole Value, Including "Bearer "

Build the expected value as `Bearer <webhookToken>` and compare it with the header as received. Don't parse the scheme loosely: `bearer <token>` or a double space won't match, which mirrors how Hookdeck's OpenClaw source behaves.

### 2. Use `cron.webhookToken`, Not `hooks.token`

`cron.webhookToken` authenticates webhooks OpenClaw **sends**. `hooks.token` authenticates requests OpenClaw **receives** on `/hooks/*`. Use dedicated, different values for each, and never the Gateway auth token.

### 3. Don't Put Credentials in the URL

OpenClaw rejects webhook URLs with embedded `user:password@`. Use `webhookToken` instead.

### 4. Verify Before Parsing

The body isn't signed, so a raw body isn't strictly needed for the check. The examples still use `express.raw({ type: '*/*' })` so the token check runs first, whatever the `Content-Type`, and parse JSON only after it passes.

### 5. Buffer Length Mismatch

`timingSafeEqual` throws if the buffers differ in length. Check lengths first (or catch) and return `false`.

## Calling OpenClaw's Inbound Hooks

When your service sends events **to** a Gateway (`/hooks/agent`, `/hooks/wake`), the Gateway verifies, not you. From [Inbound webhooks](https://docs.openclaw.ai/automation/cron-jobs/webhooks), every request must include the hook token via `Authorization: Bearer <token>` (recommended) or `x-openclaw-token: <token>`; query-string `?token=...` is rejected. A `401` means the hook token is wrong or a proxy dropped the header. Repeated failures are throttled with `429` and `Retry-After`.

## Debugging Verification Failures

```javascript
app.post('/webhooks/openclaw', express.raw({ type: '*/*' }), (req, res) => {
  const header = req.get('authorization');
  // Never log the token itself
  console.log('Authorization present:', Boolean(header));
  console.log('Starts with "Bearer ":', header?.startsWith('Bearer '));
  console.log('Received length:', header?.length);
  console.log('Expected length:', `Bearer ${process.env.OPENCLAW_WEBHOOK_TOKEN}`.length);
});
```

If the header is missing entirely, `cron.webhookToken` isn't set on the Gateway.

## Full Documentation

- [Manage automations (webhook output, webhookToken)](https://docs.openclaw.ai/automation/cron-jobs/managing-jobs)
- [Delivery modes](https://docs.openclaw.ai/automation/cron-jobs/delivery)
- [Inbound webhooks](https://docs.openclaw.ai/automation/cron-jobs/webhooks)
