---
name: confluence-webhooks
description: >
  Receive and verify Confluence Data Center webhooks. Use when setting up
  Confluence admin webhook handlers, debugging X-Hub-Signature verification, or
  handling events like page_created, page_updated, page_removed, blog_created,
  comment_created, and space_created. Does not cover Confluence Cloud.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Confluence Webhooks

> **Scope: Confluence Data Center (self-managed) admin webhooks only.** Confluence Cloud does not offer these; it uses app (Connect) webhooks authenticated with JWTs, which this skill does not cover.

## When to Use This Skill

- How do I receive Confluence Data Center webhooks?
- How do I verify the Confluence `X-Hub-Signature` header?
- How do I handle `page_created`, `page_updated`, or `comment_created` events?
- Why is my Confluence webhook signature verification failing?

## Verification (core)

When you set a **secret** on the webhook, Confluence signs each request with HMAC (default HMAC-SHA256, keyed on the secret) over the **raw request body** and puts the result in the `X-Hub-Signature` header. The Confluence page only says the header "contains the HMAC"; the `sha256=<hex>` value format is taken from the identically worded Bitbucket Data Center page. Accept the digest with or without the `sha256=` prefix.

```javascript
const crypto = require('crypto');

function verify(rawBody, signatureHeader, secret) {
  let sig = (signatureHeader || '').trim().toLowerCase();
  const eq = sig.indexOf('=');
  if (eq !== -1) {
    if (sig.slice(0, eq) !== 'sha256') return false; // only sha256 is documented
    sig = sig.slice(eq + 1);
  }
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false; // length mismatch
  }
}
```

Read the body as raw bytes before any JSON parsing. In Express use `express.raw({ type: '*/*' })` so every content type is verified against the exact bytes sent.

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Common Event Types

The event name is in the JSON body's `event` field. Payloads are mostly IDs (e.g. `{"timestamp":..., "event":"page_trashed", "userKey":"...", "page":{"id":309264476}}`); look details up via the REST API.

| Event | Triggered when |
|-------|----------------|
| `page_created` | A page is published for the first time |
| `page_updated` | A page is edited (when changes are published) |
| `page_removed` | A page is deleted (sent to the trash) |
| `page_trashed` | A page is purged from the trash |
| `blog_created` | A blog post is published |
| `comment_created` | A page, inline, or file comment is made |
| `space_created` | A new space is created |

See [references/overview.md](references/overview.md) for the full list.

## Important Headers

| Header | Description |
|--------|-------------|
| `X-Hub-Signature` | HMAC of the raw body, `sha256=<hex>` (only sent when a secret is set) |

`X-Event-Key` is not documented on the Confluence page, so read the event from the body; treat that header as an unverified fallback only.

## Environment Variables

```bash
CONFLUENCE_WEBHOOK_SECRET=your_webhook_secret   # The secret (up to 255 chars) you entered on the webhook
```

## Local Development

```bash
# Start tunnel (no account needed)
npx hookdeck-cli listen 3000 confluence --path /webhooks/confluence
```

## Reference Materials

- [references/overview.md](references/overview.md) - Webhook concepts, events, payload, circuit breaking
- [references/setup.md](references/setup.md) - Creating the webhook in the admin console
- [references/verification.md](references/verification.md) - Signature verification details and gotchas

## Recommended: webhook-handler-patterns

We recommend installing the [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) skill alongside this one for handler sequence, idempotency, error handling, and retry logic. Key references (open on GitHub):

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md) — Verify first, parse second, handle idempotently third
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md) — Prevent duplicate processing
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md) — Return codes, logging, dead letter queues
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md) — Provider retry schedules, backoff patterns

## Related Skills

- [bitbucket-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/bitbucket-webhooks) - Bitbucket webhooks (same `X-Hub-Signature: sha256=` scheme)
- [jira-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/jira-webhooks) - Jira webhook handling
- [github-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/github-webhooks) - GitHub repository webhook handling
- [gitlab-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/gitlab-webhooks) - GitLab repository webhook handling
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Handler sequence, idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Webhook infrastructure that replaces your queue — guaranteed delivery, automatic retries, replay, rate limiting, and observability for your webhook handlers
