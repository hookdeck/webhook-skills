# Setting Up MeetGeek Webhooks

## Prerequisites

- A MeetGeek account with access to the Public API
- Your application's webhook endpoint URL (POST)

## Register Your Endpoint

1. Open the **Integrations** page in MeetGeek and go to the **Public API** section.
2. Enter your webhook URL there. There is one webhook URL per user.
3. MeetGeek calls it when a meeting's analysis finishes (success or failure).

## Get Your Webhook Secret

MeetGeek's docs refer to "the configured secret" for the Public API webhook but do not say where it is shown (presumably next to the webhook URL in the Public API section). Store it as `MEETGEEK_WEBHOOK_SECRET` and use it as UTF-8 bytes, as-is.

## Setup with Hookdeck

Paste the webhook secret configured for the MeetGeek Public API. Deliveries without a signature fail verification.

## Local Development

```bash
npx hookdeck-cli listen 3000 meetgeek --path /webhooks/meetgeek
```

## Testing

Finish a meeting analysis in MeetGeek, or send your own signed POST (see [verification.md](verification.md) for the signing command). Respond `200` quickly so MeetGeek does not retry.
