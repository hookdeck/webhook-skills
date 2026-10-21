---
name: stytch-webhooks
description: >
  Receive and verify Stytch webhooks (delivered by Svix). Use when setting up
  Stytch webhook handlers, debugging svix-signature verification, or handling
  auth events like direct.user.create, direct.member.update, or
  direct.organization.create.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Stytch Webhooks

## When to Use This Skill

- How do I receive Stytch webhooks?
- How do I verify Stytch webhook signatures (`svix-signature`)?
- How do I handle `direct.user.create` or `direct.member.update` events?
- Why is my Stytch webhook signature verification failing?
- How do I keep my database in sync with Stytch users, members, and organizations?

## Resources

- `references/overview.md` - What Stytch webhooks are, event type structure, payload fields
- `references/setup.md` - Create an endpoint in the Stytch Dashboard and get the signing secret
- `references/verification.md` - Svix signature verification details and gotchas
- `examples/` - Runnable Express, Next.js, and FastAPI examples

## Verification (core)

Stytch webhooks are delivered by [Svix](https://docs.svix.com/receiving/verifying-payloads/how-manual). Each request carries `svix-id`, `svix-timestamp`, and `svix-signature` (a space-delimited list of `v1,<base64>` entries). The signed content is `{svix-id}.{svix-timestamp}.{raw body}`, HMAC-SHA256, keyed with the **base64-decoded** part of the `whsec_` signing secret.

```javascript
import { Webhook } from 'svix';

// rawBody must be the exact bytes received (string or Buffer), not parsed JSON
new Webhook(process.env.STYTCH_WEBHOOK_SECRET).verify(rawBody, {
  'svix-id': req.headers['svix-id'],
  'svix-timestamp': req.headers['svix-timestamp'],
  'svix-signature': req.headers['svix-signature'],
}); // throws on a bad signature or a timestamp outside the 5-minute window
```

Manual fallback (no SDK):

```python
signed = f"{svix_id}.{svix_timestamp}.".encode() + raw_body
key = base64.b64decode(secret.removeprefix("whsec_"))
expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
valid = any(hmac.compare_digest(expected, s.split(",", 1)[1])
            for s in svix_signature.split() if s.startswith("v1,"))
```

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Event Types

Stytch event types are `source.object_type.action`. The body carries `source` (`DIRECT`, `DASHBOARD`, `SCIM`), `object_type` (e.g. `member`), and `action` (`CREATE`, `UPDATE`, `DELETE`), but no combined `type` field, so build it: `` `${source}.${object_type}.${action}`.toLowerCase() ``.

| Event | Triggered When |
|-------|----------------|
| `direct.user.create` | A user is created via API/SDK (Consumer projects) |
| `direct.user.update` | A user is updated via API/SDK (Consumer projects) |
| `direct.organization.create` | An Organization is created via API/SDK (B2B projects) |
| `direct.member.update` | A Member is updated via API/SDK (B2B projects) |
| `direct.saml_connection.delete` | A SAML connection is deleted via API/SDK (B2B projects) |
| `dashboard.organization.create` | An Organization is created in the Stytch Dashboard |
| `scim.member.update` | A Member is updated through SCIM |

CREATE and UPDATE events include the full entity under a key named after `object_type` (e.g. `member`); DELETE events carry only `id`. For the complete catalog, see the Webhooks page of the Stytch Dashboard and [Stytch's webhook docs](https://stytch.com/docs/workspace-management/webhooks).

## Environment Variables

```bash
STYTCH_WEBHOOK_SECRET=whsec_xxxxx   # Dashboard > Webhooks > your endpoint > Signing secret
```

## Local Development

```bash
npx hookdeck-cli listen 3000 stytch --path /webhooks/stytch
```

No account required. Use the tunnel URL as the endpoint URL in the Stytch Dashboard.

## Gotchas

- Use the **raw body** for verification; parsing JSON first changes the bytes and breaks the signature.
- Webhooks have no ordering guarantee. Treat them as a signal and re-fetch the entity from the Stytch API before overwriting your data.
- `svix-id` is the same on every retry of a message; use it to deduplicate.
- Svix disables an endpoint after 5 days of continuous failures; re-enable it in the Dashboard.

## Recommended: webhook-handler-patterns

We recommend installing the [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) skill alongside this one for handler sequence, idempotency, error handling, and retry logic. Key references (open on GitHub):

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md) — Verify first, parse second, handle idempotently third
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md) — Prevent duplicate processing
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md) — Return codes, logging, dead letter queues
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md) — Provider retry schedules, backoff patterns

## Related Skills

- [clerk-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/clerk-webhooks) - Clerk auth webhooks (Svix-style signatures)
- [svix-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/svix-webhooks) - Generic Svix signature verification
- [vanta-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/vanta-webhooks) - Vanta compliance webhooks via Svix
- [sendoso-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/sendoso-webhooks) - Sendoso webhooks via Svix
- [resend-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/resend-webhooks) - Resend email webhooks via Svix
- [stitch-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stitch-webhooks) - Stitch webhooks via Svix
- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks) - Stripe payment webhook handling
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Handler sequence, idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Webhook infrastructure that replaces your queue — guaranteed delivery, automatic retries, replay, rate limiting, and observability for your webhook handlers
