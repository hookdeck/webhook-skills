---
name: rubrik-webhooks
description: >
  Receive and authenticate Rubrik Security Cloud (RSC) webhooks. Use when setting up
  Rubrik webhook handlers, authenticating Rubrik webhooks with a custom header, Bearer
  token or Basic auth (Rubrik webhooks are NOT signed — no HMAC, no signature header),
  parsing the default PagerDuty Common Event Format (PD-CEF) payload or a custom JSON
  template, or handling backup Failure/Success, Anomaly (ransomware) and audit events.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Rubrik Webhooks

## When to Use This Skill

- How do I receive Rubrik Security Cloud webhooks?
- How do I verify / authenticate Rubrik webhooks? (there is no signature to verify)
- How do I handle Rubrik backup failure and backup success events?
- How do I parse the Rubrik PD-CEF payload (`summary`, `class`, `custom_details`)?
- How do I alert on Rubrik Anomaly (ransomware) events?
- Why did Rubrik auto-disable my webhook?

## Critical: Rubrik Webhooks Are Not Signed

There is **no HMAC, no signature header and no signing secret**. Any code that runs
`createHmac` / `hmac.new` over a Rubrik webhook body is wrong. Instead, each webhook carries a
credential chosen with `authInfo.authType` (`AuthenticationTypeV2`):

| `authType` | What Rubrik sends | Use it? |
|------------|-------------------|---------|
| `CUSTOM_HEADER` | `<headerKey>: <headerValue>` (you choose both) | **Recommended** |
| `BEARER` | `Authorization: Bearer <token>` | Yes |
| `BASIC` | `Authorization: Basic base64(username:password)` | Yes |
| `OAUTH2` | Bearer token Rubrik mints from your IdP (client credentials) | Needs JWT validation; not covered |
| `URL` | Token embedded in the webhook URL | Avoid: URLs end up in logs |

Your handler must **fail closed**: if no credential is configured, reject every request.

## Authentication (core)

Compare the configured header against your secret in constant time. Hashing both sides first
means `timingSafeEqual` never throws on a length mismatch:

```javascript
const crypto = require('crypto');

const secureEquals = (a, b) => crypto.timingSafeEqual(
  crypto.createHash('sha256').update(String(a), 'utf8').digest(),
  crypto.createHash('sha256').update(String(b), 'utf8').digest()
);

// CUSTOM_HEADER: header name and value are whatever you set in Rubrik.
function verifyRubrikHeader(headers) {
  const name = (process.env.RUBRIK_WEBHOOK_HEADER_NAME || 'X-Rubrik-Webhook-Token').toLowerCase();
  const secret = process.env.RUBRIK_WEBHOOK_SECRET;
  const value = headers[name]; // Node lowercases incoming header names
  if (!secret || typeof value !== 'string') return false; // fail closed
  return secureEquals(value, secret);
}
// BEARER: same compare on the value after "Bearer " in the Authorization header.
```

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

The examples accept `CUSTOM_HEADER`, `BEARER` and `BASIC` (whichever you configure) and return
`401` otherwise. There is no Rubrik SDK helper for receiving webhooks: the Rubrik SDKs
(PowerShell, Python, Go) call the RSC GraphQL API and don't authenticate incoming requests. See
[references/verification.md](references/verification.md).

## Payload: PD-CEF by Default, Templated Otherwise

The default payload is **PagerDuty Common Event Format (PD-CEF)**. The event details sit under
`custom_details`:

```json
{
  "summary": "Failed backup of vSphere VM 'sh1-EncryptMe-05-Group1'.",
  "source": "Rubrik Security Cloud",
  "severity": "critical",
  "timestamp": "2024-07-18T06:39:40.46Z",
  "class": "Backup",
  "custom_details": {
    "id": "c2b47274-6323-4025-b307-afed1cfb7574",
    "type": "Event",
    "objectName": "sh1-EncryptMe-05-Group1",
    "objectType": "VmwareVm",
    "status": "Failure",
    "eventName": "Snapshot.BackupFailed",
    "clusterName": "sh1-PaloAlto"
  }
}
```

