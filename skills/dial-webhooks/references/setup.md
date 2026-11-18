# Setting Up Dial Webhooks

## Prerequisites

- A Dial account and API key (dashboard, or `dial onboard` with the Dial CLI)
- A public HTTPS endpoint (use the Hookdeck CLI locally)

## Create the Subscription

From the [dashboard Webhooks page](https://getdial.ai/dashboard/webhooks), or via the API:

```bash
curl -X POST https://api.getdial.ai/api/v1/webhooks \
  -H "Authorization: Bearer $DIAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "targetUrl": "https://yourapp.com/webhooks/dial", "eventTypes": ["*"] }'
```

- `targetUrl` must be **HTTPS** and must not point at a private, loopback or link-local
  address (so a plain `http://localhost` URL is rejected; tunnel it instead).
- `eventTypes` is `["*"]` (every event, including types added later) or a list such as
  `["message.received", "call.ended"]`.

The response is `{ "webhook": { "id", "targetUrl", "eventTypes", "secretMasked", ... } }`.

## Get the Signing Secret

```bash
curl https://api.getdial.ai/api/v1/webhooks/$WEBHOOK_ID/secret \
  -H "Authorization: Bearer $DIAL_API_KEY"
# { "secret": "whsec_..." }
```

Save the **whole value, `whsec_` prefix included**, as `DIAL_WEBHOOK_SECRET`. The
dashboard masks it and copies it on demand. Each subscription has its own secret.

## Test the Webhook

Click **Fire ping** in the dashboard, or:

```bash
curl -X POST https://api.getdial.ai/api/v1/webhooks/$WEBHOOK_ID/ping \
  -H "Authorization: Bearer $DIAL_API_KEY"
```

This sends a signed `webhook.ping` (`data: {}`) to that subscription only, ignoring its
`eventTypes` filter. When your endpoint answers 2xx, the dashboard shows the time as
**Last ping**. Text one of your Dial numbers to see a real `message.received`.

Other management calls: `GET /api/v1/webhooks`, `GET /api/v1/webhooks/{id}`,
`DELETE /api/v1/webhooks/{id}`.

## Hookdeck Setup: Timestamp Window

Dial signs a timestamp into every delivery. When Hookdeck sits in front of your
handler, its retries and replays forward the original `X-Dial-Signature`, so the
timestamp can be older than 5 minutes. Set `DIAL_WEBHOOK_TOLERANCE_SECONDS` to a larger
value (or `0` to skip the check) on the handler behind Hookdeck, and dedupe on
`X-Dial-Event-ID`.

## Local Development

```bash
npx hookdeck-cli listen 3000 dial --path /webhooks/dial
```

Use the printed HTTPS URL as the subscription's `targetUrl`, then fire a ping.
