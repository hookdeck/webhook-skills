# Setting Up Didit Webhooks

Docs: [Didit Webhooks](https://docs.didit.me/integration/webhooks)

## Prerequisites

- A Didit account (Business Console access)
- A publicly reachable HTTPS endpoint that accepts POST requests and answers directly (no redirects). Didit blocks private and localhost URLs, so use a tunnel for local development

## Register Your Endpoint

In **Business Console > API & Webhooks**, click **Add destination**, or call `POST /v3/webhook/destinations/`:

1. Set a `label` and your public `url`, e.g. `https://your-app.example.com/webhooks/didit`
2. Set `webhook_version` to `"v3"`
3. Set `subscribed_events`. At least one is required and there is no wildcard. Recommended to start: `status.updated`, `data.updated`

## Get Your Signing Secret

The create response returns the destination's `secret_shared_key`. **Store it immediately**: it is the only time you will see it. It is scoped to that destination, so each destination has its own secret.

```bash
DIDIT_WEBHOOK_SECRET=your_secret_shared_key
```

Use it as a raw string (don't base64-decode or strip a prefix).

## Test Your Endpoint

**Business Console > API & Webhooks > Try Webhook** sends fully-formed sample payloads (approved, declined, in-review, KYB, entity, transaction) signed exactly like production traffic. Test deliveries have an `X-Didit-Test-Webhook: true` header.

Watch the destination's **Deliveries** tab to see each attempt and replay any of them.

## Firewall and WAF

If a WAF such as Cloudflare blocks unknown clients, allow `18.203.201.92` (`User-Agent: DiditWebhook/2.0`).

## Local Development

```bash
npx hookdeck-cli listen 3000 didit --path /webhooks/didit
```

Use the tunnel URL it prints as the destination `url`.

## Sandbox vs Live

Payloads carry `environment: "live"` or `"sandbox"`. Check it if one destination receives both.
