# Setting Up pganalyze Webhooks

## Prerequisites

- A pganalyze organization with Webhooks enabled (Early Access: reach out to pganalyze if you don't see the panel)
- Organization-wide **modify** permission to add or change webhooks (other members can view webhooks and deliveries for servers they have access to)
- Your application's public HTTPS webhook URL (use the Hookdeck CLI for local development)

## How Do I Add a Webhook?

1. Go to **Settings > Integrations**.
2. In the **Webhooks** panel, click **Add Webhook**.
3. Enter a name and the URL. The URL must use HTTPS and resolve to a public address.
4. Optionally add request headers, such as an `Authorization` header your receiver requires.
5. Copy the **Signing secret** and configure your receiver to verify requests.
6. Click **Test and Add**. pganalyze sends a `ping` event and only adds the webhook if it succeeds.

Changing the URL or request headers later requires a new successful test.

## Where Is My Signing Secret?

One signing secret is shared by all webhooks in the organization. Members with modify permissions can reveal and copy it in the Webhooks panel. It starts with `whsec_` (the Add Webhook form shows it masked as `whsec_****…`). Store the full value, prefix included, in `PGANALYZE_WEBHOOK_SECRET`. Keep it out of client-side code and version control.

## How Do I Rotate the Signing Secret?

Click **Rotate secret** in the Webhooks panel. For 7 days, requests are signed with both the new and the old secret, so the `webhook-signature` header carries two `v1,` entries and you can update your receivers without downtime. Verifiers that try every `v1,` entry (the examples do) accept either secret during the overlap.

## How Do I Route Issues to the Webhook?

A webhook only receives issues that an alert rule routes to it:

1. Go to **Alerts & Check-Up > Alert Destinations** and add the webhook to a destination.
2. On the **Alert Rules** tab, route the checks you want to that destination.

See pganalyze's Alerting documentation for how destinations and rules work.

## How Do I Test and Debug Deliveries?

- Open a webhook's name in the Webhooks panel and choose **Send test** to deliver a signed `ping`.
- The webhook's details list deliveries from the last 30 days, filterable by status. Click a delivery's time to see its attempts, the response body excerpt and the payload. Test requests are not listed.
- Local handler: start a tunnel and add its URL as the webhook URL.

```bash
# Express / Next.js (use 8000 for FastAPI). No install or account required.
npx hookdeck-cli listen 3000 pganalyze --path /webhooks/pganalyze
```

## What Happens When Deliveries Fail?

Timeouts, connection and TLS errors, and `5xx`, `408`, `425` and `429` responses are retried up to 7 attempts over about 4 hours. Other responses fail immediately and redirects are not followed. If 20 deliveries in a row fail over more than 24 hours, pganalyze disables the webhook and e-mails organization members with manage permissions. A disabled webhook receives no requests and pending deliveries show as "Not sent (webhook disabled)". To enable it again, click **Test and enable**.
