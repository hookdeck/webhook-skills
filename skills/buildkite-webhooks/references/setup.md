# Setting Up Buildkite Webhooks

## Prerequisites

- Buildkite organization admin access (to reach Notification Services)
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Register Your Endpoint

1. Go to **Settings** in the global navigation → **Notification Services**.
2. Select **Add** next to **Webhook**.
3. Enter a **Description** and your **Webhook URL**. If you use self-signed certificates, clear **Verify TLS Certificates**.
4. Choose how the token is sent (see below).
5. Select the **Events** to subscribe to, e.g. `build.finished`, `job.finished`.
6. Optionally limit job events to queues, choose pipelines, and set **Branch filtering**.
7. Select **Add Webhook Notification**.

## Get Your Token

The **Token** field on the webhook holds the secret. Set `BUILDKITE_WEBHOOK_TOKEN` to this value.

Your selection decides which header Buildkite sends:

| Mode | Header | Notes |
|------|--------|-------|
| Token (default) | `X-Buildkite-Token: <token>` | Plain text compare; the token is visible to anyone who can read the request |
| Signature | `X-Buildkite-Signature: timestamp=...,signature=...` | HMAC-SHA256 keyed with the token; more secure |

Only one of the two headers is sent on each request.

## Testing

Saving the webhook settings triggers a `ping` event. Use **Load recent requests** at the bottom of the settings page to inspect the last 20 deliveries and your responses.

```bash
npx hookdeck-cli listen 3000 buildkite --path /webhooks/buildkite
```

Use the Hookdeck URL as the webhook URL.
