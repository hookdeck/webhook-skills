# Setting Up FullEnrich Webhooks

## Prerequisites

- A FullEnrich account with API access
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI locally)

## Get Your Signing Key

FullEnrich has no separate webhook secret. Webhooks are signed with your **FullEnrich API key**.

1. Open the [FullEnrich API dashboard](https://app.fullenrich.com/app/api).
2. Copy your API key and store it as `FULLENRICH_API_KEY`.
3. If you regenerate the key, update the verifier too, or verification fails.

## Register Your Endpoint

Webhooks are configured per request, in the body of Start Bulk Enrichment or Reverse Email Lookup:

```json
{
  "name": "My Enrichment",
  "webhook_url": "https://your-server.com/webhooks/fullenrich",
  "webhook_events": {
    "contact_finished": "https://your-server.com/webhooks/fullenrich"
  },
  "data": [
    { "first_name": "John", "last_name": "Doe", "domain": "example.com", "custom": { "user_id": "12584" } }
  ]
}
```

Use `webhook_url` for the batch result, `webhook_events.contact_finished` for each contact as it completes, or both.

## Hookdeck Setup

FullEnrich signs webhooks with your FullEnrich API key. Paste that key here: create a FullEnrich source in Hookdeck and enter the API key as the signing secret. Then use the Hookdeck source URL as `webhook_url`.

## Local Development

```bash
npx hookdeck-cli listen 3000 fullenrich --path /webhooks/fullenrich
```

For FastAPI use port `8000`. Use the printed URL as `webhook_url`.

## Testing

Use [webhook.site](https://webhook.site) to inspect payloads, or start a small enrichment against your tunnel. Express handlers must read the raw body with `express.raw({ type: '*/*' })` so any content type verifies.
