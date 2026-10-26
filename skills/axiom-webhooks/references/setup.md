# Setting Up Axiom Webhooks

> Use the Custom webhook notifier with a secret header. The plain Webhook notifier cannot send one.

## Prerequisites

- An Axiom account with a monitor
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 axiom --path /webhooks/axiom` locally)

## Choose a Secret Header

Pick a header name and a secret value, for example `Authorization: Bearer <random-token>`. Axiom
does not generate one for you. Store them as:

```bash
AXIOM_WEBHOOK_HEADER=Authorization
AXIOM_WEBHOOK_SECRET="Bearer <random-token>"   # the exact, whole header value
```

The value is compared whole, so include the `Bearer ` prefix here if you type it in the notifier.

## Create the Notifier

1. Open the **Monitors** tab and click **Manage notifiers**.
2. Click **New notifier** and name it.
3. Click **Custom webhook** (not the plain Webhook notifier).
4. Enter your URL in **Webhook URL**, e.g. `https://example.com/webhooks/axiom`.
5. Optional: edit the body with Go template syntax (see [overview.md](overview.md)). The default
   template sends `action` (`Open` or `Closed`) and monitor data under `event`.
6. Add the header from above. Where Axiom offers secret headers (`secretHeaders`), use that so the
   value is hidden after saving; otherwise use `headers`.
7. Click **Create**, then attach the notifier to a monitor.

## Test

Trigger the monitor, or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/axiom \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <random-token>" \
  -d '{"action":"Open","event":{"monitorID":"CabI3w142069etTgd0","title":"Axiom Monitor Test Triggered","body":"Current value of 57347 is above or equal to the threshold value of 0","value":57347}}'
```

## Network Notes

Axiom documents no source IP list for webhooks, so an allowlist is not an option. Use the secret
header over HTTPS.