Custom JSON templates (Go-template variables such as `{{.Status}}`, `{{.ObjectName}}`,
`{{.UUID}}`) can produce **any** shape, so the examples read `custom_details` when present and
fall back to top-level fields.

## Common Event Types

There is no single `event.type` string. Route on `class` and `status`:

| Field | Values (from Rubrik's docs) | Use |
|-------|----------------------------|-----|
| `custom_details.status` | `Failure`, `Success`, `PARTIAL_SUCCESS`, `Warning`, `Canceled`, `Canceling`, `Running`, `Queued`, `Info`, `TaskFailure`, `TaskSuccess` | Main dispatch: backup failed vs succeeded |
| `class` | `Backup`, `Anomaly`, `Recovery`, `Archive`, `Replication`, `Index`, `Classification`, ... | Which kind of activity |
| `custom_details.type` | `Event` (audit webhooks carry audit fields instead) | Event vs audit |
| `severity` | e.g. `critical` (Rubrik severities: Critical, Warning, Info) | Paging thresholds |
| `custom_details.eventName` | e.g. `Snapshot.BackupFailed` | Fine-grained, treat as opaque |

Subscriptions filter on `EventType` enum values (`BACKUP`, `ANOMALY`, `RECOVERY`, ...) and
`EventSeverity` (`SEVERITY_CRITICAL`, `SEVERITY_WARNING`, `SEVERITY_INFO`). Full list in
[references/overview.md](references/overview.md).

## Environment Variables

```bash
# CUSTOM_HEADER (recommended) — the header key/value you entered in Rubrik
RUBRIK_WEBHOOK_HEADER_NAME=X-Rubrik-Webhook-Token
RUBRIK_WEBHOOK_SECRET=a-long-random-string

# BEARER — optional
RUBRIK_WEBHOOK_BEARER_TOKEN=

# BASIC — optional
RUBRIK_WEBHOOK_USERNAME=
RUBRIK_WEBHOOK_PASSWORD=
```

## Delivery and Retries

- Rubrik retries **3 times** (backoff 1s, 5s, 10s), then removes the event from the queue.
- The webhook is **auto-disabled after 25 consecutive failures** (status `AUTO_DISABLED`).
- So: authenticate, enqueue, return `200` quickly. Deduplicate on `custom_details.id`.

## Local Development

For local webhook testing, run the Hookdeck CLI via `npx` — no install required:

```bash
npx hookdeck-cli listen 3000 rubrik --path /webhooks/rubrik
```

No account required — the CLI creates a guest account on first run and provides a local tunnel
plus a web UI for inspecting requests. Because Rubrik drops events after 3 quick retries,
putting Hookdeck in front of your endpoint also gives you a durable queue and replay.

## Resources

- [overview.md](references/overview.md) - PD-CEF payload, template variables, status/class values, audit events
- [setup.md](references/setup.md) - Create the webhook in the RSC console or via `createWebhookV2`
- [verification.md](references/verification.md) - Custom header, Bearer and Basic auth, gotchas, debugging
- [examples/express/](examples/express/) - Express handler with tests
- [examples/nextjs/](examples/nextjs/) - Next.js App Router handler with tests
- [examples/fastapi/](examples/fastapi/) - FastAPI handler with tests

## Recommended: webhook-handler-patterns

For production-ready webhook handling, also install the webhook-handler-patterns skill:

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md) - Webhook processing flow
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md) - Prevent duplicate processing
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md) - Graceful error recovery
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md) - Handle transient failures

## Related Skills

- [pagerduty-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/pagerduty-webhooks) - PagerDuty incident webhooks (Rubrik's default payload uses PagerDuty's event format)
- [grafana-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/grafana-webhooks) - Grafana alerting webhooks
- [sentry-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/sentry-webhooks) - Sentry error and issue webhooks
- [okta-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/okta-webhooks) - Okta event hooks (shared-secret header auth)
- [azure-event-grid-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/azure-event-grid-webhooks) - Azure Event Grid events
- [sparkpost-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/sparkpost-webhooks) - Another unsigned provider authenticated with Basic/Bearer
- [github-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/github-webhooks) - GitHub repository webhooks with HMAC-SHA256
- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks) - Stripe payment webhooks with signature verification
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Production webhook infrastructure
