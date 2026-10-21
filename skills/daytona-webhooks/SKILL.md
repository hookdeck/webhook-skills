---
name: daytona-webhooks
description: >
  Receive and verify Daytona webhooks (sandbox infrastructure for AI code). Use
  when setting up Daytona webhook handlers, debugging Svix signature
  verification (svix-id, svix-timestamp, svix-signature, whsec_ secret), or
  handling events like sandbox.created, sandbox.state.updated, snapshot.created,
  snapshot.state.updated, snapshot.removed, volume.created and
  volume.state.updated.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Daytona Webhooks

[Daytona](https://www.daytona.io) runs sandboxes for AI-generated code. It sends webhooks when sandboxes, snapshots and volumes are created, change state, or are removed.

> **Where the signature scheme comes from:** Daytona's public [webhooks page](https://www.daytona.io/docs/en/webhooks) documents the events and payloads but **says nothing about signing or verification**. The scheme below is [Svix's](https://docs.svix.com/receiving/verifying-payloads/how-manual): Daytona's source shows deliveries go out through Svix, and the dashboard reads the Svix endpoint secret. Daytona does not document it, so confirm it against your own deliveries (see [references/verification.md](references/verification.md)).

## When to Use This Skill

- How do I receive Daytona webhooks?
- How do I verify a Daytona webhook signature (`svix-signature`)?
- How do I react when a sandbox changes state (`sandbox.state.updated`)?
- How do I handle `snapshot.created` or `volume.created` events?
- Why is my Daytona webhook signature verification failing?
- Why am I processing the same Daytona event twice?

## Verification (core)

| Header | Value |
|--------|-------|
| `svix-id` | Message ID. Same on every retry of the same message |
| `svix-timestamp` | Unix seconds when the attempt was sent |
| `svix-signature` | Space-delimited list of `v1,<base64>` signatures |

Signed content is `{svix-id}.{svix-timestamp}.{raw body}`, HMAC-SHA256, base64. The key is the base64-**decoded** part of the secret after `whsec_`. The official `svix` library (npm and PyPI) also enforces a 5-minute timestamp tolerance and compares in constant time.

```javascript
import { Webhook } from 'svix'; // svix 2.x is ESM-only

// rawBody: the exact bytes received (express.raw() / request.text()), NOT re-serialised JSON
function verifyDaytonaWebhook(rawBody, headers) {
  const secret = process.env.DAYTONA_WEBHOOK_SECRET; // whsec_...
  if (!secret) throw new Error('DAYTONA_WEBHOOK_SECRET not set'); // fail closed → 500
  new Webhook(secret).verify(rawBody, {
    'svix-id': headers['svix-id'],
    'svix-timestamp': headers['svix-timestamp'],
    'svix-signature': headers['svix-signature'],
  }); // throws WebhookVerificationError → 400
  return JSON.parse(rawBody.toString('utf8')); // svix 2.x verify() returns nothing
}
```

Python: `from svix.webhooks import Webhook`, then `Webhook(secret).verify(raw_body, headers)` followed by `json.loads(raw_body)`.

Manual verification (no SDK) is in [references/verification.md](references/verification.md).

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Payload Shape and Deduplication

Payloads are flat JSON. The discriminator is `event`, with an ISO 8601 `timestamp`:

```json
{ "event": "sandbox.state.updated", "timestamp": "2025-12-19T10:30:00.000Z",
  "id": "sandbox123", "organizationId": "org123",
  "oldState": "started", "newState": "stopped", "updatedAt": "2025-12-19T10:30:00.000Z" }
```

The payload has no event ID, so deduplicate on `svix-id`, which stays the same when Svix retries a message.

## Common Event Types

| Event | Fired when | Key fields |
|-------|------------|------------|
| `sandbox.created` | A new sandbox is created | `id`, `organizationId`, `state`, `sandboxClass`, `createdAt` |
| `sandbox.state.updated` | A sandbox's state changes | `id`, `organizationId`, `oldState`, `newState`, `updatedAt` |
| `snapshot.created` | A new snapshot is created | `id`, `name`, `organizationId`, `state`, `createdAt` |
| `snapshot.state.updated` | A snapshot's state changes | `id`, `name`, `organizationId`, `oldState`, `newState`, `updatedAt` |
| `snapshot.removed` | A snapshot is removed | `id`, `name`, `organizationId`, `removedAt` |
| `volume.created` | A new volume is created | `id`, `name`, `organizationId`, `state`, `createdAt` |
| `volume.state.updated` | A volume's state changes | `id`, `name`, `organizationId`, `oldState`, `newState`, `updatedAt` |

## Environment Variables

```bash
DAYTONA_WEBHOOK_SECRET=whsec_your_endpoint_secret   # Svix endpoint signing secret
```

## Local Development

```bash
npx hookdeck-cli listen 3000 daytona --path /webhooks/daytona
```

No account required. The CLI creates a guest account on first run and gives you a tunnel and a web UI for inspecting requests. Use port `8000` for the FastAPI example.

## Reference Materials

- [references/overview.md](references/overview.md) - What Daytona webhooks are, events and payloads
- [references/setup.md](references/setup.md) - Create an endpoint in the Daytona Dashboard and get the secret
- [references/verification.md](references/verification.md) - Svix verification details, manual fallback, gotchas

## Recommended: webhook-handler-patterns

Install the patterns skill alongside this one for production-ready handlers:

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md)
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md)
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md)

## Related Skills

- [svix-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/svix-webhooks) - Generic Svix signature verification for any Svix-delivered provider
- [agentmail-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/agentmail-webhooks) - Email inboxes for AI agents (Svix)
- [recall-ai-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/recall-ai-webhooks) - Meeting bot webhooks (Svix / Standard Webhooks)
- [crusoe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/crusoe-webhooks) - Cloud infrastructure notifications (Svix)
- [vanta-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/vanta-webhooks) - Compliance webhooks (Svix)
- [openmeter-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/openmeter-webhooks) - Usage metering notifications (Svix)
- [browserbase-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/browserbase-webhooks) - Headless browser infrastructure for AI agents
- [docker-hub-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/docker-hub-webhooks) - Container registry webhooks
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Production webhook infrastructure
