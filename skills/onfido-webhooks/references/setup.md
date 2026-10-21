# Setting Up Onfido Webhooks

## Prerequisites

- An Onfido (Entrust Identity Verification) account with Dashboard access
- A public **HTTPS** endpoint (e.g. `https://api.example.com/webhooks/onfido`); use `npx hookdeck-cli listen 3000 onfido --path /webhooks/onfido` for local development

## Register Your Endpoint

You can register a webhook in the Dashboard ("Webhook Management" page) or via the API:

```http
POST /v3.6/webhooks/ HTTP/1.1
Host: api.eu.onfido.com
Authorization: Token token=<YOUR_API_TOKEN>
Content-Type: application/json

{
  "url": "https://yourdomain.com/webhooks/onfido",
  "name": "my webhook",
  "enabled": true,
  "environments": ["sandbox"],
  "events": ["workflow_run.completed", "workflow_task.completed"]
}
```

- `url` is required and must be HTTPS.
- `events` is optional; if omitted the webhook is subscribed to **all** events.
- `environments` accepts `sandbox` and/or `live`. Sandbox API tokens can't manage live webhooks.

Recommended events: `check.completed`, `report.completed` (Checks and Reports API) or `workflow_run.completed` (Workflow Studio).

## Get Your Webhook Token

Each webhook has a single secret `token`, returned in the `token` field of the registration response and shown on the Dashboard "Webhook Management" page. You only need to register a webhook once.

Store it as `ONFIDO_WEBHOOK_TOKEN`. Never commit it. Sandbox and live webhooks have different tokens.

## Test Mode vs Live Mode

- Create separate webhooks (and keep separate tokens) for `sandbox` and `live`.
- Review delivery attempts in the Dashboard webhook logs.
- If a webhook was disabled by the circuit breaker (5 consecutive failures), fix the endpoint and re-enable it.
- The "resend" endpoint (`POST /v3.6/webhooks/resend`) can replay events.
