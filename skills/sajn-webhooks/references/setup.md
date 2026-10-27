# Setting Up sajn Webhooks

## Prerequisites

- A sajn workspace with API access: Team plan or higher (a sandbox organization always has it)
- The **Hantera webhooks** (Manage webhooks) permission in the workspace, or an API key for it
- A public HTTPS URL for your endpoint (for local development, use the Hookdeck CLI below)

## Which API Version Must the Endpoint Use?

Create the sajn webhook endpoint on API version 2026-10 or later. Endpoints on the deprecated 2026-09 version sign with X-Sajn-Signature instead of Standard Webhooks and fail verification.

Set it explicitly with `"apiVersion": "2026-10"` and the `Sajn-Version: 2026-10` header, or pick it in the dashboard form. To move an existing endpoint, `PATCH /api/v1/webhooks/{id}` with `{"apiVersion": "2026-10"}` after updating your handler for the new body, then rotate the secret so it is a `whsec_` secret every Standard Webhooks library accepts.

## How Do I Add a sajn Webhook in the Dashboard?

1. Go to [app.sajn.se](https://app.sajn.se) **Inställningar > Utvecklare > Webhooks**.
2. Click **Skapa webhook** (Create webhook).
3. Enter your **Webhook URL** (HTTPS), for example `https://your-app.com/webhooks/sajn`.
4. Select **Händelser** (Events), for example `document.completed`, `document.party.signed`, `document.party.delivery_failed`.
5. Set **API-version** to `2026-10` or later.
6. Leave **Hemlighet** (Secret) empty so sajn generates one.
7. Click **Skapa webhook**. An organization administrator can pick **Alla arbetsytor** to receive every workspace's events (requires `2026-10`).

Before saving, sajn sends an **unsigned** `POST` with the body `{"test": true}` and user agent `sajn-webhook-validator/1.0`. The save fails if the URL times out after 5 s, redirects, returns `404`, or returns a `2xx` HTML page. The `400` your signature check returns for that request passes.

## How Do I Create a Webhook With the API?

```bash
curl -X POST https://app.sajn.se/api/v1/webhooks \
  -H "Authorization: Bearer $SAJN_API_KEY" \
  -H "Sajn-Version: 2026-10" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/sajn",
    "events": ["document.completed", "document.party.signed"],
    "apiVersion": "2026-10"
  }'
```

`url` must be HTTPS and resolve to a public address. `events` is required and replaced as a whole on `PATCH`. Optional: `enabled`, `failureNotificationEmail` (emailed when sajn pauses the endpoint), and a custom `secret` (`whsec_` plus base64 of 24 to 64 random bytes).

## Where Do I Find the Signing Secret?

The response contains `secret` (`whsec_...`). sajn returns it **only** on create and when you rotate it, so store it now as `SAJN_WEBHOOK_SECRET`. Each endpoint (and environment) has its own secret. If you lose it, rotate:

```bash
curl -X POST https://app.sajn.se/api/v1/webhooks/$WEBHOOK_ID/rotate-secret \
  -H "Authorization: Bearer $SAJN_API_KEY" -H "Sajn-Version: 2026-10"
```

For 24 hours after a rotation every delivery carries two signatures (new and old), so you can deploy the new secret without downtime.

## How Do I Test a sajn Webhook?

`POST /api/v1/webhooks/{id}/test` sends a signed `webhook.test` event to that webhook only. Each attempt, with its status code and response, shows in **Inställningar > Utvecklare > Loggar** and in `GET /api/v1/webhooks/{id}/deliveries`.

### Local development with Hookdeck CLI

```bash
# Express / Next.js (use 8000 for FastAPI). No install or account required.
npx hookdeck-cli listen 3000 sajn --path /webhooks/sajn
```

Use the URL it prints as the webhook URL. Production endpoints must be public HTTPS; sajn rejects private, loopback and link-local hosts.

## Sandbox vs Production

A sandbox organization sends events with `"environment": "SANDBOX"`. Secrets are per endpoint and environment, so keep one `SAJN_WEBHOOK_SECRET` per deployment, or read `environment` when both post to the same URL.

## Managing Endpoints

`PATCH /api/v1/webhooks/{id}` changes `url`, `events`, `enabled` or `apiVersion`. A paused endpoint (`status: PAUSED`) must be reactivated explicitly; setting `enabled` doesn't lift a pause. See [Manage webhook endpoints](https://docs.sajn.se/webhooks/manage-endpoints).
