---
name: gitbook-webhooks
description: >
  Receive and verify GitBook webhooks. Use when configuring GitBook webhook
  endpoints, debugging x-gitbook-signature signatures, or handling space_content_updated, page_feedback, site_view.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# GitBook Webhooks

Receive GitBook content updates, page feedback and site views.

## When to Use This Skill

- Configure a receiver for GitBook webhook deliveries.
- Diagnose `x-gitbook-signature` verification failures.
- Handle `space_content_updated`, `page_feedback`, `site_view`.

## Setup

Install the Webhook integration in your GitBook organisation, configure its endpoint URL, and select events for the space or site. Configure the matching signing secret in your receiver. The guide does not specify where this secret is shown; confirm it in your installation or with GitBook.

Set `GITBOOK_WEBHOOK_SECRET` in the server environment. Read [setup](references/setup.md) before enabling delivery.

## Verification (core)

`x-gitbook-signature` contains `t=<Unix seconds>,v1=<hex>` over `timestamp + "." + raw body`. Use HMAC-SHA256 with the secret's UTF-8 bytes. Verify the original bytes before parsing JSON. Validate the digest format, then compare equal-length buffers in constant time.

After extracting the documented digest and constructing `message` as described in [verification](references/verification.md), the comparison is:

```javascript
const expected = crypto.createHmac('sha256', secret).update(message).digest();
if (digest.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(digest)) return false;
const received = Buffer.from(digest, 'hex');
return received.length === expected.length && crypto.timingSafeEqual(received, expected);
```

Set `GITBOOK_WEBHOOK_TOLERANCE_SECONDS` to a positive number to enforce an application age limit in seconds. Unset or `0` disables it. Old timestamps remain valid by default so Hookdeck retries and replays can retain the original headers.

Complete handlers and tests: [Express](examples/express/), [Next.js](examples/nextjs/), [FastAPI](examples/fastapi/).

## Event Handling

Dispatch on type: space_content_updated is a space event; page_feedback and site_view are site events. The envelope includes eventId and installationId.

Return a successful HTTP response promptly. Keep processing idempotent using eventId, and accommodate retries.

## Local Development

```bash
npx hookdeck-cli listen 3000 gitbook --path /webhooks/gitbook
```

Use port 8000 for FastAPI. The CLI provides a local tunnel and inspection UI; no account is required to start.

## Resources

- [Overview and event routing](references/overview.md)
- [Endpoint and secret setup](references/setup.md)
- [Verification and troubleshooting](references/verification.md)

## Recommended: webhook-handler-patterns

Use the patterns skill for [handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md), [idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md), [error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md) and [retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md).

## Related Skills

- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks): another HMAC receiver.
- [github-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/github-webhooks): another HMAC receiver.
- [shopify-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/shopify-webhooks): another HMAC receiver.
- [preczn-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/preczn-webhooks): another HMAC receiver.
- [dub-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/dub-webhooks): another HMAC receiver.
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns): delivery and processing patterns.
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway): managed delivery and inspection.
