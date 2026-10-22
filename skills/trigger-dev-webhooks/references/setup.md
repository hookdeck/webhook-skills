# Setting Up Trigger.dev Webhooks

## Prerequisites

- A Trigger.dev project (Trigger.dev Cloud, or a self-hosted instance)
- Your application's public webhook endpoint URL (use `npx hookdeck-cli listen` for local development)

## Create the Webhook Alert and Get Your Secret

1. Open your project in the Trigger.dev dashboard and go to the **Alerts** page.
2. Create a new alert channel and choose the **webhook** type.
3. Enter your endpoint URL, e.g. `https://example.com/webhooks/trigger-dev`.
4. Choose which alerts it receives: failed runs, deployment success, deployment failure, and error group alerts.
5. Copy the webhook secret. It is shown on the Alerts page when you create the webhook alert. Store it as `TRIGGER_DEV_WEBHOOK_SECRET`.

Menu labels may change; the Trigger.dev [alerts docs](https://trigger.dev/docs/troubleshooting-alerts) are the source of truth.

## Authentication

The only authentication is the HMAC signature in the `x-trigger-signature-hmacsha256` header. There is no API key, basic auth or IP allowlist to configure. Always verify the signature on the raw body.

## Local Development

```bash
npx hookdeck-cli listen 3000 trigger-dev --path /webhooks/trigger-dev
```

Use the URL the CLI prints as the webhook URL of your alert channel (FastAPI examples listen on port 8000).

## Environments

Alerts are tied to a project and its environments (`PRODUCTION`, `STAGING`, `PREVIEW`). The `object.environment.type` field in the payload tells you which one fired, so you can route or filter by it in your handler.
