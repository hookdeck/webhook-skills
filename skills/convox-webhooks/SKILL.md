---
name: convox-webhooks
description: >
  Receive and verify Convox webhooks (the PaaS that runs Racks on your own
  cloud). Use when setting up Convox webhook handlers, debugging
  Convox-Signature verification (t=, v1=, webhook_signing_key), or handling
  events like build:create, release:promote, app:budget:cap and
  app:budget:auto-shutdown:fired.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Convox Webhooks

[Convox](https://convox.com) runs Racks on your own cloud account. A Rack POSTs a JSON webhook when an app is created, a build or release changes state, a budget cap is crossed, an auto-shutdown countdown starts or ends, or a scale or trigger override changes.

> Signing is opt-in: set the webhook_signing_key rack parameter (Rack 3.24.6 or later) and paste the same value. Without it, deliveries are unsigned and fail verification.

Delivery is best-effort, fire-and-forget, and **never retried**, not even on a 5xx. Events can arrive out of order or twice. Respond quickly (the default dispatch timeout is 30 seconds) and treat the feed as a notification channel, not a queue.

## When to Use This Skill

- How do I receive Convox webhooks?
- How do I verify the `Convox-Signature` header?
- Why does my Convox webhook signature verification fail?
- How do I turn on webhook signing and rotate the `webhook_signing_key`?
- How do I handle `build:create`, `release:promote` or `app:budget:cap` events?
- Why am I seeing the same Convox event twice, or out of order?

## Verification (core)

| Part | Value |
|------|-------|
| Header | `Convox-Signature: t=<unix seconds>,v1=<hex>[,v1=<hex>...]` |
| Signed message | the `t` string exactly as it appears in the header, a literal `.`, then the raw body bytes |
| MAC | HMAC-SHA256, lowercase hex, key = the `webhook_signing_key` value as UTF-8 (**not** hex-decoded) |
| Rotation | one `v1=` per active key (up to 4): accept if **any** matches; ignore other keys such as `v0` |

```javascript
const crypto = require('crypto');

// rawBody: the exact bytes received (express.raw({ type: '*/*' }) / await request.arrayBuffer())
function verifyConvox(rawBody, header, secret) {
  let t = null;
  const sigs = [];
  for (const part of header.split(',')) {
    const i = part.indexOf('=');
    const key = part.slice(0, i).trim(), value = part.slice(i + 1).trim();
    if (i > 0 && key === 't' && t === null) t = value;
    else if (i > 0 && key === 'v1') sigs.push(value);
  }
  if (!t || !/^\d+$/.test(t)) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest();
  // Validate the format before decoding: Buffer.from(x, 'hex') silently drops bad characters
  return sigs.some((s) => /^[0-9a-fA-F]{64}$/.test(s) && crypto.timingSafeEqual(Buffer.from(s, 'hex'), expected));
}
```

Missing or empty header, malformed value, or no matching `v1`: respond `401`. Verify first, then parse the JSON.

**Timestamp window is opt-in.** Convox's own samples reject deliveries more than 5 minutes old, but Hookdeck retries and replays resend the original `t`, and Hookdeck applies no tolerance itself, so a fixed window rejects legitimate redeliveries. The examples skip the check by default. Set `CONVOX_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds (`t` is Unix seconds) to turn it on; unset or `0` means off. The signature has no nonce, so for replay protection dedupe on `data.tick_id` + `action`.

The Python version and more detail are in [references/verification.md](references/verification.md).

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Payload Shape

Every payload has `action`, `status`, `timestamp` and a `data` object. Dispatch on `action`:

```json
{
  "action": "app:budget:auto-shutdown:cancelled",
  "status": "success",
  "timestamp": "2026-04-27T10:30:00Z",
  "data": { "app": "myapp", "rack": "rack1", "actor": "alice@example.com",
            "tick_id": "tick-2026-04-27T10:30:00Z-3a7b4c2d8e9f4a6b8c4d3e2f1a0b9c8d",
            "cancel_reason": "reset-during-armed" }
}
```

`status` qualifies some events (`success` or `error` on `build:create`, `start` on `release:promote`, `skipped` on `release:prometheus-skipped`). The docs tell receivers to ignore unknown actions and unknown fields.

## Common Event Types

Convox documents 35 actions; the full list is in [references/overview.md](references/overview.md). The examples handle these and log the rest:

| Action | Fired when | Key fields |
|--------|------------|------------|
| `app:create` | `convox apps create` succeeds | `data.app`, `data.actor` |
| `build:create` | A build starts or fails (`status` is `error` on failure) | `data.app`, `data.message` |
| `release:promote` | A promote starts (`status: "start"`) | `data.app`, `status` |
| `app:budget:cap` | `monthlyCapUsd` is crossed | `data.app` |
| `app:budget:auto-shutdown:fired` | The countdown elapsed and services scaled to zero | `data.app`, `data.tick_id` |
| `app:budget:auto-shutdown:cancelled` | An armed countdown was cancelled | `data.cancel_reason`, `data.tick_id` |

## Environment Variables

```bash
CONVOX_WEBHOOK_SECRET=your_webhook_signing_key   # the webhook_signing_key Rack parameter, used as-is
CONVOX_WEBHOOK_TOLERANCE_SECONDS=0               # Optional replay window; a positive value opts in
```

## Local Development

```bash
npx hookdeck-cli listen 3000 convox --path /webhooks/convox
```

No account required. The CLI creates a guest account on first run and gives you a tunnel and a web UI for inspecting requests. Use port `8000` for the FastAPI example.

## Reference Materials

- [references/overview.md](references/overview.md) - What Convox webhooks are, all 35 actions, delivery semantics
- [references/setup.md](references/setup.md) - Set `webhook_signing_key`, add the receiver URL, rotate keys
- [references/verification.md](references/verification.md) - Signature details, Python version, gotchas

## Recommended: webhook-handler-patterns

Install the patterns skill alongside this one for production-ready handlers:

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md)
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md)
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md)

## Related Skills

- [duffel-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/duffel-webhooks) - Same `t=`/`v1=` hex HMAC-SHA256 shape over `{t}.{body}`
- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks) - `t=`/`v1=` signature header with a timestamp
- [render-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/render-webhooks) - Render deploy and service events
- [heroku-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/heroku-webhooks) - Heroku app, build and release events
- [railway-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/railway-webhooks) - Railway deployment events
- [northflank-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/northflank-webhooks) - Northflank platform events
- [vercel-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/vercel-webhooks) - Vercel deployment events
- [argo-cd-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/argo-cd-webhooks) - Kubernetes deployment notifications
- [circleci-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/circleci-webhooks) - CI/CD pipeline events
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Production webhook infrastructure
