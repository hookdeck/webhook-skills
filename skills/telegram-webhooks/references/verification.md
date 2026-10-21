# How to Verify Telegram Webhook Requests

## How It Works

Telegram bot webhooks are **not signed**. There is no HMAC, no timestamp, and no
Standard Webhooks headers. Verification is a shared secret sent as a header:

1. You call `setWebhook` with `secret_token` (1-256 characters, only `A-Z`, `a-z`,
   `0-9`, `_`, `-`).
2. Telegram sends that value, unchanged, in the `X-Telegram-Bot-Api-Secret-Token`
   header of every webhook request.
3. Your handler compares the header with the expected value using a constant-time
   comparison and rejects the request on mismatch.

From the Bot API docs: "The header is useful to ensure that the request comes from a
webhook set by you."

## Implementation

There is no official Telegram SDK for verification; the check is a few lines, so the
examples implement it directly. Bot frameworks also do it for you if you use them:
for example grammY (`webhookCallback(bot, 'express', { secretToken })`) and
python-telegram-bot (`application.run_webhook(..., secret_token=...)`).

### Node.js

```javascript
const crypto = require('crypto');

function verifyTelegramSecretToken(headerValue, expectedSecret) {
  if (!headerValue || !expectedSecret) return false;
  const received = Buffer.from(headerValue);
  const expected = Buffer.from(expectedSecret);
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// Express: Node lower-cases header names
const ok = verifyTelegramSecretToken(
  req.headers['x-telegram-bot-api-secret-token'],
  process.env.TELEGRAM_WEBHOOK_SECRET
);
if (!ok) return res.status(401).send('Unauthorized');
```

### Python

```python
import hmac

def verify_telegram_secret_token(header_value: str | None, expected: str | None) -> bool:
    if not header_value or not expected:
        return False
    # Compare bytes: compare_digest raises TypeError on non-ASCII str input
    return hmac.compare_digest(header_value.encode(), expected.encode())
```

## Optional: IP Allowlist

Telegram delivers webhooks from `149.154.160.0/20` and `91.108.4.0/22` (IPv4 only).
Restricting your firewall or reverse proxy to these ranges is reasonable defense in depth,
but keep the secret token check: ranges can change, and behind a load balancer or a
webhook gateway (such as Hookdeck) the source IP your app sees is not Telegram's.

## Common Gotchas

- **The header is missing.** Telegram only sends it if `secret_token` was passed to the
  latest `setWebhook` call. Calling `setWebhook` again without it removes the token.
- **Invalid characters.** `setWebhook` rejects tokens with characters other than
  `A-Z a-z 0-9 _ -`. Don't use the bot token (it contains `:`).
- **Comparing with `===` / `==`.** Use `crypto.timingSafeEqual` or `hmac.compare_digest`.
  `timingSafeEqual` throws on different lengths, so check lengths first.
- **Failing open.** If `TELEGRAM_WEBHOOK_SECRET` is unset, reject every request instead
  of skipping the check.
- **Raw body.** Nothing is computed over the body, so parsing JSON first doesn't break
  verification. Still verify the header *before* parsing or acting on the payload.
- **No replay protection.** There's no timestamp. Deduplicate on `update_id`: retries
  of the same update carry the same `update_id`.
- **Non-2XX responses cause retries.** A 401 from a misconfigured secret makes Telegram
  retry and queue updates (visible in `getWebhookInfo`). Fix the secret rather than
  returning 200 on failure.

## Debugging Verification Failures

1. Run `getWebhookInfo` and read `last_error_message`.
2. Log whether the `x-telegram-bot-api-secret-token` header is present (never log its value).
3. Re-run `setWebhook` with the same `secret_token` your server reads from the environment.
4. Check for trailing whitespace or newlines in `.env` values.
5. If a proxy sits in front of your app, make sure it forwards the header.
