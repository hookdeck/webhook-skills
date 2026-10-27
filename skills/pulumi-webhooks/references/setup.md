# Setting Up Pulumi Webhooks

## Prerequisites

- A Pulumi Cloud organization (or a stack) you can add webhooks to
- A public `https://` endpoint (use the Hookdeck CLI for local development)

## Set a shared secret

Set a shared secret on the Pulumi webhook. Without one, deliveries are unsigned and fail verification.

The secret is optional in Pulumi and you choose it yourself (for example a random string from `openssl rand -hex 32`). Store it as `PULUMI_WEBHOOK_SECRET` and use it as plain UTF-8 text: don't hex- or base64-decode it. Pulumi sends the `Pulumi-Webhook-Signature` header only when a secret is set.

## Register Your Endpoint

1. In Pulumi Cloud, open the webhooks settings for your organization (or a single stack) and create a webhook.
2. Use the generic JSON webhook, the one that takes a shared secret and sends the payloads described in [overview.md](overview.md).
3. Enter your endpoint URL and the shared secret.
4. Select the events to receive. Useful ones: stack updates (succeeded and failed), deployments, drift detection and policy violations.

## Testing

Trigger a stack update or a preview. For local development:

```bash
npx hookdeck-cli listen 3000 pulumi --path /webhooks/pulumi
```

Use the Hookdeck URL as the webhook's payload URL. Pulumi Cloud keeps recent deliveries, so you can redeliver one unchanged from the console after fixing your handler.
