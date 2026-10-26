# Setting Up Laso Finance Webhooks

## Prerequisites

- A Laso Finance account and a Bearer token from `/auth` (`$ID_TOKEN` below)
- A public HTTPS URL for your handler (use the Hookdeck CLI for local development)

## How Do I Register a Webhook?

Webhooks are registered through the API, not a dashboard:

```bash
curl -X POST https://laso.finance/register-webhook \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://agent.example.com/webhooks/laso-finance"}'
```

The response:

```json
{
  "registered": true,
  "url": "https://agent.example.com/webhooks/laso-finance",
  "secret": "whsec_EXAMPLEONLYnotarealsecretAAAAAAA",
  "signing": "standard-webhooks"
}
```

There is no event selection: the one webhook receives every notification. Registering also sends a first signed test delivery (`type` of `notification.account`) to the new URL and tells the account owner, through their other channels, that an agent registered a webhook. The test delivery is not a challenge: it needs no special response beyond a `2xx`.

## Where Is My Signing Secret?

Only in the `POST /register-webhook` response. Store the full value, `whsec_` prefix included, in `LASO_FINANCE_WEBHOOK_SECRET` straight away. `GET /get-webhook` never returns it, and the docs don't describe another way to read it back. Keep it out of client-side code and version control.

There is one secret per account. **Registering again replaces the URL and rotates the secret**, so update `LASO_FINANCE_WEBHOOK_SECRET` when you re-register; the docs describe no grace period for the old secret.

## How Do I Check or Remove the Webhook?

```bash
curl https://laso.finance/get-webhook -H "Authorization: Bearer $ID_TOKEN"
```

Returns the registered URL, the `disabled` state, `consecutive_failures`, and the status, timestamp and detail of the last delivery attempt. To remove it, `POST /delete-webhook`. The owner keeps receiving notifications through their other channels; only the webhook deliveries stop.

## How Do I Test My Handler?

Registering sends one signed `notification.account` delivery. To get another, register again (which rotates the secret). For local development, run a tunnel without an account and register the printed URL:

```bash
# Express / Next.js (use 8000 for FastAPI)
npx hookdeck-cli listen 3000 laso-finance --path /webhooks/laso-finance
```

## What Happens When Deliveries Fail?

Deliveries time out after 10 seconds and are not retried. After 50 consecutive failures the registration is disabled and deliveries stop until you register again. Respond with any `2xx` quickly and do your processing afterwards. Because nothing is retried, put Hookdeck in front of the handler if you need queueing, retries and replay on your side.

## IP Allowlists

The docs publish no source IP list. Verify `webhook-signature` rather than allowlisting.
